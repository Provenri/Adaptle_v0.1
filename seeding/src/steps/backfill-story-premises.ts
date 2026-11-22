import { z } from "zod";

import { mapConcurrent } from "../lib/concurrency.js";
import { requireEnv } from "../lib/env.js";
import { createOpenAiClient, type LlmJsonClient } from "../lib/llm.js";
import { fetchJson } from "../lib/http.js";
import { writeCheckpoint } from "../lib/checkpoint.js";
import { hasComparableLength, reviewPremiseDecoys } from "./premise-quality.js";

type CatalogBook = {
  isbn13: string;
  book_title: string;
  author: string;
  genre: string | null;
  setting_hint: string | null;
  character_hint: string | null;
  premise_short: string | null;
  premise_decoys: string[] | null;
  premise_keywords: string[] | null;
};

const PREMISE_PUZZLE_SCHEMA = {
  type: "object",
  properties: {
    premise_short: {
      type: "string",
      description:
        "A one-line spoiler-free premise no longer than 70 characters",
    },
    premise_decoys: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
      description:
        "Two close, plausible but false one-line premises for this book",
    },
    premise_keywords: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4,
      description: "Two to four spoiler-free premise keyword clues",
    },
  },
  required: ["premise_short", "premise_decoys", "premise_keywords"],
  additionalProperties: false,
} as const;

const PremiseResponseSchema = z
  .object({
    premise_short: z.string().min(8).max(70),
    premise_decoys: z.array(z.string().min(8).max(70)).length(2),
    premise_keywords: z.array(z.string().min(1).max(24)).min(2).max(4),
  })
  .refine(
    (premises) =>
      new Set(
        [premises.premise_short, ...premises.premise_decoys].map((value) =>
          value.trim().toLocaleLowerCase(),
        ),
      ).size === 3,
    { message: "Premise answer and decoys must be distinct" },
  )
  .refine(
    (premises) =>
      premises.premise_decoys.every((decoy) =>
        hasComparableLength(premises.premise_short, decoy),
      ),
    { message: "Premise decoy lengths must be comparable to the answer" },
  );

const SYSTEM_PROMPT =
  "You write original, compelling, spoiler-free book premises. Never copy publisher blurbs, " +
  "reviews, or movie synopses. Describe the central situation without outcomes, twists, or endings. " +
  "When writing decoys, keep them near the correct answer's genre, length, sentence shape, and specificity, " +
  "but change the central conflict, role, setting, or objective so each is genuinely false.";

export async function backfillPremisePuzzles(options: {
  limit?: number;
  apply: boolean;
  refreshDecoys?: boolean;
  isbn13?: string;
  client?: LlmJsonClient;
}): Promise<void> {
  const client = options.client ?? createOpenAiClient();
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const limit = options.limit ?? 500;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const missingFilter = options.refreshDecoys
    ? ""
    : "or=(premise_short.is.null,premise_decoys.is.null,premise_keywords.is.null)&";
  const isbnFilter = options.isbn13 ? `isbn13=eq.${options.isbn13}&` : "";
  const books =
    (await fetchJson<CatalogBook[]>(
      `${baseUrl}/rest/v1/catalog_items?${missingFilter}${isbnFilter}tmdb_id=not.is.null&select=isbn13,book_title,author,genre,setting_hint,character_hint,premise_short,premise_decoys,premise_keywords&limit=${limit}`,
      { headers },
    )) ?? [];

  const generated = await mapConcurrent(
    books,
    8,
    async (book) => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const raw = await client.completeJson({
            system: SYSTEM_PROMPT,
            prompt: buildPremisePrompt(
              book.book_title,
              book.author,
              book.genre,
              book.premise_short,
              book.setting_hint,
              book.character_hint,
            ),
            schemaName: "premise_puzzle",
            jsonSchema: PREMISE_PUZZLE_SCHEMA as unknown as Record<
              string,
              unknown
            >,
          });
          const rawRecord = raw as Record<string, unknown>;
          if (book.premise_short) rawRecord.premise_short = book.premise_short;
          if (book.premise_keywords)
            rawRecord.premise_keywords = book.premise_keywords;
          const generated = PremiseResponseSchema.parse(rawRecord);
          const premiseShort = generated.premise_short;
          const premiseLabels = [premiseShort, ...generated.premise_decoys].map(
            (value) => value.trim().toLocaleLowerCase(),
          );
          if (new Set(premiseLabels).size !== premiseLabels.length) {
            throw new Error(
              `Tailored decoys duplicate the premise for ${book.isbn13}`,
            );
          }
          const premiseDecoys = await reviewPremiseDecoys(
            client,
            book.book_title,
            book.author,
            premiseShort,
            generated.premise_decoys,
            book.setting_hint ?? undefined,
            book.character_hint ?? undefined,
          );
          return {
            ...book,
            premise_short: premiseShort,
            premise_decoys: premiseDecoys,
            premise_keywords:
              book.premise_keywords ?? generated.premise_keywords,
          };
        } catch (error) {
          lastError = error;
        }
      }
      console.warn(
        `  Decoy generation failed for ${book.isbn13} (${book.book_title}): ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`,
      );
      return null;
    },
    (completed) => {
      if (completed % 25 === 0 || completed === books.length) {
        console.log(`  ${completed}/${books.length} processed`);
      }
    },
  );
  const premises = generated.filter((item) => item !== null);

  if (options.apply) {
    for (const item of premises) {
      await fetchJson(
        `${baseUrl}/rest/v1/catalog_items?isbn13=eq.${item.isbn13}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: {
            premise_short: item.premise_short,
            premise_decoys: item.premise_decoys,
            premise_keywords: item.premise_keywords,
          },
        },
      );
    }
  }

  const report = {
    requested: books.length,
    generated: premises.length,
    failed: books.length - premises.length,
    applied: options.apply,
    failedItems: books
      .map((book, index) => ({ book, result: generated[index] }))
      .filter((entry) => entry.result === null)
      .map(({ book }) => ({
        isbn13: book.isbn13,
        title: book.book_title,
      })),
    refreshedDecoys: options.refreshDecoys === true,
    sample: premises.slice(0, 12).map((item) => ({
      isbn13: item.isbn13,
      title: item.book_title,
      author: item.author,
      premiseShort: item.premise_short,
      premiseDecoys: item.premise_decoys,
      premiseKeywords: item.premise_keywords,
    })),
  };
  writeCheckpoint("10-premise-puzzle-backfill", [report]);
  console.log(JSON.stringify(report, null, 2));
}

export function buildPremisePrompt(
  bookTitle: string,
  author: string,
  genre?: string | null,
  existingPremise?: string | null,
  settingHint?: string | null,
  characterHint?: string | null,
): string {
  return `Write puzzle content for "${bookTitle}" by ${author}.

Requirements:
- premise_short: a single sentence no longer than 70 characters${
    existingPremise
      ? `; return this existing correct premise unchanged: "${existingPremise}"`
      : ""
  }
- premise_decoys: exactly two false premises no longer than 70 characters
- Make all three premise labels similar in length, sentence style, and specificity
- Keep decoys plausible for the visible identity and ${genre ?? "the book's genre"}
- Story setting clue: ${settingHint ?? "not available"}
- Character-role clue: ${characterHint ?? "not available"}
- Make each decoy false by changing the central conflict, role, setting, or objective
- Do not make a decoy obviously belong to another genre or story
- premise_keywords: two to four concise words or phrases drawn from the premise
- Describe the central situation or conflict without using the title, character names, or creators
- Do not name the ending, twists, or major revelations
- Do not copy publisher blurbs, reviews, book jackets, or film synopses
- Make the keywords useful as a hint without revealing the complete premise
- Return exactly three distinct premise labels`;
}

export const backfillStoryPremises = backfillPremisePuzzles;

import { z } from "zod";

import { mapConcurrent } from "../lib/concurrency.js";
import { requireEnv } from "../lib/env.js";
import { createOpenAiClient, type LlmJsonClient } from "../lib/llm.js";
import { fetchJson } from "../lib/http.js";
import { writeCheckpoint } from "../lib/checkpoint.js";

type CatalogBook = {
  isbn13: string;
  book_title: string;
  author: string;
  premise_short: string | null;
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
    premise_keywords: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4,
      description: "Two to four spoiler-free premise keyword clues",
    },
  },
  required: ["premise_short", "premise_keywords"],
  additionalProperties: false,
} as const;

const PremiseResponseSchema = z.object({
  premise_short: z.string().min(8).max(70),
  premise_keywords: z.array(z.string().min(1).max(24)).min(2).max(4),
});

const SYSTEM_PROMPT =
  "You write original, compelling, spoiler-free book premises. Never copy publisher blurbs, " +
  "reviews, or movie synopses. Describe the central situation without outcomes, twists, or endings.";

export async function backfillPremisePuzzles(options: {
  limit?: number;
  apply: boolean;
  client?: LlmJsonClient;
}): Promise<void> {
  const client = options.client ?? createOpenAiClient();
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const limit = options.limit ?? 500;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const books =
    (await fetchJson<CatalogBook[]>(
      `${baseUrl}/rest/v1/catalog_items?or=(premise_short.is.null,premise_keywords.is.null)&tmdb_id=not.is.null&select=isbn13,book_title,author,premise_short,premise_keywords&limit=${limit}`,
      { headers },
    )) ?? [];

  const generated = await mapConcurrent(
    books,
    8,
    async (book) => {
      const raw = await client.completeJson({
        system: SYSTEM_PROMPT,
        prompt: buildPremisePrompt(book.book_title, book.author),
        schemaName: "premise_puzzle",
        jsonSchema: PREMISE_PUZZLE_SCHEMA as unknown as Record<string, unknown>,
      });
      return { ...book, ...PremiseResponseSchema.parse(raw) };
    },
    (completed, failed) => {
      if (completed % 25 === 0 || completed === books.length) {
        console.log(
          `  ${completed}/${books.length} processed (${failed} failed)`,
        );
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
    sample: premises.slice(0, 12).map((item) => ({
      isbn13: item.isbn13,
      title: item.book_title,
      author: item.author,
      premiseShort: item.premise_short,
      premiseKeywords: item.premise_keywords,
    })),
  };
  writeCheckpoint("10-premise-puzzle-backfill", [report]);
  console.log(JSON.stringify(report, null, 2));
}

export function buildPremisePrompt(bookTitle: string, author: string): string {
  return `Write puzzle content for "${bookTitle}" by ${author}.

Requirements:
- premise_short: a single sentence no longer than 70 characters
- premise_keywords: two to four concise words or phrases drawn from the premise
- Describe the central situation or conflict without using the title, character names, or creators
- Do not name the ending, twists, or major revelations
- Do not copy publisher blurbs, reviews, book jackets, or film synopses
- Make the keywords useful as a hint without revealing the complete premise`;
}

export const backfillStoryPremises = backfillPremisePuzzles;

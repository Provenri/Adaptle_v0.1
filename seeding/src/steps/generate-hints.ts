import { z } from "zod";

import { readCheckpoint, writeCheckpoint } from "../lib/checkpoint.js";
import { mapConcurrent } from "../lib/concurrency.js";
import { createOpenAiClient, type LlmJsonClient } from "../lib/llm.js";
import {
  HintedBookSchema,
  TmdbEnrichedSchema,
  type HintedBook,
} from "../types.js";

/** Parallel LLM calls; comfortably within OpenAI rate limits. */
const CONCURRENCY = 8;

/**
 * Prompt A from Adaptle.md section 7. Input is strictly the factual book
 * title + author from Wikidata/Open Library — TMDB text is never passed in.
 */
export const HINT_SYSTEM_PROMPT =
  "You create factual, spoiler-free trivia hints for books and their screen adaptations. " +
  "Use completely original, neutral wording—never copy publisher blurbs or movie synopses. " +
  "Keep all hints strictly spoiler-free.";

export function buildHintPrompt(bookTitle: string, author: string): string {
  return `You are creating factual, spoiler-free trivia hints for the book "${bookTitle}" by ${author} and its screen adaptation.

Generate five short, original pieces:
1. story_premise: A compelling spoiler-free premise in 14-to-24 words describing the central situation without naming outcomes, twists, or endings.
2. setting_hint: A 4-to-8-word factual description of when and where the story takes place (e.g., "Dystopian 2019 Los Angeles" or "A Martian habitat in the near future").
3. character_hint: A 6-to-12-word factual description of the two lead characters' roles without naming them or spoiling the ending (e.g., "A weary detective and an experimental android").
4. premise_short: A single-sentence premise no longer than 70 characters. It is the correct answer in a three-choice puzzle and must avoid the book/film title, character names, creators, outcomes, twists, and endings.
5. premise_keywords: Two to four concise, spoiler-free words or phrases from the short premise that can be used as a final hint. They must not reveal the answer on their own.

STRICT RULES:
- Use completely original, neutral wording—never copy publisher blurbs or movie synopses.
- Keep all generated content strictly spoiler-free.`;
}

export const HINT_JSON_SCHEMA = {
  type: "object",
  properties: {
    story_premise: {
      type: "string",
      description: "14-24 word spoiler-free central story premise",
    },
    setting_hint: {
      type: "string",
      description: "4-8 word factual when/where description",
    },
    character_hint: {
      type: "string",
      description:
        "6-12 word factual description of the two lead character roles, unnamed",
    },
    premise_short: {
      type: "string",
      description: "One-line puzzle premise, at most 70 characters",
    },
    premise_keywords: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4,
      description: "Two to four spoiler-free premise keyword clues",
    },
  },
  required: [
    "story_premise",
    "setting_hint",
    "character_hint",
    "premise_short",
    "premise_keywords",
  ],
  additionalProperties: false,
} as const;

const HintResponseSchema = z.object({
  story_premise: z.string().min(10).max(240),
  setting_hint: z.string().min(3).max(120),
  character_hint: z.string().min(3).max(160),
  premise_short: z.string().min(8).max(70),
  premise_keywords: z.array(z.string().min(1).max(24)).min(2).max(4),
});

export async function generateHints(options: {
  limit?: number;
  client?: LlmJsonClient;
}): Promise<string> {
  const client = options.client ?? createOpenAiClient();
  const books = readCheckpoint("03-tmdb-enriched", TmdbEnrichedSchema);
  const slice = options.limit ? books.slice(0, options.limit) : books;
  console.log(
    `Generating hints for ${slice.length}/${books.length} books via ${client.model}...`,
  );

  const hinted: HintedBook[] = [];
  const results = await mapConcurrent(
    slice,
    CONCURRENCY,
    async (book) => {
      const raw = await client.completeJson({
        system: HINT_SYSTEM_PROMPT,
        prompt: buildHintPrompt(book.bookTitle, book.author),
        schemaName: "puzzle_hints",
        jsonSchema: HINT_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      const hints = HintResponseSchema.parse(raw);
      return HintedBookSchema.parse({
        ...book,
        storyPremise: hints.story_premise,
        settingHint: hints.setting_hint,
        characterHint: hints.character_hint,
        premiseShort: hints.premise_short,
        premiseKeywords: hints.premise_keywords,
      });
    },
    (completed, failed) => {
      if (completed % 25 === 0 || completed === slice.length) {
        console.log(
          `  ${completed}/${slice.length} processed (${failed} failed)`,
        );
      }
    },
  );
  for (const result of results) {
    if (result) hinted.push(result);
  }

  const path = writeCheckpoint("04-hinted-books", hinted);
  console.log(`Checkpoint written: ${path}`);
  return path;
}

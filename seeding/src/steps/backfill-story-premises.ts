import { z } from 'zod';

import { mapConcurrent } from '../lib/concurrency.js';
import { requireEnv } from '../lib/env.js';
import { createOpenAiClient, type LlmJsonClient } from '../lib/llm.js';
import { fetchJson } from '../lib/http.js';
import { writeCheckpoint } from '../lib/checkpoint.js';

type CatalogBook = {
  isbn13: string;
  book_title: string;
  author: string;
};

const PREMISE_SCHEMA = {
  type: 'object',
  properties: {
    story_premise: {
      type: 'string',
      description: '14-24 word compelling spoiler-free central premise',
    },
  },
  required: ['story_premise'],
  additionalProperties: false,
} as const;

const PremiseResponseSchema = z.object({
  story_premise: z.string().min(50).max(240),
});

const SYSTEM_PROMPT =
  'You write original, compelling, spoiler-free book premises. Never copy publisher blurbs, ' +
  'reviews, or movie synopses. Describe the central situation without outcomes, twists, or endings.';

export async function backfillStoryPremises(options: {
  limit?: number;
  apply: boolean;
  client?: LlmJsonClient;
}): Promise<void> {
  const client = options.client ?? createOpenAiClient();
  const baseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const limit = options.limit ?? 500;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const books =
    (await fetchJson<CatalogBook[]>(
      `${baseUrl}/rest/v1/catalog_items?story_premise=is.null&tmdb_id=not.is.null&select=isbn13,book_title,author&limit=${limit}`,
      { headers }
    )) ?? [];

  const generated = await mapConcurrent(
    books,
    8,
    async (book) => {
      const raw = await client.completeJson({
        system: SYSTEM_PROMPT,
        prompt: buildPremisePrompt(book.book_title, book.author),
        schemaName: 'story_premise',
        jsonSchema: PREMISE_SCHEMA as unknown as Record<string, unknown>,
      });
      const premise = PremiseResponseSchema.parse(raw).story_premise;
      return { ...book, storyPremise: premise };
    },
    (completed, failed) => {
      if (completed % 25 === 0 || completed === books.length) {
        console.log(`  ${completed}/${books.length} processed (${failed} failed)`);
      }
    }
  );
  const premises = generated.filter(
    (item): item is CatalogBook & { storyPremise: string } => item !== null
  );

  if (options.apply) {
    for (const item of premises) {
      await fetchJson(`${baseUrl}/rest/v1/catalog_items?isbn13=eq.${item.isbn13}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: { story_premise: item.storyPremise },
      });
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
      storyPremise: item.storyPremise,
    })),
  };
  writeCheckpoint('10-story-premise-backfill', [report]);
  console.log(JSON.stringify(report, null, 2));
}

export function buildPremisePrompt(bookTitle: string, author: string): string {
  return `Write one attractive, original, spoiler-free premise for "${bookTitle}" by ${author}.

Requirements:
- 14 to 24 words
- Describe the central situation or conflict
- Do not name the ending, twists, or major revelations
- Do not copy publisher blurbs, reviews, book jackets, or film synopses
- Suitable as a small editorial teaser for both the book and its screen adaptation`;
}

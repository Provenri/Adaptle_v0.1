import { z } from 'zod';

import { readCheckpoint, writeCheckpoint } from '../lib/checkpoint.js';
import { mapConcurrent } from '../lib/concurrency.js';
import { createOpenAiClient, type LlmJsonClient } from '../lib/llm.js';
import {
  CommonThreadSchema,
  HintedBookSchema,
  PAIR_MODES,
  THREAD_CATEGORIES,
  type CommonThread,
  type HintedBook,
  type PairMode,
} from '../types.js';

/** Open Library noise tags that would make meaningless "shared subject" pairs. */
const GENERIC_SUBJECTS = new Set([
  'fiction',
  'novel',
  'novels',
  'literature',
  'english literature',
  'american literature',
  'accessible book',
  'protected daisy',
  'in library',
  'large type books',
  'open library staff picks',
  'reading level-grade 9',
  'fiction in english',
  'translations into english',
]);

export interface CandidatePair {
  a: HintedBook;
  b: HintedBook;
  pairMode: PairMode;
  /** Factual anchor passed to the LLM, e.g. "Both books were written by X". */
  knownFact: string;
  /** When set, the LLM's connection_category must match. */
  expectedCategory: 'The Author' | 'The Director' | null;
}

function pairModeFor(index: number): PairMode {
  return PAIR_MODES[index % PAIR_MODES.length]!;
}

/**
 * Selects candidate pairs with a genuine, machine-verifiable or
 * subject-suggested commonality: same author, same director, or a shared
 * meaningful Open Library subject. Pair modes rotate BOOK/MOVIE/CROSSOVER.
 */
export function selectCandidatePairs(books: HintedBook[], count: number): CandidatePair[] {
  const pairs: CandidatePair[] = [];
  const used = new Set<string>();

  const tryAdd = (a: HintedBook, b: HintedBook, knownFact: string, expectedCategory: CandidatePair['expectedCategory']) => {
    if (pairs.length >= count || a.isbn13 === b.isbn13) return;
    const key = [a.isbn13, b.isbn13].sort().join('|');
    if (used.has(key)) return;
    used.add(key);
    pairs.push({ a, b, pairMode: pairModeFor(pairs.length), knownFact, expectedCategory });
  };

  const byAuthor = new Map<string, HintedBook[]>();
  const byDirector = new Map<string, HintedBook[]>();
  const bySubject = new Map<string, HintedBook[]>();

  for (const book of books) {
    const authorKey = book.author.toLowerCase();
    byAuthor.set(authorKey, [...(byAuthor.get(authorKey) ?? []), book]);
    // Wikidata P57 director only — TMDB-origin data never reaches LLM prompts.
    if (book.movieDirector) {
      const directorKey = book.movieDirector.toLowerCase();
      byDirector.set(directorKey, [...(byDirector.get(directorKey) ?? []), book]);
    }
    for (const subject of book.subjects) {
      const subjectKey = subject.toLowerCase().trim();
      if (subjectKey.length < 4 || GENERIC_SUBJECTS.has(subjectKey)) continue;
      bySubject.set(subjectKey, [...(bySubject.get(subjectKey) ?? []), book]);
    }
  }

  for (const group of byAuthor.values()) {
    for (let i = 0; i + 1 < group.length; i += 2) {
      tryAdd(
        group[i]!,
        group[i + 1]!,
        `Both source books were written by ${group[i]!.author}.`,
        'The Author'
      );
    }
  }

  for (const group of byDirector.values()) {
    for (let i = 0; i + 1 < group.length; i += 2) {
      tryAdd(
        group[i]!,
        group[i + 1]!,
        `Both screen adaptations were directed by ${group[i]!.movieDirector}.`,
        'The Director'
      );
    }
  }

  for (const [subject, group] of bySubject) {
    for (let i = 0; i + 1 < group.length; i += 2) {
      tryAdd(
        group[i]!,
        group[i + 1]!,
        `Both works share the factual subject tag "${subject}".`,
        null
      );
    }
  }

  return pairs.slice(0, count);
}

/**
 * Describes an item for the LLM using exclusively Wikidata-sourced (CC0)
 * fields: movieTitle is the Wikidata film label, movieDirector is P57, and
 * movieReleaseYear is P577. No TMDB-origin data is ever used here.
 */
function describeItem(book: HintedBook, as: 'book' | 'movie'): string {
  return as === 'book'
    ? `"${book.bookTitle}" (book by ${book.author}${book.bookPublicationYear ? `, ${book.bookPublicationYear}` : ''})`
    : `"${book.movieTitle}" (film${book.movieDirector ? ` directed by ${book.movieDirector}` : ''}${book.movieReleaseYear ? `, ${book.movieReleaseYear}` : ''})`;
}

/**
 * Prompt B from Adaptle.md section 7. All inputs are CC0 facts from
 * Wikidata/Open Library — no TMDB-origin data ever enters an LLM prompt.
 */
export function buildThreadPrompt(candidate: CandidatePair): string {
  const aKind = candidate.pairMode === 'MOVIE_PAIR' ? 'movie' : 'book';
  const bKind = candidate.pairMode === 'BOOK_PAIR' ? 'book' : 'movie';
  return `Given two works (${candidate.pairMode}):
Item A: ${describeItem(candidate.a, aKind)}
Item B: ${describeItem(candidate.b, bKind)}

Known fact: ${candidate.knownFact}

Identify ONE genuine, spoiler-free commonality they share from these categories:
${
    candidate.expectedCategory
      ? `"The Setting", "The Plot", "The Characters", "The Director", or "The Author".`
      : `"The Setting", "The Plot", or "The Characters". Do NOT use "The Director" or "The Author" — the works have different creators.`
  }

Provide:
1. connection_category: The matching category name.
2. connection_detail: A 3-to-6-word factual summary of the shared trait (e.g., "Hostile desert worlds" or "Directed by Denis Villeneuve").
3. Two plausible but FALSE decoy pairs (category + 3-to-6-word detail) that do NOT apply to both works. Each decoy must use a different category than the real connection and each other.

STRICT RULES:
- Use completely original, factual phrasing—never copy publisher blurbs or TMDB movie overviews.
- Keep all details strictly spoiler-free.`;
}

export const THREAD_SYSTEM_PROMPT =
  'You create factual, spoiler-free trivia for a book-and-movie puzzle game. ' +
  'Use completely original phrasing—never copy publisher blurbs or movie synopses.';

export const THREAD_JSON_SCHEMA = {
  type: 'object',
  properties: {
    connection_category: { type: 'string', enum: [...THREAD_CATEGORIES] },
    connection_detail: { type: 'string' },
    decoy_1_category: { type: 'string', enum: [...THREAD_CATEGORIES] },
    decoy_1_detail: { type: 'string' },
    decoy_2_category: { type: 'string', enum: [...THREAD_CATEGORIES] },
    decoy_2_detail: { type: 'string' },
  },
  required: [
    'connection_category',
    'connection_detail',
    'decoy_1_category',
    'decoy_1_detail',
    'decoy_2_category',
    'decoy_2_detail',
  ],
  additionalProperties: false,
} as const;

const ThreadResponseSchema = z.object({
  connection_category: z.enum(THREAD_CATEGORIES),
  connection_detail: z.string().min(3).max(80),
  decoy_1_category: z.enum(THREAD_CATEGORIES),
  decoy_1_detail: z.string().min(3).max(80),
  decoy_2_category: z.enum(THREAD_CATEGORIES),
  decoy_2_detail: z.string().min(3).max(80),
});

export async function generateThreads(options: {
  count: number;
  client?: LlmJsonClient;
}): Promise<string> {
  const client = options.client ?? createOpenAiClient();
  const books = readCheckpoint('04-hinted-books', HintedBookSchema);
  const candidates = selectCandidatePairs(books, options.count);
  console.log(
    `Generating ${candidates.length} common-thread pairs (requested ${options.count}) via ${client.model}...`
  );

  const threads: CommonThread[] = [];
  const results = await mapConcurrent(
    candidates,
    8,
    async (candidate) => {
      const raw = await client.completeJson({
        system: THREAD_SYSTEM_PROMPT,
        prompt: buildThreadPrompt(candidate),
        schemaName: 'common_thread',
        jsonSchema: THREAD_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      const parsed = ThreadResponseSchema.parse(raw);
      if (candidate.expectedCategory && parsed.connection_category !== candidate.expectedCategory) {
        throw new Error(
          `expected category ${candidate.expectedCategory}, got ${parsed.connection_category}`
        );
      }
      // Creator categories are only trustworthy when machine-verified from Wikidata/TMDB data.
      if (
        !candidate.expectedCategory &&
        (parsed.connection_category === 'The Author' || parsed.connection_category === 'The Director')
      ) {
        throw new Error(`unverified creator category ${parsed.connection_category}`);
      }
      return CommonThreadSchema.parse({
        pairMode: candidate.pairMode,
        itemAIsbn13: candidate.a.isbn13,
        itemBIsbn13: candidate.b.isbn13,
        connectionCategory: parsed.connection_category,
        connectionDetail: parsed.connection_detail,
        decoy1Category: parsed.decoy_1_category,
        decoy1Detail: parsed.decoy_1_detail,
        decoy2Category: parsed.decoy_2_category,
        decoy2Detail: parsed.decoy_2_detail,
      });
    },
    (completed, failed) => {
      if (completed % 10 === 0 || completed === candidates.length) {
        console.log(`  ${completed}/${candidates.length} processed (${failed} failed)`);
      }
    }
  );
  for (const result of results) {
    if (result) threads.push(result);
  }

  const path = writeCheckpoint('05-common-threads', threads);
  console.log(`Checkpoint written: ${path}`);
  return path;
}

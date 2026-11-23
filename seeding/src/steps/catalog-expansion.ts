import { z } from "zod";

import {
  checkpointPath,
  readCheckpoint,
  writeCheckpoint,
} from "../lib/checkpoint.js";
import { requireEnv } from "../lib/env.js";
import { fetchJson } from "../lib/http.js";
import {
  HintedBookSchema,
  TmdbEnrichedSchema,
  WikidataPairSchema,
  type HintedBook,
} from "../types.js";
import { enrichOpenLibrary } from "./enrich-openlibrary.js";
import { enrichTmdb } from "./enrich-tmdb.js";
import { buildSparqlQuery, parseSparqlResults } from "./fetch-wikidata.js";
import { generateHints } from "./generate-hints.js";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const SOURCE_LIMIT = 3_000;
const WINDOW_SIZE_MULTIPLIER = 1;

type SparqlResponse = {
  results: {
    bindings: Record<string, { type: string; value: string } | undefined>[];
  };
};

const ExpansionStateSchema = z.object({
  target: z.number().int().min(1),
  batchSize: z.number().int().min(1),
  productionCountAtStart: z.number().int().min(0),
  sourceFingerprint: z.string(),
  processedIsbns: z.array(z.string()),
  accepted: z.array(HintedBookSchema),
  rejected: z.array(
    z.object({
      isbn13: z.string(),
      stage: z.string(),
      reason: z.string(),
    }),
  ),
});
type ExpansionState = z.infer<typeof ExpansionStateSchema>;

export async function expandCatalog(options: {
  target: number;
  batchSize: number;
  apply: boolean;
}): Promise<void> {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const productionRows = await readProductionRows(baseUrl, serviceKey);
  const productionIsbns = new Set(productionRows.map((row) => row.isbn13));
  const productionWorks = new Set(
    productionRows.map((row) => normalizeWork(row.book_title, row.author)),
  );
  const adaptedCount = productionRows.filter(
    (row) => row.tmdb_id !== null,
  ).length;
  const needed = Math.max(0, options.target - adaptedCount);

  if (needed === 0) {
    console.log(
      `Target already reached: ${adaptedCount} adapted catalog rows.`,
    );
    return;
  }

  if (options.apply) {
    await applyReviewedBatch(baseUrl, serviceKey, options.target, needed);
    return;
  }

  const existingState = readExistingState(options.target, options.batchSize);
  const sourcePairs = existingState
    ? readCheckpoint("01-wikidata-pairs-full", WikidataPairSchema)
    : await fetchSourceCandidates();
  const sourceFingerprint = fingerprint(sourcePairs.map((pair) => pair.isbn13));
  const state = readOrCreateState(
    options.target,
    options.batchSize,
    adaptedCount,
    sourceFingerprint,
  );
  state.accepted = state.accepted.filter(
    (book) =>
      !productionWorks.has(normalizeWork(book.bookTitle, book.author)) &&
      !productionIsbns.has(book.isbn13),
  );
  state.accepted.sort(
    (a, b) => hybridExpansionScore(b) - hybridExpansionScore(a),
  );
  const acceptedIsbns = new Set(state.accepted.map((book) => book.isbn13));
  const freshByWork = new Map<string, (typeof sourcePairs)[number]>();
  for (const pair of sourcePairs) {
    const identity = normalizeWork(pair.bookTitle, pair.author);
    if (
      !productionIsbns.has(pair.isbn13) &&
      !productionWorks.has(identity) &&
      !acceptedIsbns.has(pair.isbn13) &&
      !state.processedIsbns.includes(pair.isbn13)
    ) {
      freshByWork.set(identity, freshByWork.get(identity) ?? pair);
    }
  }
  const candidates = [...freshByWork.values()].filter(
    (pair) =>
      !productionIsbns.has(pair.isbn13) &&
      !acceptedIsbns.has(pair.isbn13) &&
      !state.processedIsbns.includes(pair.isbn13),
  );

  const requested = Math.min(options.batchSize, needed);
  let cursor = 0;
  while (
    !isHybridMixReady(state.accepted, requested) &&
    cursor < candidates.length
  ) {
    const window = candidates.slice(
      cursor,
      cursor + options.batchSize * WINDOW_SIZE_MULTIPLIER,
    );
    cursor += window.length;
    await verifyCandidateWindow(window, state);
    writeCheckpoint("08-catalog-expansion-state", [state]);
  }

  if (!isHybridMixReady(state.accepted, requested)) {
    throw new Error(
      `Hybrid mix is not ready: ${recentCount(state.accepted)} recent and ${
        state.accepted.length - recentCount(state.accepted)
      } classic accepted books. Need ${Math.round(requested * 0.8)} recent and ${
        requested - Math.round(requested * 0.8)
      } classic.`,
    );
  }

  const batch = selectHybridBatch(state.accepted, requested);
  writeCheckpoint("04-hinted-books", batch);
  const report = {
    target: options.target,
    productionAdaptedAtStart: adaptedCount,
    requested: requested,
    accepted: batch.length,
    acceptedRows: batch.map((book) => ({
      isbn13: book.isbn13,
      title: book.bookTitle,
      author: book.author,
      publicationYear: book.bookPublicationYear,
      genre: book.genre,
      movie: book.tmdbTitle,
      releaseYear: book.releaseYear,
    })),
    sourceCandidates: sourcePairs.length,
    freshCandidatesRemaining: candidates.length,
    rejected: state.rejected,
    applied: options.apply,
  };
  writeCheckpoint("08-catalog-expansion-report", [report]);

  console.log(JSON.stringify(report, null, 2));
  console.log(
    "Dry run only. Review 08-catalog-expansion-report.json before using --apply.",
  );
}

async function applyReviewedBatch(
  baseUrl: string,
  serviceKey: string,
  target: number,
  needed: number,
): Promise<void> {
  const [report] = readCheckpoint(
    "08-catalog-expansion-report",
    z
      .object({
        target: z.number(),
        requested: z.number(),
        accepted: z.number(),
        acceptedRows: z.array(z.object({ isbn13: z.string() })).optional(),
        acceptedIsbns: z.array(z.string()).optional(),
        applied: z.boolean(),
      })
      .passthrough(),
  );
  if (!report || report.applied) {
    throw new Error("No unapplied reviewed batch is available.");
  }
  if (report.target !== target) {
    throw new Error(
      `Reviewed batch target ${report.target} does not match ${target}.`,
    );
  }
  const batch = readCheckpoint("04-hinted-books", HintedBookSchema);
  const manifestIsbns =
    report.acceptedRows?.map((row) => row.isbn13) ?? report.acceptedIsbns ?? [];
  if (
    batch.length !== report.accepted ||
    manifestIsbns.length !== batch.length ||
    batch.some((book) => !manifestIsbns.includes(book.isbn13))
  ) {
    throw new Error(
      "Reviewed manifest no longer matches 04-hinted-books.json.",
    );
  }
  if (batch.length > needed) {
    throw new Error(`Reviewed batch would exceed the ${target}-row target.`);
  }

  await applyCatalogBatch(baseUrl, serviceKey, batch);
  writeCheckpoint("08-catalog-expansion-report", [
    { ...report, applied: true },
  ]);
  try {
    const [state] = readCheckpoint(
      "08-catalog-expansion-state",
      ExpansionStateSchema,
    );
    if (state) {
      const applied = new Set(batch.map((book) => book.isbn13));
      state.accepted = state.accepted.filter(
        (book) => !applied.has(book.isbn13),
      );
      state.processedIsbns = [
        ...new Set([...state.processedIsbns, ...applied]),
      ];
      writeCheckpoint("08-catalog-expansion-state", [state]);
    }
  } catch {
    // The reviewed apply remains valid even if no resumable state exists yet.
  }
  console.log(
    `Applied reviewed batch: ${batch.length} fully playable adaptations.`,
  );
}

async function fetchSourceCandidates() {
  const query = buildSparqlQuery({
    limit: SOURCE_LIMIT,
    englishOnly: true,
    popularFirst: true,
  });
  const response = await fetchJson<SparqlResponse>(
    `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`,
    {
      headers: { Accept: "application/sparql-results+json" },
      retries: 4,
      retryDelayMs: 3_000,
    },
  );
  if (!response) throw new Error("Wikidata returned no expansion candidates.");
  const pairs = parseSparqlResults(response);
  writeCheckpoint("01-wikidata-pairs-full", pairs);
  writeCheckpoint("01-wikidata-pairs", pairs);
  return pairs;
}

async function verifyCandidateWindow(
  pairs: z.infer<typeof WikidataPairSchema>[],
  state: ExpansionState,
): Promise<void> {
  const unprocessed = pairs.filter(
    (pair) => !state.processedIsbns.includes(pair.isbn13),
  );
  if (unprocessed.length === 0) return;
  writeCheckpoint("01-wikidata-pairs", unprocessed);
  const beforeIsbns = unprocessed.map((pair) => pair.isbn13);
  const failed = new Set(beforeIsbns);
  let accepted: HintedBook[] = [];

  try {
    await enrichOpenLibrary({});
    await enrichTmdb({});
    const tmdbVerified = readCheckpoint("03-tmdb-enriched", TmdbEnrichedSchema);
    const tmdbIsbns = new Set(tmdbVerified.map((book) => book.isbn13));
    for (const isbn13 of beforeIsbns) {
      if (!tmdbIsbns.has(isbn13)) {
        recordRejection(
          state,
          isbn13,
          "tmdb",
          "Missing movie metadata or two lead characters.",
        );
      }
    }
    await generateHints({});
    accepted = readCheckpoint("04-hinted-books", HintedBookSchema);
    const acceptedSet = new Set(accepted.map((book) => book.isbn13));
    for (const isbn13 of beforeIsbns) {
      if (acceptedSet.has(isbn13)) failed.delete(isbn13);
      else if (!state.rejected.some((entry) => entry.isbn13 === isbn13)) {
        recordRejection(
          state,
          isbn13,
          "premise",
          "Failed premise or decoy quality validation.",
        );
      }
    }
  } catch (error) {
    for (const isbn13 of failed) {
      if (!state.rejected.some((entry) => entry.isbn13 === isbn13)) {
        recordRejection(
          state,
          isbn13,
          "verification",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    throw error;
  }

  const acceptedWorkKeys = new Set(
    state.accepted.map((book) => normalizeWork(book.bookTitle, book.author)),
  );
  state.accepted.push(
    ...accepted.filter((book) => {
      const key = normalizeWork(book.bookTitle, book.author);
      if (acceptedWorkKeys.has(key)) return false;
      acceptedWorkKeys.add(key);
      return true;
    }),
  );
  state.processedIsbns.push(...beforeIsbns);
  state.accepted = state.accepted.filter(
    (book, index, all) =>
      all.findIndex((candidate) => candidate.isbn13 === book.isbn13) === index,
  );
  state.accepted.sort(
    (a, b) => hybridExpansionScore(b) - hybridExpansionScore(a),
  );
}

function recordRejection(
  state: ExpansionState,
  isbn13: string,
  stage: string,
  reason: string,
): void {
  if (!state.rejected.some((entry) => entry.isbn13 === isbn13)) {
    state.rejected.push({ isbn13, stage, reason: reason.slice(0, 500) });
  }
}

async function applyCatalogBatch(
  baseUrl: string,
  serviceKey: string,
  books: HintedBook[],
): Promise<void> {
  for (let index = 0; index < books.length; index += 100) {
    await fetchJson(`${baseUrl}/rest/v1/catalog_items?on_conflict=isbn13`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: books.slice(index, index + 100).map((book) => ({
        isbn13: book.isbn13,
        book_title: book.bookTitle,
        author: book.author,
        genre: book.genre,
        cover_theme: book.coverTheme,
        metadata_source: "wikidata_openlibrary",
        number_of_pages: book.numberOfPages,
        publication_year: book.bookPublicationYear,
        tmdb_id: book.tmdbId,
        movie_title: book.tmdbTitle,
        release_year: book.releaseYear,
        director: book.director,
        movie_poster_path: book.moviePosterPath,
        lead_characters: book.leadCharacters,
        lead_actors: book.leadActors,
        setting_hint: book.settingHint,
        character_hint: book.characterHint,
        story_premise: book.storyPremise,
        premise_short: book.premiseShort,
        premise_decoys: book.premiseDecoys,
        premise_keywords: book.premiseKeywords,
        scheduled_date: null,
      })),
    });
  }
}

async function readProductionRows(baseUrl: string, serviceKey: string) {
  return (
    (await fetchJson<
      Array<{
        isbn13: string;
        book_title: string;
        author: string;
        tmdb_id: number | null;
      }>
    >(
      `${baseUrl}/rest/v1/catalog_items?select=isbn13,book_title,author,tmdb_id`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      },
    )) ?? []
  );
}

function readOrCreateState(
  target: number,
  batchSize: number,
  productionCountAtStart: number,
  sourceFingerprint: string,
): ExpansionState {
  try {
    const [state] = readCheckpoint(
      "08-catalog-expansion-state",
      ExpansionStateSchema,
    );
    if (state && state.target === target && state.batchSize === batchSize) {
      state.sourceFingerprint = sourceFingerprint;
      const seenWorks = new Set<string>();
      state.accepted = state.accepted.filter((book) => {
        const identity = normalizeWork(book.bookTitle, book.author);
        if (seenWorks.has(identity)) return false;
        seenWorks.add(identity);
        return true;
      });
      state.accepted.sort(
        (a, b) => hybridExpansionScore(b) - hybridExpansionScore(a),
      );
      return state;
    }
  } catch {
    // A new source snapshot intentionally starts a new resumable state.
  }
  const state: ExpansionState = {
    target,
    batchSize,
    productionCountAtStart,
    sourceFingerprint,
    processedIsbns: [],
    accepted: [],
    rejected: [],
  };
  console.log(
    `Created expansion state at ${checkpointPath("08-catalog-expansion-state")}.`,
  );
  return state;
}

function readExistingState(
  target: number,
  batchSize: number,
): ExpansionState | null {
  try {
    const [state] = readCheckpoint(
      "08-catalog-expansion-state",
      ExpansionStateSchema,
    );
    return state?.target === target && state.batchSize === batchSize
      ? state
      : null;
  } catch {
    return null;
  }
}

function fingerprint(values: string[]): string {
  return values.slice().sort().join("|");
}

function normalizeWork(title: string, author: string): string {
  return `${title}|${author}`
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function hybridExpansionScore(book: HintedBook): number {
  const popularity = normalizeLogScore(book.popularityScore, 6);
  const notability = normalizeLogScore(
    Math.log10(1 + book.sourceNotability),
    4,
  );
  const releaseYear = book.releaseYear ?? book.movieReleaseYear;
  const recency = releaseYear
    ? Math.min(1, Math.max(0, (releaseYear - 1996) / 30))
    : 0;
  return 0.5 * popularity + 0.3 * notability + 0.2 * recency;
}

function normalizeLogScore(value: number, ceiling: number): number {
  return Math.min(1, Math.max(0, value / ceiling));
}

export function selectHybridBatch(
  books: HintedBook[],
  requested: number,
): HintedBook[] {
  const ranked = books
    .slice()
    .sort((a, b) => hybridExpansionScore(b) - hybridExpansionScore(a));
  const recentTarget = Math.round(requested * 0.8);
  const recent = ranked.filter(
    (book) => (book.releaseYear ?? book.movieReleaseYear ?? 0) >= 1996,
  );
  const classics = ranked.filter(
    (book) => (book.releaseYear ?? book.movieReleaseYear ?? 0) < 1996,
  );
  const selected = [
    ...recent.slice(0, recentTarget),
    ...classics.slice(0, requested - Math.min(recent.length, recentTarget)),
  ];
  for (const book of ranked) {
    if (selected.length >= requested) break;
    if (!selected.includes(book)) selected.push(book);
  }

  return selected.sort(
    (a, b) => hybridExpansionScore(b) - hybridExpansionScore(a),
  );
}

function recentCount(books: HintedBook[]): number {
  return books.filter(
    (book) => (book.releaseYear ?? book.movieReleaseYear ?? 0) >= 1996,
  ).length;
}

export function isHybridMixReady(
  books: HintedBook[],
  requested: number,
): boolean {
  const recentTarget = Math.round(requested * 0.8);
  const classicTarget = requested - recentTarget;
  return (
    recentCount(books) >= recentTarget &&
    books.length - recentCount(books) >= classicTarget
  );
}

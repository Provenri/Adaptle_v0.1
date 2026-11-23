import { readCheckpoint, writeCheckpoint } from "../lib/checkpoint.js";
import { classifyCover } from "../lib/cover-theme.js";
import { fetchJson, sleep } from "../lib/http.js";
import {
  EnrichedBookSchema,
  WikidataPairSchema,
  type EnrichedBook,
} from "../types.js";

const OPEN_LIBRARY_BASE = "https://openlibrary.org";
/** Open Library asks clients to stay around 1 request/second. */
const REQUEST_DELAY_MS = 1_100;
/** Open Library intermittently resets connections; retry generously. */
const RETRY_OPTIONS = { retries: 5, retryDelayMs: 2_000 };

/**
 * Open Library responses — only uncopyrightable facts are read.
 * `description` and cover URLs are deliberately never touched (see Adaptle.md section 3).
 */
interface OpenLibraryEdition {
  title?: string;
  number_of_pages?: number;
  works?: { key: string }[];
  subjects?: string[];
}

interface OpenLibraryWork {
  subjects?: string[];
}

interface OpenLibrarySearchResponse {
  docs?: {
    readinglog_count?: number;
    ratings_count?: number;
    ratings_average?: number;
    edition_count?: number;
  }[];
}

export async function enrichOpenLibrary(options: {
  limit?: number;
}): Promise<string> {
  const pairs = readCheckpoint("01-wikidata-pairs", WikidataPairSchema);
  const slice = options.limit ? pairs.slice(0, options.limit) : pairs;
  console.log(
    `Enriching ${slice.length}/${pairs.length} pairs via Open Library (CC0)...`,
  );

  const enriched: EnrichedBook[] = [];
  let missing = 0;

  for (const [index, pair] of slice.entries()) {
    let edition: OpenLibraryEdition | null = null;
    try {
      edition = await fetchJson<OpenLibraryEdition>(
        `${OPEN_LIBRARY_BASE}/isbn/${pair.isbn13}.json`,
        { allow404: true, ...RETRY_OPTIONS },
      );
    } catch (error) {
      console.warn(
        `  Open Library unavailable for ${pair.isbn13}; continuing with sourced ISBN facts.`,
        error instanceof Error ? error.message : error,
      );
    }
    await sleep(REQUEST_DELAY_MS);

    let subjects = edition?.subjects ?? [];
    const workKey = edition?.works?.[0]?.key ?? null;

    // Editions are often sparsely tagged; the parent work usually has subjects.
    if (workKey && subjects.length === 0) {
      let work: OpenLibraryWork | null = null;
      try {
        work = await fetchJson<OpenLibraryWork>(
          `${OPEN_LIBRARY_BASE}${workKey}.json`,
          {
            allow404: true,
            ...RETRY_OPTIONS,
          },
        );
      } catch (error) {
        console.warn(
          `  Open Library work lookup unavailable for ${pair.isbn13}; keeping edition facts.`,
          error instanceof Error ? error.message : error,
        );
      }
      subjects = work?.subjects ?? [];
      await sleep(REQUEST_DELAY_MS);
    }

    if (!edition) missing++;

    const search = await fetchJson<OpenLibrarySearchResponse>(
      `${OPEN_LIBRARY_BASE}/search.json?q=isbn:${pair.isbn13}&limit=1&fields=readinglog_count,ratings_count,ratings_average,edition_count`,
      RETRY_OPTIONS,
    ).catch((error) => {
      console.warn(
        `  Open Library popularity unavailable for ${pair.isbn13}.`,
        error instanceof Error ? error.message : error,
      );
      return null;
    });
    await sleep(REQUEST_DELAY_MS);
    const popularity = search?.docs?.[0] ?? {};
    const { coverTheme, genre } = classifyCover(subjects);
    enriched.push(
      EnrichedBookSchema.parse({
        ...pair,
        subjects: subjects.slice(0, 20),
        genre,
        coverTheme,
        numberOfPages: edition?.number_of_pages ?? null,
        openLibraryWorkKey: workKey,
        readingLogCount: popularity.readinglog_count ?? 0,
        ratingsCount: popularity.ratings_count ?? 0,
        ratingsAverage: popularity.ratings_average ?? null,
        editionCount: popularity.edition_count ?? 0,
        popularityScore: calculatePopularityScore(popularity),
      }),
    );

    if ((index + 1) % 10 === 0 || index + 1 === slice.length) {
      console.log(
        `  ${index + 1}/${slice.length} processed (${missing} not in Open Library)`,
      );
    }
  }

  const path = writeCheckpoint("02-enriched-books", enriched);
  console.log(`Checkpoint written: ${path}`);
  return path;
}

export function calculatePopularityScore(value: {
  readinglog_count?: number;
  ratings_count?: number;
  ratings_average?: number;
  edition_count?: number;
}): number {
  const reading = Math.log10(1 + Math.max(0, value.readinglog_count ?? 0));
  const ratings = Math.log10(1 + Math.max(0, value.ratings_count ?? 0));
  const editions = Math.log10(1 + Math.max(0, value.edition_count ?? 0));
  const baseScore = 0.6 * reading + 0.25 * ratings + 0.15 * editions;
  const ratingFactor = Math.min(5, Math.max(0, value.ratings_average ?? 0)) / 5;
  const confidence = Math.min((value.ratings_count ?? 0) / 100, 1);
  return baseScore * (0.9 + 0.1 * ratingFactor * confidence);
}

import { readCheckpoint, writeCheckpoint } from '../lib/checkpoint.js';
import { classifyCover } from '../lib/cover-theme.js';
import { fetchJson, sleep } from '../lib/http.js';
import { EnrichedBookSchema, WikidataPairSchema, type EnrichedBook } from '../types.js';

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';
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

export async function enrichOpenLibrary(options: { limit?: number }): Promise<string> {
  const pairs = readCheckpoint('01-wikidata-pairs', WikidataPairSchema);
  const slice = options.limit ? pairs.slice(0, options.limit) : pairs;
  console.log(`Enriching ${slice.length}/${pairs.length} pairs via Open Library (CC0)...`);

  const enriched: EnrichedBook[] = [];
  let missing = 0;

  for (const [index, pair] of slice.entries()) {
    const edition = await fetchJson<OpenLibraryEdition>(
      `${OPEN_LIBRARY_BASE}/isbn/${pair.isbn13}.json`,
      { allow404: true, ...RETRY_OPTIONS }
    );
    await sleep(REQUEST_DELAY_MS);

    let subjects = edition?.subjects ?? [];
    const workKey = edition?.works?.[0]?.key ?? null;

    // Editions are often sparsely tagged; the parent work usually has subjects.
    if (workKey && subjects.length === 0) {
      const work = await fetchJson<OpenLibraryWork>(`${OPEN_LIBRARY_BASE}${workKey}.json`, {
        allow404: true,
        ...RETRY_OPTIONS,
      });
      subjects = work?.subjects ?? [];
      await sleep(REQUEST_DELAY_MS);
    }

    if (!edition) missing++;

    const { coverTheme, genre } = classifyCover(subjects);
    enriched.push(
      EnrichedBookSchema.parse({
        ...pair,
        subjects: subjects.slice(0, 20),
        genre,
        coverTheme,
        numberOfPages: edition?.number_of_pages ?? null,
        openLibraryWorkKey: workKey,
      })
    );

    if ((index + 1) % 10 === 0 || index + 1 === slice.length) {
      console.log(`  ${index + 1}/${slice.length} processed (${missing} not in Open Library)`);
    }
  }

  const path = writeCheckpoint('02-enriched-books', enriched);
  console.log(`Checkpoint written: ${path}`);
  return path;
}

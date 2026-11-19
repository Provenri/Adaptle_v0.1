import { readCheckpoint, writeCheckpoint } from '../lib/checkpoint.js';
import { requireEnv } from '../lib/env.js';
import { fetchJson, sleep } from '../lib/http.js';
import { EnrichedBookSchema, TmdbEnrichedSchema, type TmdbEnriched } from '../types.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
/** Stay well under TMDB's ~50 req/s limit. */
const REQUEST_DELAY_MS = 150;

/**
 * TMDB movie details with credits. Only factual metadata is read;
 * the `overview` text field is deliberately never stored or passed to an LLM.
 */
interface TmdbMovie {
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  credits?: {
    cast?: { name?: string; character?: string; order?: number }[];
    crew?: { name?: string; job?: string }[];
  };
}

/** Strips credit annotations like "(voice)" or "(uncredited)" from character names. */
export function cleanCharacterName(raw: string): string {
  return raw
    .replace(/\s*\((?:voice|uncredited|archive footage|singing voice)\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMovieFacts(movie: TmdbMovie): {
  title: string | null;
  releaseYear: number | null;
  director: string | null;
  posterPath: string | null;
  leadCharacters: string[];
  leadActors: string[];
} {
  const yearRaw = movie.release_date?.slice(0, 4);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;

  const director =
    movie.credits?.crew?.find((member) => member.job === 'Director' && member.name)?.name ?? null;

  const cast = [...(movie.credits?.cast ?? [])].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999)
  );
  const leadCharacters: string[] = [];
  const leadActors: string[] = [];
  for (const member of cast) {
    const character = member.character ? cleanCharacterName(member.character) : '';
    if (!character) continue;
    leadCharacters.push(character);
    if (member.name) leadActors.push(member.name);
    if (leadCharacters.length === 2) break;
  }

  return {
    title: movie.title?.trim() || null,
    releaseYear: Number.isFinite(year) ? year : null,
    director,
    posterPath: movie.poster_path ?? null,
    leadCharacters,
    leadActors,
  };
}

function tmdbAuth(apiKey: string): { url: (path: string) => string; headers: Record<string, string> } {
  // v4 Read Access Tokens are JWTs ("eyJ..."); v3 keys go in the query string.
  if (apiKey.startsWith('eyJ')) {
    return { url: (path) => `${TMDB_BASE}${path}`, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  return {
    url: (path) => `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${apiKey}`,
    headers: {},
  };
}

export async function enrichTmdb(options: { limit?: number }): Promise<string> {
  const apiKey = requireEnv('TMDB_API_KEY');
  const { url, headers } = tmdbAuth(apiKey);

  const books = readCheckpoint('02-enriched-books', EnrichedBookSchema);
  const slice = options.limit ? books.slice(0, options.limit) : books;
  console.log(`Enriching ${slice.length}/${books.length} items via TMDB...`);

  const enriched: TmdbEnriched[] = [];
  let skipped = 0;

  for (const [index, book] of slice.entries()) {
    const movie = await fetchJson<TmdbMovie>(
      url(`/movie/${book.tmdbId}?append_to_response=credits`),
      { headers, allow404: true }
    );
    await sleep(REQUEST_DELAY_MS);

    const facts = movie ? extractMovieFacts(movie) : null;
    // A puzzle needs exactly two lead characters for the matching round.
    if (!facts || !facts.title || facts.leadCharacters.length !== 2) {
      skipped++;
      continue;
    }

    enriched.push(
      TmdbEnrichedSchema.parse({
        ...book,
        tmdbTitle: facts.title,
        releaseYear: facts.releaseYear,
        director: facts.director,
        moviePosterPath: facts.posterPath,
        leadCharacters: facts.leadCharacters,
        leadActors: facts.leadActors,
      })
    );

    if ((index + 1) % 25 === 0 || index + 1 === slice.length) {
      console.log(`  ${index + 1}/${slice.length} processed (${skipped} skipped)`);
    }
  }

  console.log(`${enriched.length} playable items (${skipped} skipped: missing movie/characters).`);
  const path = writeCheckpoint('03-tmdb-enriched', enriched);
  console.log(`Checkpoint written: ${path}`);
  return path;
}

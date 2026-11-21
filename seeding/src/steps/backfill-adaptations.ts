import { requireEnv } from '../lib/env.js';

type CatalogRow = {
  isbn13: string;
  book_title: string;
  author: string;
  tmdb_id: number | null;
};

type ResolvedCandidate = {
  isbn13: string;
  tmdbId: number;
  movieTitle: string;
  releaseYear: number | null;
  director: string | null;
  moviePosterPath: string | null;
  leadActors: string[];
  leadCharacters: string[];
};

export async function backfillAdaptations(options: { apply: boolean; limit?: number }) {
  const baseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const limit = options.limit ?? 100;
  const rows = await request<CatalogRow[]>(
    `${baseUrl}/rest/v1/catalog_items?tmdb_id=is.null&select=isbn13,book_title,author,tmdb_id&limit=${limit}`,
    serviceKey
  );
  const candidates: ResolvedCandidate[] = [];
  const unresolved: string[] = [];

  for (const row of rows) {
    const resolved = await resolveViaBooksearch(baseUrl, row);
    if (resolved) candidates.push(resolved);
    else unresolved.push(`${row.isbn13} — ${row.book_title} — ${row.author}`);
  }

  if (options.apply) {
    for (const candidate of candidates) {
      await request(
        `${baseUrl}/rest/v1/catalog_items?isbn13=eq.${candidate.isbn13}`,
        serviceKey,
        'PATCH',
        {
          tmdb_id: candidate.tmdbId,
          movie_title: candidate.movieTitle,
          release_year: candidate.releaseYear,
          director: candidate.director,
          movie_poster_path: candidate.moviePosterPath,
          lead_actors: candidate.leadActors,
          lead_characters: candidate.leadCharacters,
        }
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        resolved: candidates.map((item) => ({
          isbn13: item.isbn13,
          tmdbId: item.tmdbId,
          movieTitle: item.movieTitle,
        })),
        unresolved,
        applied: options.apply,
      },
      null,
      2
    )
  );
}

async function resolveViaBooksearch(
  baseUrl: string,
  row: CatalogRow
): Promise<ResolvedCandidate | null> {
  const params = new URLSearchParams({
    action: 'resolve-adaptation',
    isbn: row.isbn13,
    title: row.book_title,
    author: row.author,
  });
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${baseUrl}/functions/v1/booksearch-proxy?${params}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) return null;
  const result = (await response.json()) as { items?: unknown[] };
  const candidate = result.items?.[0] as
    | {
        hasAdaptation?: boolean;
        tmdbId?: number;
        movieTitle?: string;
        releaseYear?: number | null;
        director?: string | null;
        moviePosterPath?: string | null;
        leadActors?: string[];
        leadCharacters?: string[];
      }
    | undefined;
  if (
    !candidate?.hasAdaptation ||
    typeof candidate.tmdbId !== 'number' ||
    !Array.isArray(candidate.leadActors) ||
    candidate.leadActors.length < 2 ||
    !Array.isArray(candidate.leadCharacters) ||
    candidate.leadCharacters.length < 2
  ) {
    return null;
  }
  return {
    isbn13: row.isbn13,
    tmdbId: candidate.tmdbId,
    movieTitle: candidate.movieTitle ?? row.book_title,
    releaseYear: candidate.releaseYear ?? null,
    director: candidate.director ?? null,
    moviePosterPath: candidate.moviePosterPath ?? null,
    leadActors: candidate.leadActors,
    leadCharacters: candidate.leadCharacters,
  };
}

async function request<T>(
  url: string,
  serviceKey: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${url} failed: ${response.status}`);
  return (await response.json()) as T;
}

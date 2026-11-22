/**
 * booksearch-proxy: book lookups for the "+ Add Book" flow.
 *
 * Actions (GET):
 *   ?action=search&q=atomic+habits   -> Open Library text search (top 10)
 *   ?action=isbn&isbn=9780735211292  -> Open Library ISBN lookup,
 *                                       Google Books as factual fallback
 *
 * Copyright guardrails: `description` fields and cover/image URLs are never
 * read from either upstream (see Adaptle.md section 3).
 */
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';
import { classifyCover } from '../_shared/cover-theme.ts';
import {
  type BookCandidate,
  filterPopularCandidates,
  fromGoogleBooksVolume,
  fromOpenLibraryDoc,
  type GoogleBooksVolume,
  normalizeIsbn13,
  type OpenLibrarySearchDoc,
  parsePublicationYear,
} from './normalize.ts';
import { filterByAdaptation, resolveAdaptations } from './adaptation-resolver.ts';
import { addPlayableCatalogFilters } from './practice-catalog.ts';
import {
  type BookSearchCacheDescriptor,
  buildCacheInput,
  cacheTtlSeconds,
  cleanExpiredCacheEntries,
  hashCacheInput,
  readCachedPayload,
  writeCachedPayload,
} from './cache.ts';

const OL_BASE = 'https://openlibrary.org';
const GB_BASE = 'https://www.googleapis.com/books/v1';
const UA = 'Adaptle/0.1 (https://github.com/Provenri/Adaptle_v0.1)';

async function searchOpenLibrary(query: string, limit = 10): Promise<BookCandidate[]> {
  const url = `${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=${
    [
      'title',
      'author_name',
      'isbn',
      'number_of_pages_median',
      'first_publish_year',
      'subject',
      'edition_count',
      'readinglog_count',
      'ratings_count',
      'ratings_average',
    ].join(',')
  }`;
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open Library search failed: ${response.status}`);
  const data = await response.json();
  const docs: OpenLibrarySearchDoc[] = data.docs ?? [];
  return docs
    .map(fromOpenLibraryDoc)
    .filter((c): c is BookCandidate => c !== null)
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.isbn13 === candidate.isbn13) === index
    )
    .slice(0, limit);
}

async function searchGoogleBooks(query: string): Promise<BookCandidate[]> {
  const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
  const keyParameter = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const response = await fetch(
    `${GB_BASE}/volumes?q=${encodeURIComponent(query)}&maxResults=10${keyParameter}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return [];
  const data = await response.json();
  const volumes: GoogleBooksVolume[] = data.items ?? [];
  return volumes
    .map((volume) => fromGoogleBooksVolume(volume, null))
    .filter((candidate): candidate is BookCandidate => candidate !== null)
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.isbn13 === candidate.isbn13) === index
    )
    .slice(0, 10);
}

async function searchKnownCatalog(
  query: string,
  adaptationsOnly: boolean,
): Promise<BookCandidate[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return [];

  const url = new URL(`${supabaseUrl}/rest/v1/catalog_items`);
  const term = `*${query.replaceAll(',', ' ')}*`;
  url.searchParams.set('or', `(book_title.ilike.${term},author.ilike.${term})`);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '10');
  if (adaptationsOnly) addPlayableCatalogFilters(url);

  const response = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) return [];
  const rows: Array<Record<string, unknown>> = await response.json();
  return rows.map(catalogRowToCandidate);
}

async function fetchJsonOrNull(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!response.ok) return null;
  return await response.json();
}

async function lookupOpenLibraryIsbn(isbn13: string): Promise<BookCandidate | null> {
  const response = await fetch(`${OL_BASE}/isbn/${isbn13}.json`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Library ISBN lookup failed: ${response.status}`);
  // Edition payload: read only factual fields (never `description`/covers).
  // deno-lint-ignore no-explicit-any
  const edition: any = await response.json();
  const title: string | undefined = edition.title?.trim();
  if (!title) return null;

  const workKey: string | undefined = edition.works?.[0]?.key;
  // deno-lint-ignore no-explicit-any
  let work: any = null;

  // Resolve the author: editions reference author keys directly, but many
  // editions carry no authors at all — then the parent work has them.
  let authorKey: string | undefined = edition.authors?.[0]?.key;
  if (!authorKey && workKey) {
    work = await fetchJsonOrNull(`${OL_BASE}${workKey}.json`);
    authorKey = work?.authors?.[0]?.author?.key;
  }
  let author: string | null = null;
  if (authorKey) {
    const authorRecord = await fetchJsonOrNull(`${OL_BASE}${authorKey}.json`);
    author = (authorRecord?.name as string | undefined) ?? null;
  }
  if (!author) return null;

  let subjects: string[] = (edition.subjects ?? []).slice(0, 20);
  if (subjects.length === 0 && workKey) {
    work = work ?? (await fetchJsonOrNull(`${OL_BASE}${workKey}.json`));
    subjects = ((work?.subjects as string[] | undefined) ?? []).slice(0, 20);
  }

  const { coverTheme, genre } = classifyCover(subjects);
  return {
    isbn13,
    title,
    author,
    numberOfPages: edition.number_of_pages ?? null,
    publicationYear: parsePublicationYear(edition.publish_date),
    subjects,
    genre,
    coverTheme,
    source: 'openlibrary_manual',
  };
}

async function lookupGoogleBooksIsbn(isbn13: string): Promise<BookCandidate | null> {
  const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
  const keyParameter = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const response = await fetch(
    `${GB_BASE}/volumes?q=isbn:${isbn13}&maxResults=1${keyParameter}`,
    {
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  const volume: GoogleBooksVolume | undefined = data.items?.[0];
  return volume ? fromGoogleBooksVolume(volume, isbn13) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'search') {
      const query = url.searchParams.get('q')?.trim();
      if (!query || query.length < 2) return errorResponse('q must be at least 2 characters', 400);
      const adaptationsOnly = url.searchParams.get('adaptations_only') === 'true';
      const popularOnly = url.searchParams.get('popular_only') === 'true';
      return await cachedItemsResponse({
        action,
        query,
        adaptationsOnly,
        popularOnly,
      }, async () => {
        const catalogCandidates = await searchKnownCatalog(query, adaptationsOnly);
        if (catalogCandidates.length > 0 && !popularOnly) return catalogCandidates;
        const openLibraryCandidates = await searchOpenLibrary(query, popularOnly ? 50 : 10);
        const catalogByIsbn = new Map(
          catalogCandidates.map((candidate) => [candidate.isbn13, candidate]),
        );
        const catalogByIdentity = new Map(
          catalogCandidates.map((candidate) => [candidateIdentity(candidate), candidate]),
        );
        const enrichedCatalogCandidates = openLibraryCandidates
          .map((candidate) => {
            const catalogCandidate = catalogByIsbn.get(candidate.isbn13) ??
              catalogByIdentity.get(candidateIdentity(candidate));
            return catalogCandidate ? { ...catalogCandidate, ...candidate } : null;
          })
          .filter((candidate): candidate is BookCandidate => candidate !== null);
        let candidates = catalogCandidates.length > 0
          ? enrichedCatalogCandidates
          : openLibraryCandidates;
        if (popularOnly) candidates = filterPopularCandidates(candidates);
        const fallbackCandidates = candidates.length > 0
          ? candidates
          : popularOnly
          ? []
          : await searchGoogleBooks(query);
        return adaptationsOnly
          ? filterByAdaptation(await resolveAdaptations(fallbackCandidates))
          : fallbackCandidates;
      });
    }

    if (action === 'isbn') {
      const isbn13 = normalizeIsbn13(url.searchParams.get('isbn') ?? '');
      if (!isbn13) return errorResponse('isbn must be a valid ISBN-13', 400);
      const adaptationsOnly = url.searchParams.get('adaptations_only') === 'true';
      return await cachedItemsResponse({
        action,
        isbn: isbn13,
        adaptationsOnly,
        popularOnly: false,
      }, async () => {
        const candidate = (await lookupOpenLibraryIsbn(isbn13)) ??
          (await lookupGoogleBooksIsbn(isbn13));
        if (!candidate) return [];
        return adaptationsOnly
          ? filterByAdaptation(await resolveAdaptations([candidate]))
          : [candidate];
      });
    }

    if (action === 'random') {
      const item = await randomAdaptation();
      return jsonResponse({ items: item ? [item] : [] });
    }

    if (action === 'resolve-adaptation') {
      const isbn13 = normalizeIsbn13(url.searchParams.get('isbn') ?? '');
      const title = url.searchParams.get('title')?.trim();
      const author = url.searchParams.get('author')?.trim();
      if (!isbn13 && (!title || !author)) {
        return errorResponse('isbn or title and author are required', 400);
      }
      return await cachedItemsResponse({
        action,
        isbn: isbn13 ?? undefined,
        title,
        author,
        adaptationsOnly: true,
        popularOnly: false,
      }, async () => {
        const candidate = isbn13 ? await lookupKnownCatalogAdaptationByIsbn(isbn13) : null;
        const resolved = candidate ??
          (title && author ? await lookupKnownCatalogAdaptation(title, author) : null);
        return resolved ? [resolved] : [];
      });
    }

    return errorResponse('action must be "search" or "isbn"', 400);
  } catch (_error) {
    return errorResponse('book lookup failed', 502);
  }
});

async function cachedItemsResponse(
  descriptor: BookSearchCacheDescriptor,
  loadItems: () => Promise<BookCandidate[]>,
): Promise<Response> {
  void cleanExpiredCacheEntries();
  const cacheKey = await hashCacheInput(buildCacheInput(descriptor));
  const cached = await readCachedPayload(cacheKey);
  if (isCachedItemsPayload(cached)) return jsonResponse(cached);

  const items = await loadItems();
  const payload = { items };
  await writeCachedPayload(cacheKey, payload, cacheTtlSeconds(descriptor, items.length));
  return jsonResponse(payload);
}

function isCachedItemsPayload(value: unknown): value is { items: BookCandidate[] } {
  return typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray(value.items);
}

async function lookupKnownCatalogAdaptationByIsbn(
  isbn13: string,
): Promise<BookCandidate | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  const response = await fetch(
    addPlayableCatalogFilters(
      new URL(
        `${supabaseUrl}/rest/v1/catalog_items?isbn13=eq.${isbn13}&select=*`,
      ),
    ),
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!response.ok) return null;
  const row = (await response.json())[0];
  return row ? catalogRowToCandidate(row) : null;
}

async function lookupKnownCatalogAdaptation(
  title: string,
  author: string,
): Promise<BookCandidate | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  const url = new URL(`${supabaseUrl}/rest/v1/catalog_items`);
  url.searchParams.set('book_title', `ilike.*${title.replace(/^the /i, '')}*`);
  url.searchParams.set('author', `ilike.*${author.trim().split(/\s+/).at(-1) ?? ''}*`);
  addPlayableCatalogFilters(url);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) return null;
  const row = (await response.json())[0];
  return row ? catalogRowToCandidate(row) : null;
}

function catalogRowToCandidate(row: Record<string, unknown>): BookCandidate {
  const tmdbId = typeof row.tmdb_id === 'number' ? row.tmdb_id : undefined;
  return {
    isbn13: String(row.isbn13),
    title: String(row.book_title),
    author: String(row.author),
    publicationYear: typeof row.publication_year === 'number' ? row.publication_year : null,
    numberOfPages: typeof row.number_of_pages === 'number' ? row.number_of_pages : null,
    genre: typeof row.genre === 'string' ? row.genre : null,
    coverTheme: classifyCover(row.genre ? [String(row.genre)] : []).coverTheme,
    subjects: row.genre ? [String(row.genre)] : [],
    source: 'openlibrary_manual',
    hasAdaptation: tmdbId !== undefined,
    tmdbId,
    movieTitle: row.movie_title ? String(row.movie_title) : undefined,
    releaseYear: typeof row.release_year === 'number' ? row.release_year : null,
    director: row.director ? String(row.director) : null,
    moviePosterPath: row.movie_poster_path ? String(row.movie_poster_path) : null,
    leadActors: Array.isArray(row.lead_actors) ? row.lead_actors as string[] : undefined,
    leadCharacters: Array.isArray(row.lead_characters)
      ? row.lead_characters as string[]
      : undefined,
    settingHint: row.setting_hint ? String(row.setting_hint) : undefined,
    characterHint: row.character_hint ? String(row.character_hint) : undefined,
    storyPremise: row.story_premise ? String(row.story_premise) : undefined,
    premiseShort: row.premise_short ? String(row.premise_short) : undefined,
    premiseKeywords: Array.isArray(row.premise_keywords)
      ? row.premise_keywords.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
}

function candidateIdentity(candidate: Pick<BookCandidate, 'title' | 'author'>): string {
  return `${normalizeSearchLabel(candidate.title)}|${normalizeSearchLabel(candidate.author)}`;
}

function normalizeSearchLabel(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function randomAdaptation(): Promise<BookCandidate | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;

  const countUrl = addPlayableCatalogFilters(
    new URL(`${supabaseUrl}/rest/v1/catalog_items?select=isbn13`),
  );
  const countResponse = await fetch(
    countUrl,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'count=exact',
      },
    },
  );
  const count = Number.parseInt(
    countResponse.headers.get('content-range')?.split('/')[1] ?? '0',
    10,
  );
  if (!Number.isFinite(count) || count < 1) return null;

  const offset = Math.floor(Math.random() * count);
  const itemUrl = addPlayableCatalogFilters(
    new URL(
      `${supabaseUrl}/rest/v1/catalog_items?select=isbn13,book_title,author,genre,cover_theme,publication_year,number_of_pages,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_actors,lead_characters,setting_hint,character_hint,story_premise,premise_short,premise_keywords&limit=1&offset=${offset}`,
    ),
  );
  const response = await fetch(
    itemUrl,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!response.ok) return null;
  const row = (await response.json())[0];
  if (!row) return null;
  return {
    isbn13: row.isbn13,
    title: row.book_title,
    author: row.author,
    numberOfPages: row.number_of_pages,
    publicationYear: row.publication_year,
    subjects: row.genre ? [row.genre] : [],
    genre: row.genre,
    coverTheme: row.cover_theme,
    source: 'openlibrary_manual',
    hasAdaptation: typeof row.tmdb_id === 'number',
    tmdbId: row.tmdb_id ?? undefined,
    movieTitle: row.movie_title ?? undefined,
    releaseYear: row.release_year ?? null,
    director: row.director ?? null,
    moviePosterPath: row.movie_poster_path ?? null,
    leadActors: row.lead_actors ?? undefined,
    leadCharacters: row.lead_characters ?? undefined,
    settingHint: row.setting_hint ?? undefined,
    characterHint: row.character_hint ?? undefined,
    storyPremise: row.story_premise ?? undefined,
    premiseShort: row.premise_short ?? undefined,
    premiseKeywords: Array.isArray(row.premise_keywords)
      ? row.premise_keywords.filter((value: unknown): value is string => typeof value === 'string')
      : undefined,
  };
}

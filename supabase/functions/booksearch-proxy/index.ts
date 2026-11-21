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
  fromGoogleBooksVolume,
  fromOpenLibraryDoc,
  type GoogleBooksVolume,
  normalizeIsbn13,
  type OpenLibrarySearchDoc,
  parsePublicationYear,
} from './normalize.ts';
import { filterByAdaptation, resolveAdaptations } from './adaptation-resolver.ts';

const OL_BASE = 'https://openlibrary.org';
const GB_BASE = 'https://www.googleapis.com/books/v1';
const UA = 'Adaptle/0.1 (https://github.com/Provenri/Adaptle_v0.1)';

async function searchOpenLibrary(query: string): Promise<BookCandidate[]> {
  const url = `${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=10&fields=${
    [
      'title',
      'author_name',
      'isbn',
      'number_of_pages_median',
      'first_publish_year',
      'subject',
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
    .slice(0, 10);
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
      const candidates = await searchOpenLibrary(query);
      const adaptationsOnly = url.searchParams.get('adaptations_only') === 'true';
      if (!adaptationsOnly) return jsonResponse({ items: candidates });
      return jsonResponse({ items: filterByAdaptation(await resolveAdaptations(candidates)) });
    }

    if (action === 'isbn') {
      const isbn13 = normalizeIsbn13(url.searchParams.get('isbn') ?? '');
      if (!isbn13) return errorResponse('isbn must be a valid ISBN-13', 400);
      const candidate = (await lookupOpenLibraryIsbn(isbn13)) ??
        (await lookupGoogleBooksIsbn(isbn13));
      if (!candidate) return jsonResponse({ items: [] });
      const adaptationsOnly = url.searchParams.get('adaptations_only') === 'true';
      const items = adaptationsOnly
        ? filterByAdaptation(await resolveAdaptations([candidate]))
        : [candidate];
      return jsonResponse({ items });
    }

    if (action === 'random') {
      const item = await randomAdaptation();
      return jsonResponse({ items: item ? [item] : [] });
    }

    return errorResponse('action must be "search" or "isbn"', 400);
  } catch (_error) {
    return errorResponse('book lookup failed', 502);
  }
});

async function randomAdaptation(): Promise<BookCandidate | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;

  const countResponse = await fetch(
    `${supabaseUrl}/rest/v1/catalog_items?select=isbn13&tmdb_id=not.is.null&scheduled_date=not.is.null`,
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
  const response = await fetch(
    `${supabaseUrl}/rest/v1/catalog_items?tmdb_id=not.is.null&scheduled_date=not.is.null&select=isbn13,book_title,author,genre,cover_theme,publication_year,number_of_pages&limit=1&offset=${offset}`,
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
    hasAdaptation: true,
  };
}

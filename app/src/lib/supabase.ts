import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { mmkvSupabaseStorage } from './local-storage';
import type { OfflineMutation } from './offline-queue';
import type { DailyScore } from './scores';
import type { BookCandidate, LibraryBook } from '@/data/library-data';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  client = createClient(url, anonKey, {
    auth: {
      storage: mmkvSupabaseStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export async function initializeAnonymousSession(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('Supabase is not configured; the app will continue using local data.');
    return;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return;

  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
}

export async function syncOfflineMutation(mutation: OfflineMutation): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('A signed-in user is required to sync local data');

  if (mutation.type === 'library-upsert') {
    const isbn13 = requiredString(mutation.payload.isbn13, 'isbn13');
    const status = requiredString(mutation.payload.status, 'status');
    if (!['TO_BE_READ', 'FINISHED', 'SNOOZE'].includes(status)) {
      throw new Error(`Unsupported library status "${status}"`);
    }

    const { data: catalogItem, error: catalogReadError } = await supabase
      .from('catalog_items')
      .select('isbn13')
      .eq('isbn13', isbn13)
      .maybeSingle();
    if (catalogReadError) throw catalogReadError;

    if (!catalogItem) {
      const { error: catalogInsertError } = await supabase.from('catalog_items').insert({
        isbn13,
        book_title: requiredString(mutation.payload.title, 'title'),
        author: requiredString(mutation.payload.author, 'author'),
        genre: optionalString(mutation.payload.genre),
        cover_theme: requiredString(mutation.payload.coverTheme, 'coverTheme'),
        metadata_source: optionalString(mutation.payload.source) ?? 'openlibrary_manual',
        publication_year:
          typeof mutation.payload.publicationYear === 'number'
            ? mutation.payload.publicationYear
            : null,
        number_of_pages:
          typeof mutation.payload.numberOfPages === 'number'
            ? mutation.payload.numberOfPages
            : null,
      });
      if (catalogInsertError) throw catalogInsertError;
    }

    const snoozedUntil =
      typeof mutation.payload.snoozedUntil === 'string' ? mutation.payload.snoozedUntil : null;
    const { error: shelfError } = await supabase.from('user_library').upsert(
      {
        user_id: user.id,
        isbn13,
        status,
        snoozed_until: status === 'SNOOZE' ? snoozedUntil : null,
      },
      { onConflict: 'user_id,isbn13' }
    );
    if (shelfError) throw shelfError;
    return;
  }

  if (mutation.type === 'library-delete') {
    const isbn13 = requiredString(mutation.payload.isbn13, 'isbn13');
    const { error: deleteError } = await supabase
      .from('user_library')
      .delete()
      .eq('user_id', user.id)
      .eq('isbn13', isbn13);
    if (deleteError) throw deleteError;
    return;
  }

  const { error: scoreError } = await supabase.from('daily_scores').upsert(
    {
      user_id: user.id,
      puzzle_date: requiredString(mutation.payload.puzzleDate, 'puzzleDate'),
      total_points: requiredNumber(mutation.payload.totalPoints, 'totalPoints'),
      round_breakdown: requiredArray(mutation.payload.roundBreakdown, 'roundBreakdown'),
    },
    { onConflict: 'user_id,puzzle_date' }
  );
  if (scoreError) throw scoreError;
}

export async function fetchDailyScores(): Promise<DailyScore[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('daily_scores')
    .select('puzzle_date,total_points,round_breakdown,completed_at')
    .order('puzzle_date', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    puzzleDate: row.puzzle_date,
    puzzleNumber: row.puzzle_date.replaceAll('-', ''),
    totalPoints: row.total_points,
    roundBreakdown: Array.isArray(row.round_breakdown)
      ? row.round_breakdown.filter((value): value is number => typeof value === 'number')
      : [],
    completedAt: row.completed_at,
  }));
}

export async function deleteDailyScore(puzzleDate: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await initializeAnonymousSession();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('A signed-in user is required to reset a daily score');

  const { error } = await supabase
    .from('daily_scores')
    .delete()
    .eq('user_id', user.id)
    .eq('puzzle_date', puzzleDate);
  if (error) throw error;
}

export async function fetchUserLibrary(): Promise<LibraryBook[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  await initializeAnonymousSession();

  const { data, error } = await supabase
    .from('user_library')
    .select(
      'isbn13,status,snoozed_until,catalog_items(isbn13,book_title,author,genre,cover_theme,publication_year,tmdb_id,movie_title,release_year,movie_poster_path)'
    )
    .order('saved_at', { ascending: false });
  if (error) throw error;

  const books: LibraryBook[] = [];
  for (const row of data ?? []) {
    const catalog = Array.isArray(row.catalog_items) ? row.catalog_items[0] : row.catalog_items;
    if (!catalog) continue;
    books.push({
      isbn13: row.isbn13,
      title: catalog.book_title,
      author: catalog.author,
      publicationYear: catalog.publication_year ?? undefined,
      genre: catalog.genre,
      coverTheme: catalog.cover_theme,
      status: row.status,
      snoozedUntil: row.snoozed_until ?? undefined,
      movieTitle: catalog.movie_title ?? undefined,
      movieYear: catalog.release_year ?? undefined,
      tmdbId: catalog.tmdb_id ?? undefined,
      moviePosterPath: catalog.movie_poster_path ?? null,
    });
  }

  return books;
}

export type TmdbProvider = {
  name: string;
  logoPath: string | null;
};

export type TmdbProviders = {
  region: string;
  link: string | null;
  flatrate: TmdbProvider[];
  rent: TmdbProvider[];
  buy: TmdbProvider[];
};

export async function fetchTmdbProviders(tmdbId: number, region = 'DE'): Promise<TmdbProviders> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  await initializeAnonymousSession();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error('A signed-in session is required to load streaming providers');

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error('Supabase URL is not configured');
  const response = await fetch(
    `${baseUrl}/functions/v1/tmdb-proxy?action=providers&tmdb_id=${tmdbId}&region=${region}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : 'Streaming provider lookup failed'
    );
  }
  return payload as TmdbProviders;
}

export async function searchBookCatalog(query: string): Promise<BookCandidate[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];

  const isbn13 = normalized.replace(/[^0-9]/g, '');
  const action = /^\d{13}$/.test(isbn13) ? 'isbn' : 'search';
  const parameter =
    action === 'isbn'
      ? `isbn=${encodeURIComponent(isbn13)}`
      : `q=${encodeURIComponent(normalized)}`;
  const payload = await invokeBookSearch(`?action=${action}&${parameter}`);
  return payload.items;
}

async function invokeBookSearch(queryString: string): Promise<{ items: BookCandidate[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  await initializeAnonymousSession();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error('A signed-in session is required to search books');

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error('Supabase URL is not configured');
  const response = await fetch(`${baseUrl}/functions/v1/booksearch-proxy${queryString}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : 'Book catalog search failed'
    );
  }
  return payload as { items: BookCandidate[] };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Offline mutation is missing valid "${field}"`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Offline mutation is missing valid "${field}"`);
  }
  return value;
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Offline mutation is missing valid "${field}"`);
  return value;
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { mmkvSupabaseStorage } from './local-storage';
import type { OfflineMutation } from './offline-queue';
import type { DailyScore } from './scores';

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
        number_of_pages:
          typeof mutation.payload.numberOfPages === 'number'
            ? mutation.payload.numberOfPages
            : null,
      });
      if (catalogInsertError) throw catalogInsertError;
    }

    const { error: shelfError } = await supabase
      .from('user_library')
      .upsert({ user_id: user.id, isbn13, status }, { onConflict: 'user_id,isbn13' });
    if (shelfError) throw shelfError;
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

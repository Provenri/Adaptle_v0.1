export const BOOK_SEARCH_CACHE_VERSION = 3;

export type BookSearchCacheDescriptor = {
  action: string;
  query?: string;
  isbn?: string;
  title?: string;
  author?: string;
  adaptationsOnly: boolean;
  popularOnly: boolean;
};

export function normalizeCacheQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function buildCacheInput(descriptor: BookSearchCacheDescriptor): string {
  return JSON.stringify({
    version: BOOK_SEARCH_CACHE_VERSION,
    action: descriptor.action,
    query: descriptor.query ? normalizeCacheQuery(descriptor.query) : undefined,
    isbn: descriptor.isbn,
    title: descriptor.title ? normalizeCacheQuery(descriptor.title) : undefined,
    author: descriptor.author ? normalizeCacheQuery(descriptor.author) : undefined,
    adaptationsOnly: descriptor.adaptationsOnly,
    popularOnly: descriptor.popularOnly,
  });
}

export async function hashCacheInput(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function cacheTtlSeconds(descriptor: BookSearchCacheDescriptor, itemCount: number): number {
  if (itemCount === 0) return 5 * 60;
  if (descriptor.popularOnly) return 6 * 60 * 60;
  if (descriptor.action === 'isbn') return 7 * 24 * 60 * 60;
  return 24 * 60 * 60;
}

export async function readCachedPayload(cacheKey: string): Promise<unknown | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;

  const url = new URL(`${supabaseUrl}/rest/v1/book_search_cache`);
  url.searchParams.set('cache_key', `eq.${cacheKey}`);
  url.searchParams.set('select', 'payload,expires_at');
  url.searchParams.set('limit', '1');
  try {
    const response = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!response.ok) return null;
    const rows = await response.json() as Array<{ payload: unknown; expires_at: string }>;
    const row = rows[0];
    if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
    return row.payload;
  } catch {
    return null;
  }
}

export async function writeCachedPayload(
  cacheKey: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(
      new URL(`${supabaseUrl}/rest/v1/book_search_cache?on_conflict=cache_key`),
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          cache_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } catch {
    // Cache writes must not make a successful upstream search fail.
  }
}

export async function cleanExpiredCacheEntries(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey || Math.floor(Math.random() * 50) !== 0) return;

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/book_search_cache`);
    url.searchParams.set('expires_at', `lt.${new Date().toISOString()}`);
    await fetch(url, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  } catch {
    // Cleanup is opportunistic; expired rows are never read.
  }
}

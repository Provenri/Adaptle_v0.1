export type CachedGlobalProviders = {
  region: 'GLOBAL';
  providers: Array<{
    name: string;
    logoPath: string | null;
    regionCount: number;
  }>;
  attribution: string;
};

type CacheClaim = {
  payload: CachedGlobalProviders | null;
  expiresAt: string | null;
  refreshClaimed: boolean;
};

export function isProviderCacheFresh(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) > Date.now();
}

export async function claimProviderRefresh(tmdbId: number): Promise<CacheClaim | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_tmdb_provider_refresh`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tmdb_id: tmdbId, p_lease_seconds: 30 }),
    });
    if (!response.ok) return null;

    const rows = await response.json() as Array<{
      payload: CachedGlobalProviders | null;
      expires_at: string | null;
      refresh_claimed: boolean;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      payload: row.payload,
      expiresAt: row.expires_at,
      refreshClaimed: row.refresh_claimed,
    };
  } catch {
    return null;
  }
}

export async function writeProviderCache(
  tmdbId: number,
  payload: CachedGlobalProviders,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/complete_tmdb_provider_refresh`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_tmdb_id: tmdbId,
        p_payload: payload,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Provider cache write failed with ${response.status}`);
  }
}

export async function recordProviderRefreshError(
  tmdbId: number,
  error: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/complete_tmdb_provider_refresh`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_tmdb_id: tmdbId,
        p_payload: null,
        p_error: error,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Provider cache error write failed with ${response.status}`);
  }
}

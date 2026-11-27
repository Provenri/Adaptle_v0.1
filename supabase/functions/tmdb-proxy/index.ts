/**
 * tmdb-proxy: keeps the TMDB API key server-side.
 *
 * Actions (GET):
 *   ?action=providers&tmdb_id=78            -> cached global streaming availability
 *   ?action=providers&tmdb_id=78&region=DE  -> regional streaming availability
 *   ?action=details&tmdb_id=78              -> factual details (runtime, genres)
 *
 * Copyright guardrail: the TMDB `overview` prose is never returned.
 * Responses include the attribution string required by TMDB's API terms.
 */
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';
import {
  claimProviderRefresh,
  isProviderCacheFresh,
  recordProviderRefreshError,
  writeProviderCache,
} from './cache.ts';
import { shapeDetails, shapeGlobalProviders, shapeProviders } from './shapes.ts';

const TMDB_BASE = 'https://api.themoviedb.org/3';

function tmdbRequest(path: string, apiKey: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let url = `${TMDB_BASE}${path}`;
  if (apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    url += `${path.includes('?') ? '&' : '?'}api_key=${apiKey}`;
  }
  return fetch(url, { headers });
}

async function fetchGlobalProviders(tmdbId: number, apiKey: string) {
  const response = await tmdbRequest(`/movie/${tmdbId}/watch/providers`, apiKey);
  if (response.status === 404) throw new Error('movie not found');
  if (!response.ok) throw new Error('TMDB upstream error');
  const data = await response.json();
  return shapeGlobalProviders(data.results);
}

async function refreshProviderCache(tmdbId: number, apiKey: string): Promise<void> {
  const payload = await fetchGlobalProviders(tmdbId, apiKey);
  await writeProviderCache(tmdbId, payload);
}

function refreshProviderCacheInBackground(tmdbId: number, apiKey: string): void {
  const refresh = refreshProviderCache(tmdbId, apiKey).catch(async (error) => {
    const message = error instanceof Error ? error.message : 'TMDB provider refresh failed';
    console.error(`Unable to refresh providers for TMDB ${tmdbId}:`, error);
    await recordProviderRefreshError(tmdbId, message).catch(() => undefined);
  });
  const runtime = globalThis as unknown as {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  };
  if (runtime.EdgeRuntime) {
    runtime.EdgeRuntime.waitUntil(refresh);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const tmdbId = Number.parseInt(url.searchParams.get('tmdb_id') ?? '', 10);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return errorResponse('tmdb_id must be a positive integer', 400);
  }

  try {
    if (action === 'providers') {
      const regionParam = url.searchParams.get('region');
      const apiKey = Deno.env.get('TMDB_API_KEY');
      if (!regionParam) {
        const cache = await claimProviderRefresh(tmdbId);
        if (
          cache?.payload &&
          isProviderCacheFresh(cache.expiresAt)
        ) {
          return jsonResponse(cache.payload);
        }

        if (cache?.payload) {
          if (cache.refreshClaimed && apiKey) {
            refreshProviderCacheInBackground(tmdbId, apiKey);
          }
          return jsonResponse(cache.payload);
        }

        if (cache && !cache.refreshClaimed) {
          return errorResponse('Provider refresh is already in progress', 503);
        }

        if (!apiKey) {
          return errorResponse('TMDB_API_KEY not configured', 500);
        }

        try {
          const payload = await fetchGlobalProviders(tmdbId, apiKey);
          try {
            await writeProviderCache(tmdbId, payload);
          } catch (error) {
            console.error(`Unable to cache providers for TMDB ${tmdbId}:`, error);
          }
          return jsonResponse(payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'TMDB provider refresh failed';
          await recordProviderRefreshError(tmdbId, message).catch(() => undefined);
          if (message === 'movie not found') return errorResponse(message, 404);
          return errorResponse(message, 502);
        }
      }

      if (!apiKey) return errorResponse('TMDB_API_KEY not configured', 500);
      {
        const region = regionParam.toUpperCase();
        if (!/^[A-Z]{2}$/.test(region)) {
          return errorResponse('region must be ISO 3166-1 alpha-2', 400);
        }
        const response = await tmdbRequest(`/movie/${tmdbId}/watch/providers`, apiKey);
        if (response.status === 404) return errorResponse('movie not found', 404);
        if (!response.ok) return errorResponse('TMDB upstream error', 502);
        const data = await response.json();
        return jsonResponse(shapeProviders(data.results?.[region] ?? null, region));
      }
    }

    if (action === 'details') {
      const apiKey = Deno.env.get('TMDB_API_KEY');
      if (!apiKey) return errorResponse('TMDB_API_KEY not configured', 500);
      const response = await tmdbRequest(`/movie/${tmdbId}`, apiKey);
      if (response.status === 404) return errorResponse('movie not found', 404);
      if (!response.ok) return errorResponse('TMDB upstream error', 502);
      return jsonResponse(shapeDetails(await response.json()));
    }

    return errorResponse('action must be "providers" or "details"', 400);
  } catch (_error) {
    return errorResponse('TMDB request failed', 502);
  }
});

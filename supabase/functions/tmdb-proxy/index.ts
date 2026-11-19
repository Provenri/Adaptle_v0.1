/**
 * tmdb-proxy: keeps the TMDB API key server-side.
 *
 * Actions (GET):
 *   ?action=providers&tmdb_id=78&region=DE  -> streaming availability
 *   ?action=details&tmdb_id=78              -> factual details (runtime, genres)
 *
 * Copyright guardrail: the TMDB `overview` prose is never returned.
 * Responses include the attribution string required by TMDB's API terms.
 */
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';
import { shapeDetails, shapeProviders } from './shapes.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('TMDB_API_KEY');
  if (!apiKey) return errorResponse('TMDB_API_KEY not configured', 500);

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const tmdbId = Number.parseInt(url.searchParams.get('tmdb_id') ?? '', 10);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return errorResponse('tmdb_id must be a positive integer', 400);
  }

  try {
    if (action === 'providers') {
      const region = (url.searchParams.get('region') ?? 'DE').toUpperCase();
      if (!/^[A-Z]{2}$/.test(region)) {
        return errorResponse('region must be ISO 3166-1 alpha-2', 400);
      }
      const response = await tmdbRequest(`/movie/${tmdbId}/watch/providers`, apiKey);
      if (response.status === 404) return errorResponse('movie not found', 404);
      if (!response.ok) return errorResponse('TMDB upstream error', 502);
      const data = await response.json();
      return jsonResponse(shapeProviders(data.results?.[region] ?? null, region));
    }

    if (action === 'details') {
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

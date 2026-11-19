/** Pure response-shaping logic for tmdb-proxy (unit-tested separately). */

export const TMDB_ATTRIBUTION =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.';

export interface ProviderEntry {
  provider_name?: string;
  logo_path?: string;
  display_priority?: number;
}

export function shapeProviders(
  regionData: {
    link?: string;
    flatrate?: ProviderEntry[];
    rent?: ProviderEntry[];
    buy?: ProviderEntry[];
  } | null,
  region: string
) {
  const names = (entries?: ProviderEntry[]) =>
    (entries ?? [])
      .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
      .map((e) => ({ name: e.provider_name ?? '', logoPath: e.logo_path ?? null }))
      .filter((e) => e.name);
  return {
    region,
    link: regionData?.link ?? null,
    flatrate: names(regionData?.flatrate),
    rent: names(regionData?.rent),
    buy: names(regionData?.buy),
    attribution: TMDB_ATTRIBUTION,
  };
}

export function shapeDetails(movie: {
  title?: string;
  release_date?: string;
  runtime?: number;
  genres?: { name?: string }[];
  poster_path?: string | null;
}) {
  // Factual fields only — `overview` is deliberately excluded.
  return {
    title: movie.title ?? null,
    releaseDate: movie.release_date ?? null,
    runtimeMinutes: movie.runtime ?? null,
    genres: (movie.genres ?? []).map((g) => g.name).filter(Boolean),
    posterPath: movie.poster_path ?? null,
    attribution: TMDB_ATTRIBUTION,
  };
}

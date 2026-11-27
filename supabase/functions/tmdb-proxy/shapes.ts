/** Pure response-shaping logic for tmdb-proxy (unit-tested separately). */

export const TMDB_ATTRIBUTION =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.';

export interface ProviderEntry {
  provider_id?: number;
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
  region: string,
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

type WatchRegionData = {
  link?: string;
  flatrate?: ProviderEntry[];
  rent?: ProviderEntry[];
  buy?: ProviderEntry[];
};

export function shapeGlobalProviders(results: Record<string, WatchRegionData> | undefined) {
  const providers = new Map<
    string,
    {
      name: string;
      logoPath: string | null;
      regions: Set<string>;
      displayPriority: number;
    }
  >();

  for (const [region, data] of Object.entries(results ?? {})) {
    for (
      const provider of [
        ...(data.flatrate ?? []),
        ...(data.rent ?? []),
        ...(data.buy ?? []),
      ]
    ) {
      const name = provider.provider_name?.trim();
      if (!name) continue;

      const key = String(provider.provider_id ?? name.toLocaleLowerCase());
      const priority = provider.display_priority ?? 99;
      const existing = providers.get(key);
      if (existing) {
        existing.regions.add(region);
        existing.displayPriority = Math.min(existing.displayPriority, priority);
        existing.logoPath ||= provider.logo_path ?? null;
      } else {
        providers.set(key, {
          name,
          logoPath: provider.logo_path ?? null,
          regions: new Set([region]),
          displayPriority: priority,
        });
      }
    }
  }

  return {
    region: 'GLOBAL' as const,
    providers: [...providers.values()]
      .sort(
        (a, b) =>
          b.regions.size - a.regions.size ||
          a.displayPriority - b.displayPriority ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 3)
      .map(({ name, logoPath, regions }) => ({
        name,
        logoPath,
        regionCount: regions.size,
      })),
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

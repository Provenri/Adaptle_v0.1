import { useQuery } from '@tanstack/react-query';

import { fetchTmdbProviders } from '@/lib/supabase';

export function useTmdbProviders(tmdbId: number | null | undefined, region = 'DE') {
  return useQuery({
    queryKey: ['tmdb-providers', region, tmdbId],
    queryFn: () => fetchTmdbProviders(tmdbId!, region),
    enabled: typeof tmdbId === 'number' && tmdbId > 0,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });
}

export function providerNames(
  data: Awaited<ReturnType<typeof fetchTmdbProviders>> | undefined
): string[] {
  if (!data) return [];
  return [...data.flatrate, ...data.rent, ...data.buy]
    .map((provider) => provider.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 4);
}

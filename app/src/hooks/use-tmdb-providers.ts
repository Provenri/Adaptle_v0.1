import { useQuery } from '@tanstack/react-query';

import { fetchTmdbProviders } from '@/lib/supabase';

export function useTmdbProviders(tmdbId: number | null | undefined) {
  return useQuery({
    queryKey: ['tmdb-providers-global', tmdbId],
    queryFn: () => fetchTmdbProviders(tmdbId!),
    enabled: typeof tmdbId === 'number' && tmdbId > 0,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });
}

export function providerNames(
  data: Awaited<ReturnType<typeof fetchTmdbProviders>> | undefined
): string[] {
  if (!data) return [];
  return data.providers.map((provider) => provider.name);
}

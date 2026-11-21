import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

import { localStorage } from './local-storage';

const QUERY_CACHE_KEY = 'query-cache-v2';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000,
      staleTime: 5 * 60 * 1000,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 2,
      networkMode: 'offlineFirst',
    },
  },
});

export function restoreQueryCache(): void {
  const dehydrated = localStorage.get<ReturnType<typeof dehydrate>>(QUERY_CACHE_KEY);
  if (dehydrated) hydrate(queryClient, dehydrated);
}

export function persistQueryCache(): void {
  localStorage.set(
    QUERY_CACHE_KEY,
    dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => query.state.status === 'success',
    })
  );
}

restoreQueryCache();

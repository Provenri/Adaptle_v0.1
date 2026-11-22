import { assertEquals } from 'jsr:@std/assert@1';

import { buildCacheInput, cacheTtlSeconds, hashCacheInput, normalizeCacheQuery } from './cache.ts';

Deno.test('cache keys normalize whitespace and letter case', async () => {
  const first = await hashCacheInput(buildCacheInput({
    action: 'search',
    query: '  Atomic   Habits ',
    adaptationsOnly: false,
    popularOnly: true,
  }));
  const second = await hashCacheInput(buildCacheInput({
    action: 'search',
    query: 'atomic habits',
    adaptationsOnly: false,
    popularOnly: true,
  }));

  assertEquals(first, second);
  assertEquals(normalizeCacheQuery('  The  Great\tGatsby '), 'the great gatsby');
});

Deno.test('cache keys distinguish search filters and payload versions', async () => {
  const base = {
    action: 'search',
    query: 'Dune',
    adaptationsOnly: false,
    popularOnly: false,
  };
  const normal = await hashCacheInput(buildCacheInput(base));
  const popular = await hashCacheInput(buildCacheInput({ ...base, popularOnly: true }));
  const adapted = await hashCacheInput(buildCacheInput({ ...base, adaptationsOnly: true }));

  assertEquals(new Set([normal, popular, adapted]).size, 3);
});

Deno.test('cache TTLs match source freshness needs', () => {
  const search = {
    action: 'search',
    query: 'Atomic Habits',
    adaptationsOnly: false,
    popularOnly: false,
  };
  assertEquals(cacheTtlSeconds(search, 1), 86_400);
  assertEquals(cacheTtlSeconds({ ...search, popularOnly: true }, 1), 21_600);
  assertEquals(cacheTtlSeconds({ ...search, action: 'isbn' }, 1), 604_800);
  assertEquals(cacheTtlSeconds(search, 0), 300);
});

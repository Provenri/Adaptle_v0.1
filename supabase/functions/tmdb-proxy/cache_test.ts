import { assertEquals } from 'jsr:@std/assert@1';

import { isProviderCacheFresh } from './cache.ts';

Deno.test('isProviderCacheFresh treats future expirations as fresh', () => {
  assertEquals(isProviderCacheFresh(new Date(Date.now() + 60_000).toISOString()), true);
});

Deno.test('isProviderCacheFresh rejects expired and missing expirations', () => {
  assertEquals(isProviderCacheFresh(new Date(Date.now() - 60_000).toISOString()), false);
  assertEquals(isProviderCacheFresh(null), false);
});

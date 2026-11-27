import { assertEquals } from 'jsr:@std/assert@1';

import {
  shapeDetails,
  shapeGlobalProviders,
  shapeProviders,
  TMDB_ATTRIBUTION,
} from '../tmdb-proxy/shapes.ts';

Deno.test('shapeProviders sorts by display priority and includes attribution', () => {
  const shaped = shapeProviders(
    {
      link: 'https://example.com',
      flatrate: [
        { provider_name: 'Prime Video', display_priority: 2 },
        { provider_name: 'Netflix', display_priority: 1, logo_path: '/n.png' },
        { provider_name: '', display_priority: 0 },
      ],
    },
    'DE',
  );
  assertEquals(shaped.flatrate, [
    { name: 'Netflix', logoPath: '/n.png' },
    { name: 'Prime Video', logoPath: null },
  ]);
  assertEquals(shaped.region, 'DE');
  assertEquals(shaped.link, 'https://example.com');
  assertEquals(shaped.rent, []);
  assertEquals(shaped.attribution, TMDB_ATTRIBUTION);
});

Deno.test('shapeProviders handles missing region data', () => {
  const shaped = shapeProviders(null, 'US');
  assertEquals(shaped.flatrate, []);
  assertEquals(shaped.link, null);
});

Deno.test('shapeGlobalProviders ranks top providers across all regions', () => {
  const shaped = shapeGlobalProviders({
    US: {
      flatrate: [
        { provider_id: 8, provider_name: 'Netflix', display_priority: 1 },
        { provider_id: 9, provider_name: 'Prime Video', display_priority: 2 },
      ],
      rent: [{ provider_id: 2, provider_name: 'Apple TV', display_priority: 3 }],
    },
    GB: {
      flatrate: [
        { provider_id: 9, provider_name: 'Prime Video', display_priority: 1 },
        { provider_id: 8, provider_name: 'Netflix', display_priority: 2 },
      ],
    },
    DE: {
      flatrate: [
        { provider_id: 9, provider_name: 'Prime Video', display_priority: 2 },
        { provider_id: 8, provider_name: 'Netflix', display_priority: 1 },
      ],
    },
    MX: {
      rent: [{ provider_id: 2, provider_name: 'Apple TV', display_priority: 1 }],
    },
    BR: {
      buy: [{ provider_id: 2, provider_name: 'Apple TV', display_priority: 1 }],
      flatrate: [{ provider_id: 10, provider_name: 'Disney Plus', display_priority: 1 }],
    },
  });

  assertEquals(shaped.region, 'GLOBAL');
  assertEquals(shaped.providers, [
    { name: 'Apple TV', logoPath: null, regionCount: 3 },
    { name: 'Netflix', logoPath: null, regionCount: 3 },
    { name: 'Prime Video', logoPath: null, regionCount: 3 },
  ]);
  assertEquals(shaped.attribution, TMDB_ATTRIBUTION);
});

Deno.test('shapeGlobalProviders counts each provider once per region and breaks ties by priority', () => {
  const shaped = shapeGlobalProviders({
    AR: {
      flatrate: [{ provider_id: 1, provider_name: 'Zulu', display_priority: 8 }],
      rent: [{ provider_id: 1, provider_name: 'Zulu', display_priority: 5 }],
      buy: [{ provider_id: 1, provider_name: 'Zulu', display_priority: 2 }],
    },
    ES: {
      flatrate: [
        { provider_id: 2, provider_name: 'Alpha', display_priority: 3 },
        { provider_id: 3, provider_name: 'Beta', display_priority: 1 },
      ],
    },
  });

  assertEquals(
    shaped.providers.map(({ name, regionCount }) => ({ name, regionCount })),
    [
      { name: 'Beta', regionCount: 1 },
      { name: 'Zulu', regionCount: 1 },
      { name: 'Alpha', regionCount: 1 },
    ],
  );
});

Deno.test('shapeDetails returns factual fields and never an overview', () => {
  const shaped = shapeDetails({
    title: 'Blade Runner',
    release_date: '1982-06-25',
    runtime: 117,
    genres: [{ name: 'Science Fiction' }, { name: 'Drama' }],
    poster_path: '/p.jpg',
    // @ts-expect-error: simulating an upstream field we must not forward
    overview: 'COPYRIGHTED PROSE',
  });
  assertEquals(shaped.title, 'Blade Runner');
  assertEquals(shaped.runtimeMinutes, 117);
  assertEquals(shaped.genres, ['Science Fiction', 'Drama']);
  assertEquals('overview' in shaped, false);
  assertEquals(JSON.stringify(shaped).includes('COPYRIGHTED'), false);
});

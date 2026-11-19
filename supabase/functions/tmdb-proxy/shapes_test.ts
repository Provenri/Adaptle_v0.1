import { assertEquals } from 'jsr:@std/assert@1';

import { shapeDetails, shapeProviders, TMDB_ATTRIBUTION } from '../tmdb-proxy/shapes.ts';

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
    'DE'
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

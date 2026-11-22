const REQUIRED_PLAYABLE_FIELDS = [
  'tmdb_id',
  'movie_title',
  'release_year',
  'director',
  'setting_hint',
  'character_hint',
  'premise_short',
  'premise_keywords',
] as const;

export function addPlayableCatalogFilters(url: URL): URL {
  for (const field of REQUIRED_PLAYABLE_FIELDS) {
    url.searchParams.set(field, 'not.is.null');
  }
  return url;
}

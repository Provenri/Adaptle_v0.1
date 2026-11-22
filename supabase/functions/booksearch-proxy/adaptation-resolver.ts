import type { BookCandidate } from './normalize.ts';
import { addPlayableCatalogFilters } from './practice-catalog.ts';

const WIKIDATA = 'https://query.wikidata.org/sparql';
const TMDB = 'https://api.themoviedb.org/3';
const UA = 'Adaptle/0.1 (https://github.com/Provenri/Adaptle_v0.1)';

export async function resolveAdaptations(
  candidates: BookCandidate[],
): Promise<BookCandidate[]> {
  const known = await lookupKnownAdaptations(candidates);
  const unresolved = known.some((candidate) => candidate.hasAdaptation)
    ? []
    : known.filter((candidate) => !candidate.hasAdaptation).slice(0, 5);
  const resolved = await mapLimited(unresolved, 3, async (candidate) => {
    try {
      const tmdbId = await Promise.race([
        findWikidataTmdbId(candidate),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]);
      if (!tmdbId) return candidate;
      const adaptation = await fetchTmdbFacts(tmdbId);
      return adaptation ? { ...candidate, hasAdaptation: true, ...adaptation } : candidate;
    } catch {
      return candidate;
    }
  });
  const byIsbn = new Map([...known, ...resolved].map((candidate) => [candidate.isbn13, candidate]));
  return candidates.map((candidate) => byIsbn.get(candidate.isbn13) ?? candidate);
}

export function filterByAdaptation(candidates: BookCandidate[]): BookCandidate[] {
  const adapted = candidates.filter((candidate) => candidate.hasAdaptation === true);
  const grouped = new Map<string, BookCandidate>();

  for (const candidate of adapted) {
    const key = [
      normalizeLabel(candidate.title),
      normalizeLabel(candidate.author),
      candidate.tmdbId ?? candidate.movieTitle ?? '',
    ].join('|');
    const current = grouped.get(key);
    if (!current || isBetterAdaptationCandidate(candidate, current)) grouped.set(key, candidate);
  }
  return [...grouped.values()];
}

function isBetterAdaptationCandidate(next: BookCandidate, current: BookCandidate): boolean {
  if (
    next.publicationYear !== null &&
    (current.publicationYear === null || next.publicationYear < current.publicationYear)
  ) {
    return true;
  }
  if (next.publicationYear !== current.publicationYear) return false;
  return metadataScore(next) > metadataScore(current);
}

function metadataScore(candidate: BookCandidate): number {
  return [
    candidate.numberOfPages !== null,
    candidate.genre !== null,
    (candidate.leadActors?.length ?? 0) > 0,
    (candidate.leadCharacters?.length ?? 0) > 0,
    candidate.moviePosterPath !== null && candidate.moviePosterPath !== undefined,
  ].filter(Boolean).length;
}

async function findWikidataTmdbId(candidate: BookCandidate): Promise<number | null> {
  const title = sparqlString(normalizeLabel(candidate.title));
  const author = sparqlString(normalizeLabel(candidate.author));
  const query = `
SELECT ?tmdb WHERE {
  ?book rdfs:label ?bookLabel ;
        wdt:P50 ?author .
  ?author rdfs:label ?authorLabel .
  ?film wdt:P144 ?book ;
        wdt:P4947 ?tmdb .
  FILTER(
    LANG(?bookLabel) = "en" &&
    LCASE(REPLACE(REPLACE(STR(?bookLabel), "\\\\s+", " "), "^ | $", "")) = ${title}
  )
  FILTER(
    LANG(?authorLabel) = "en" &&
    LCASE(REPLACE(REPLACE(STR(?authorLabel), "\\\\s+", " "), "^ | $", "")) = ${author}
  )
}
LIMIT 1`.trim();
  const response = await fetch(
    `${WIKIDATA}?query=${encodeURIComponent(query)}&format=json`,
    { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } },
  );
  if (!response.ok) return null;
  const data = await response.json();
  const raw = data.results?.bindings?.[0]?.tmdb?.value;
  const tmdbId = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

async function lookupKnownAdaptations(candidates: BookCandidate[]): Promise<BookCandidate[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey || candidates.length === 0) return candidates;
  const isbnFilter = candidates.map((candidate) => `"${candidate.isbn13}"`).join(',');
  const url = new URL(`${supabaseUrl}/rest/v1/catalog_items`);
  url.searchParams.set('isbn13', `in.(${isbnFilter})`);
  addPlayableCatalogFilters(url);
  url.searchParams.set(
    'select',
    'isbn13,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_actors,lead_characters,setting_hint,character_hint,story_premise,premise_short,premise_keywords',
  );
  const response = await fetch(
    url,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!response.ok) return candidates;
  const rows = (await response.json()) as Array<{
    isbn13: string;
    tmdb_id: number;
    movie_title: string;
    release_year: number | null;
    director: string | null;
    movie_poster_path: string | null;
    lead_actors: string[] | null;
    lead_characters: string[] | null;
    setting_hint: string | null;
    character_hint: string | null;
    story_premise: string | null;
    premise_short: string | null;
    premise_keywords: string[] | null;
  }>;
  const byIsbn = new Map(
    rows.map((row) => [
      row.isbn13,
      {
        hasAdaptation: true,
        tmdbId: row.tmdb_id,
        movieTitle: row.movie_title,
        releaseYear: row.release_year,
        director: row.director,
        moviePosterPath: row.movie_poster_path,
        leadActors: row.lead_actors ?? undefined,
        leadCharacters: row.lead_characters ?? undefined,
        settingHint: row.setting_hint ?? undefined,
        characterHint: row.character_hint ?? undefined,
        storyPremise: row.story_premise ?? undefined,
        premiseShort: row.premise_short ?? undefined,
        premiseKeywords: row.premise_keywords ?? undefined,
      },
    ]),
  );
  return candidates.map((candidate) => ({
    ...candidate,
    ...(byIsbn.get(candidate.isbn13) ?? {}),
  }));
}

async function fetchTmdbFacts(tmdbId: number) {
  const apiKey = Deno.env.get('TMDB_API_KEY');
  if (!apiKey) return null;
  const url = `${TMDB}/movie/${tmdbId}?append_to_response=credits`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const requestUrl = apiKey.startsWith('eyJ')
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;
  if (apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(requestUrl, { headers });
  if (!response.ok) return null;
  const movie = await response.json();
  const cast = [...(movie.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .filter((member) => member.character && member.name)
    .slice(0, 2);
  if (cast.length !== 2 || !movie.title) return null;
  return {
    tmdbId,
    movieTitle: movie.title,
    releaseYear: movie.release_date ? Number.parseInt(movie.release_date.slice(0, 4), 10) : null,
    director: movie.credits?.crew?.find(
      (member: { job?: string; name?: string }) => member.job === 'Director' && member.name,
    )?.name ??
      null,
    moviePosterPath: movie.poster_path ?? null,
    leadActors: cast.map((member) => member.name),
    leadCharacters: cast.map((member) =>
      String(member.character)
        .replace(/\s*\((?:voice|uncredited|archive footage)\)\s*/gi, '')
        .trim()
    ),
  };
}

async function mapLimited<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        output[index] = await mapper(values[index]!);
      }
    }),
  );
  return output;
}

function sparqlString(value: string): string {
  return `"${normalizeLabel(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

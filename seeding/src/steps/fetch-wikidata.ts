import { writeCheckpoint } from '../lib/checkpoint.js';
import { fetchJson } from '../lib/http.js';
import { WikidataPairSchema, type WikidataPair } from '../types.js';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

/**
 * Builds the SPARQL query for verified book-to-movie adaptation pairs:
 * film (P31=Q11424) based on (P144) a book with author (P50), where the film
 * has a TMDB id (P4947). The ISBN-13 comes from the work itself (P212) or one
 * of its editions (P747/P212); an inner GROUP BY samples one valid ISBN per
 * book-film pair so LIMIT counts unique pairs. English filtering uses the
 * film's original language (P364), which is far better populated than the
 * book's P407. Film director (P57) and release year (P577) are fetched here
 * so LLM prompts never need TMDB-origin data. CC0 data.
 */
export function buildSparqlQuery(options: {
  limit: number;
  englishOnly: boolean;
  popularFirst?: boolean;
  filmYearFrom?: number;
  filmYearTo?: number;
}): string {
  const languageFilter = options.englishOnly ? '?film wdt:P364 wd:Q1860 .' : '';
  const popularityBinding = options.popularFirst
    ? '?book wikibase:sitelinks ?bookSitelinks .'
    : '';
  const popularityAggregate = options.popularFirst
    ? '(MAX(?bookSitelinks) AS ?popularity)'
    : '(0 AS ?popularity)';
  const popularityOrder = options.popularFirst ? 'ORDER BY DESC(?popularity)' : '';
  const releaseDateRange =
    options.filmYearFrom !== undefined || options.filmYearTo !== undefined
      ? '?film wdt:P577 ?filmDate .'
      : 'OPTIONAL { ?film wdt:P577 ?filmDate . }';
  const filmYearFilter = [
    options.filmYearFrom !== undefined
      ? `FILTER(YEAR(?filmDate) >= ${options.filmYearFrom})`
      : '',
    options.filmYearTo !== undefined
      ? `FILTER(YEAR(?filmDate) <= ${options.filmYearTo})`
      : '',
  ].join('\n      ');
  return `
SELECT ?book ?bookLabel ?authorLabel ?isbn13 ?film ?filmLabel ?director ?directorLabel ?tmdbId ?pubYear ?filmYear WHERE {
  {
    SELECT ?book ?film
           (SAMPLE(?isbn) AS ?isbn13)
           (SAMPLE(?tmdb) AS ?tmdbId)
           (SAMPLE(?auth) AS ?author)
           (SAMPLE(?dir) AS ?director)
           (MIN(YEAR(?pubDate)) AS ?pubYear)
           (MIN(YEAR(?filmDate)) AS ?filmYear)
           ${popularityAggregate}
    WHERE {
      ?film wdt:P31 wd:Q11424 ;
            wdt:P144 ?book ;
            wdt:P4947 ?tmdb .
      ?book wdt:P50 ?auth .
      ${languageFilter}
      OPTIONAL { ?book wdt:P212 ?isbnWork . }
      OPTIONAL { ?book wdt:P747/wdt:P212 ?isbnEdition . }
      BIND(COALESCE(?isbnWork, ?isbnEdition) AS ?isbn)
      FILTER(BOUND(?isbn))
      FILTER(REGEX(REPLACE(?isbn, "[^0-9]", ""), "^[0-9]{13}$"))
      ${popularityBinding}
      OPTIONAL { ?book wdt:P577 ?pubDate . }
      OPTIONAL { ?film wdt:P57 ?dir . }
      ${releaseDateRange}
      ${filmYearFilter}
    }
    GROUP BY ?book ?film
    ${popularityOrder}
    LIMIT ${options.limit}
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`.trim();
}

interface SparqlBinding {
  type: string;
  value: string;
}

interface SparqlResponse {
  results: {
    bindings: Record<string, SparqlBinding | undefined>[];
  };
}

function qidFromUri(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

export function normalizeIsbn13(raw: string): string | null {
  const digits = raw.replace(/[^0-9Xx]/g, '');
  return /^\d{13}$/.test(digits) ? digits : null;
}

/** True when the label service returned a real label rather than the raw QID. */
function isRealLabel(label: string | undefined, qid: string): label is string {
  return !!label && label !== qid;
}

export function parseSparqlResults(response: SparqlResponse): WikidataPair[] {
  const seenIsbns = new Set<string>();
  const seenBooks = new Set<string>();
  const pairs: WikidataPair[] = [];

  for (const row of response.results.bindings) {
    const bookUri = row.book?.value;
    const filmUri = row.film?.value;
    const isbnRaw = row.isbn13?.value;
    const tmdbRaw = row.tmdbId?.value;
    if (!bookUri || !filmUri || !isbnRaw || !tmdbRaw) continue;

    const bookQid = qidFromUri(bookUri);
    const filmQid = qidFromUri(filmUri);
    const bookTitle = row.bookLabel?.value;
    const author = row.authorLabel?.value;
    const movieTitle = row.filmLabel?.value;
    const isbn13 = normalizeIsbn13(isbnRaw);
    const tmdbId = Number.parseInt(tmdbRaw, 10);

    // Skip rows with missing English labels, malformed ISBNs, or bad TMDB ids.
    if (!isRealLabel(bookTitle, bookQid)) continue;
    if (!author || /^Q\d+$/.test(author)) continue;
    if (!isRealLabel(movieTitle, filmQid)) continue;
    if (!isbn13 || !Number.isFinite(tmdbId) || tmdbId <= 0) continue;

    // One puzzle per book and per ISBN: keep the first row seen.
    if (seenIsbns.has(isbn13) || seenBooks.has(bookQid)) continue;
    seenIsbns.add(isbn13);
    seenBooks.add(bookQid);

    const pubYearRaw = row.pubYear?.value;
    const bookPublicationYear = pubYearRaw ? Number.parseInt(pubYearRaw, 10) : null;

    const filmYearRaw = row.filmYear?.value;
    const movieReleaseYear = filmYearRaw ? Number.parseInt(filmYearRaw, 10) : null;

    // Director label is optional; ignore when it's a bare QID (no English label).
    const directorRaw = row.directorLabel?.value;
    const movieDirector = directorRaw && !/^Q\d+$/.test(directorRaw) ? directorRaw : null;

    pairs.push(
      WikidataPairSchema.parse({
        bookQid,
        filmQid,
        bookTitle,
        author,
        isbn13,
        movieTitle,
        movieDirector,
        movieReleaseYear,
        tmdbId,
        bookPublicationYear,
      })
    );
  }
  return pairs;
}

export async function fetchWikidata(options: {
  limit: number;
  englishOnly: boolean;
}): Promise<string> {
  const query = buildSparqlQuery(options);
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  console.log(
    `Querying Wikidata for up to ${options.limit} adaptation pairs` +
      (options.englishOnly ? ' (English-language books only)...' : '...')
  );

  const response = await fetchJson<SparqlResponse>(url, {
    headers: { Accept: 'application/sparql-results+json' },
    retries: 3,
    retryDelayMs: 2_000,
  });
  if (!response) throw new Error('Empty response from Wikidata.');

  const pairs = parseSparqlResults(response);
  console.log(
    `Got ${response.results.bindings.length} rows -> ${pairs.length} unique valid pairs.`
  );

  const path = writeCheckpoint('01-wikidata-pairs', pairs);
  console.log(`Checkpoint written: ${path}`);
  return path;
}

import { readCheckpoint, writeCheckpoint } from "../lib/checkpoint.js";
import { requireEnv } from "../lib/env.js";
import { fetchJson } from "../lib/http.js";
import { HintedBookSchema, type HintedBook } from "../types.js";
import { enrichOpenLibrary } from "./enrich-openlibrary.js";
import { enrichTmdb } from "./enrich-tmdb.js";
import { generateHints } from "./generate-hints.js";
import { buildSparqlQuery, parseSparqlResults } from "./fetch-wikidata.js";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const CANDIDATE_LIMIT = 750;

type SparqlResponse = {
  results: {
    bindings: Record<string, { type: string; value: string } | undefined>[];
  };
};

export async function preparePopularCatalogBatch(options: {
  limit: number;
  apply: boolean;
  filmYearFrom?: number;
  filmYearTo?: number;
}): Promise<void> {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const existingRows =
    (await fetchJson<Array<{ isbn13: string }>>(
      `${baseUrl}/rest/v1/catalog_items?select=isbn13`,
      { headers: serviceHeaders(serviceKey) },
    )) ?? [];
  const existingIsbns = new Set(existingRows.map((row) => row.isbn13));

  const query = buildSparqlQuery({
    limit: CANDIDATE_LIMIT,
    englishOnly: true,
    popularFirst: true,
    filmYearFrom: options.filmYearFrom,
    filmYearTo: options.filmYearTo,
  });
  const response = await fetchJson<SparqlResponse>(
    `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`,
    {
      headers: { Accept: "application/sparql-results+json" },
      retries: 4,
      retryDelayMs: 3_000,
    },
  );
  if (!response) throw new Error("Wikidata returned an empty response.");

  const allPairs = parseSparqlResults(response);
  const pairs = allPairs
    .filter(
      (pair) =>
        (options.filmYearFrom === undefined ||
          (pair.movieReleaseYear ?? 0) >= options.filmYearFrom) &&
        (options.filmYearTo === undefined ||
          (pair.movieReleaseYear ?? Infinity) <= options.filmYearTo),
    )
    .filter((pair) => !existingIsbns.has(pair.isbn13))
    .slice(0, Math.max(options.limit, options.limit * 2));
  if (pairs.length === 0)
    throw new Error("No new popular adaptations were found.");

  writeCheckpoint("01-wikidata-pairs", pairs);
  await enrichOpenLibrary({});
  await enrichTmdb({});
  await generateHints({ limit: options.limit });
  const hinted = readCheckpoint("04-hinted-books", HintedBookSchema);
  if (hinted.length < options.limit) {
    throw new Error(
      `Only ${hinted.length} verified adaptations fit the requested ${options.limit}-item window.`,
    );
  }
  writeCheckpoint("04-hinted-books", hinted);

  if (options.apply) {
    for (let index = 0; index < hinted.length; index += 100) {
      await fetchJson(`${baseUrl}/rest/v1/catalog_items?on_conflict=isbn13`, {
        method: "POST",
        headers: {
          ...serviceHeaders(serviceKey),
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: hinted.slice(index, index + 100).map(toCatalogRow),
      });
    }
  }

  const report = {
    requested: options.limit,
    filmYearFrom: options.filmYearFrom ?? null,
    filmYearTo: options.filmYearTo ?? null,
    candidatesChecked: allPairs.length,
    existingExcluded:
      allPairs.length -
      allPairs.filter((pair) => !existingIsbns.has(pair.isbn13)).length,
    selected: hinted.map((book) => ({
      isbn13: book.isbn13,
      title: book.bookTitle,
      author: book.author,
      publicationYear: book.bookPublicationYear,
      movie: book.tmdbTitle,
      releaseYear: book.releaseYear,
      tmdbId: book.tmdbId,
    })),
    candidatesProcessed: pairs.length,
    unselectedAfterVerification: pairs.length - hinted.length,
    applied: options.apply,
  };
  writeCheckpoint("07-popular-catalog-batch", [report]);
  console.log(JSON.stringify(report, null, 2));
}

function toCatalogRow(book: HintedBook): Record<string, unknown> {
  return {
    isbn13: book.isbn13,
    book_title: book.bookTitle,
    author: book.author,
    genre: book.genre,
    cover_theme: book.coverTheme,
    metadata_source: "wikidata_openlibrary",
    number_of_pages: book.numberOfPages,
    publication_year: book.bookPublicationYear,
    tmdb_id: book.tmdbId,
    movie_title: book.tmdbTitle,
    release_year: book.releaseYear,
    director: book.director,
    movie_poster_path: book.moviePosterPath,
    lead_characters: book.leadCharacters,
    lead_actors: book.leadActors,
    setting_hint: book.settingHint,
    character_hint: book.characterHint,
    story_premise: book.storyPremise,
    premise_short: book.premiseShort,
    premise_decoys: book.premiseDecoys,
    premise_keywords: book.premiseKeywords,
    scheduled_date: null,
  };
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
}

import { describe, expect, it } from 'vitest';

import {
  buildSparqlQuery,
  normalizeIsbn13,
  parseSparqlResults,
} from '../steps/fetch-wikidata.js';

function binding(value: string) {
  return { type: 'literal', value };
}

function makeRow(overrides: Record<string, { type: string; value: string } | undefined> = {}) {
  return {
    book: { type: 'uri', value: 'http://www.wikidata.org/entity/Q605249' },
    film: { type: 'uri', value: 'http://www.wikidata.org/entity/Q184843' },
    bookLabel: binding('Do Androids Dream of Electric Sheep?'),
    authorLabel: binding('Philip K. Dick'),
    filmLabel: binding('Blade Runner'),
    directorLabel: binding('Ridley Scott'),
    isbn13: binding('978-0-345-40447-3'),
    tmdbId: binding('78'),
    pubYear: binding('1968'),
    filmYear: binding('1982'),
    ...overrides,
  };
}

describe('normalizeIsbn13', () => {
  it('strips hyphens from valid ISBN-13s', () => {
    expect(normalizeIsbn13('978-0-345-40447-3')).toBe('9780345404473');
  });

  it('rejects ISBN-10s and garbage', () => {
    expect(normalizeIsbn13('0-345-40447-5')).toBeNull();
    expect(normalizeIsbn13('not an isbn')).toBeNull();
  });
});

describe('buildSparqlQuery', () => {
  it('includes the English film-language filter by default', () => {
    expect(buildSparqlQuery({ limit: 10, englishOnly: true })).toContain('wdt:P364 wd:Q1860');
  });

  it('omits the language filter when disabled', () => {
    expect(buildSparqlQuery({ limit: 10, englishOnly: false })).not.toContain('wd:Q1860');
  });

  it('accepts edition-level ISBNs via P747', () => {
    expect(buildSparqlQuery({ limit: 10, englishOnly: true })).toContain('wdt:P747/wdt:P212');
  });
});

describe('parseSparqlResults', () => {
  it('parses a valid row into a WikidataPair', () => {
    const pairs = parseSparqlResults({ results: { bindings: [makeRow()] } });
    expect(pairs).toEqual([
      {
        bookQid: 'Q605249',
        filmQid: 'Q184843',
        bookTitle: 'Do Androids Dream of Electric Sheep?',
        author: 'Philip K. Dick',
        isbn13: '9780345404473',
        movieTitle: 'Blade Runner',
        movieDirector: 'Ridley Scott',
        movieReleaseYear: 1982,
        tmdbId: 78,
        bookPublicationYear: 1968,
      },
    ]);
  });

  it('nulls the director when the label is a bare QID or missing', () => {
    const bareQid = parseSparqlResults({
      results: { bindings: [makeRow({ directorLabel: binding('Q12345') })] },
    });
    expect(bareQid[0]?.movieDirector).toBeNull();

    const missing = parseSparqlResults({
      results: { bindings: [makeRow({ directorLabel: undefined, filmYear: undefined })] },
    });
    expect(missing[0]?.movieDirector).toBeNull();
    expect(missing[0]?.movieReleaseYear).toBeNull();
  });

  it('deduplicates by ISBN keeping the first film', () => {
    const rowA = makeRow({ filmLabel: binding('Blade Runner') });
    const rowB = makeRow({
      film: { type: 'uri', value: 'http://www.wikidata.org/entity/Q21500755' },
      filmLabel: binding('Blade Runner 2049'),
    });
    const pairs = parseSparqlResults({ results: { bindings: [rowA, rowB] } });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.movieTitle).toBe('Blade Runner');
  });

  it('skips rows whose labels are bare QIDs (no English label)', () => {
    const pairs = parseSparqlResults({
      results: { bindings: [makeRow({ bookLabel: binding('Q605249') })] },
    });
    expect(pairs).toHaveLength(0);
  });

  it('skips rows with invalid ISBNs or TMDB ids and handles missing pubYear', () => {
    const badIsbn = makeRow({ isbn13: binding('123') });
    const badTmdb = makeRow({ tmdbId: binding('abc') });
    const noYear = makeRow({ pubYear: undefined });
    const pairs = parseSparqlResults({ results: { bindings: [badIsbn, badTmdb, noYear] } });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.bookPublicationYear).toBeNull();
  });
});

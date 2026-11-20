import { assertEquals } from 'jsr:@std/assert@1';

import {
  fromGoogleBooksVolume,
  fromOpenLibraryDoc,
  normalizeIsbn13,
} from '../booksearch-proxy/normalize.ts';

Deno.test('normalizeIsbn13 strips separators and rejects non-ISBN-13', () => {
  assertEquals(normalizeIsbn13('978-0-7352-1129-2'), '9780735211292');
  assertEquals(normalizeIsbn13('0735211299'), null);
});

Deno.test('fromOpenLibraryDoc picks the first ISBN-13 and classifies the theme', () => {
  const candidate = fromOpenLibraryDoc({
    title: 'Atomic Habits',
    author_name: ['James Clear'],
    isbn: ['0735211299', '978-0-7352-1129-2'],
    number_of_pages_median: 320,
    first_publish_year: 2018,
    subject: ['Self-help', 'Habit formation'],
  });
  assertEquals(candidate?.isbn13, '9780735211292');
  assertEquals(candidate?.author, 'James Clear');
  assertEquals(candidate?.coverTheme, 'nonfiction_forest');
  assertEquals(candidate?.source, 'openlibrary_manual');
  assertEquals(candidate?.publicationYear, 2018);
});

Deno.test('fromOpenLibraryDoc rejects docs without ISBN-13, title, or author', () => {
  assertEquals(fromOpenLibraryDoc({ title: 'X', author_name: ['Y'], isbn: ['12345'] }), null);
  assertEquals(fromOpenLibraryDoc({ author_name: ['Y'], isbn: ['9780735211292'] }), null);
  assertEquals(fromOpenLibraryDoc({ title: 'X', isbn: ['9780735211292'] }), null);
});

Deno.test('fromGoogleBooksVolume reads factual fields and falls back to the requested ISBN', () => {
  const candidate = fromGoogleBooksVolume(
    {
      volumeInfo: {
        title: 'Some Rare Book',
        authors: ['An Author'],
        pageCount: 250,
        publishedDate: '2019-04-16',
        categories: ['Fiction / Mystery'],
        industryIdentifiers: [{ type: 'ISBN_10', identifier: '0735211299' }],
      },
    },
    '9780000000013',
  );
  assertEquals(candidate?.isbn13, '9780000000013');
  assertEquals(candidate?.coverTheme, 'thriller_navy');
  assertEquals(candidate?.source, 'googlebooks_manual');
  assertEquals(candidate?.publicationYear, 2019);
});

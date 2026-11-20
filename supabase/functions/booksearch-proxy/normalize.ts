/**
 * Pure normalization logic for booksearch-proxy (unit-tested separately).
 *
 * Copyright guardrails: only uncopyrightable facts are read — Open Library's
 * `description` field and cover URLs, and Google Books' `description` and
 * `imageLinks`, are never touched (see Adaptle.md section 3).
 */
import { classifyCover, type CoverTheme } from '../_shared/cover-theme.ts';

export interface BookCandidate {
  isbn13: string;
  title: string;
  author: string;
  numberOfPages: number | null;
  publicationYear: number | null;
  subjects: string[];
  genre: string | null;
  coverTheme: CoverTheme;
  source: 'openlibrary_manual' | 'googlebooks_manual';
}

export function normalizeIsbn13(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '');
  return /^\d{13}$/.test(digits) ? digits : null;
}

/** Open Library search.json doc (requested fields only). */
export interface OpenLibrarySearchDoc {
  title?: string;
  author_name?: string[];
  isbn?: string[];
  number_of_pages_median?: number;
  first_publish_year?: number;
  subject?: string[];
}

export function fromOpenLibraryDoc(doc: OpenLibrarySearchDoc): BookCandidate | null {
  const isbn13 = (doc.isbn ?? []).map(normalizeIsbn13).find((i): i is string => i !== null);
  const title = doc.title?.trim();
  const author = doc.author_name?.[0]?.trim();
  if (!isbn13 || !title || !author) return null;

  const subjects = (doc.subject ?? []).slice(0, 20);
  const { coverTheme, genre } = classifyCover(subjects);
  return {
    isbn13,
    title,
    author,
    numberOfPages: doc.number_of_pages_median ?? null,
    publicationYear: doc.first_publish_year ?? null,
    subjects,
    genre,
    coverTheme,
    source: 'openlibrary_manual',
  };
}

/** Google Books volume (factual fields only). */
export interface GoogleBooksVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    pageCount?: number;
    publishedDate?: string;
    categories?: string[];
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

export function fromGoogleBooksVolume(
  volume: GoogleBooksVolume,
  requestedIsbn13: string,
): BookCandidate | null {
  const info = volume.volumeInfo;
  const title = info?.title?.trim();
  const author = info?.authors?.[0]?.trim();
  if (!title || !author) return null;

  const identifier = info?.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;
  const isbn13 = (identifier && normalizeIsbn13(identifier)) || requestedIsbn13;

  const subjects = (info?.categories ?? []).slice(0, 20);
  const { coverTheme, genre } = classifyCover(subjects);
  return {
    isbn13,
    title,
    author,
    numberOfPages: info?.pageCount ?? null,
    publicationYear: parsePublicationYear(info?.publishedDate),
    subjects,
    genre,
    coverTheme,
    source: 'googlebooks_manual',
  };
}

export function parsePublicationYear(value: string | undefined): number | null {
  const match = value?.match(/\b(\d{4})\b/);
  if (!match) return null;
  const year = Number.parseInt(match[1]!, 10);
  return year >= 1 && year <= 9999 ? year : null;
}

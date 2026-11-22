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
  popularityScore?: number;
  isPopular?: boolean;
  readingLogCount?: number;
  ratingsCount?: number;
  editionCount?: number;
  ratingsAverage?: number;
  hasAdaptation?: boolean;
  tmdbId?: number;
  movieTitle?: string;
  releaseYear?: number | null;
  director?: string | null;
  moviePosterPath?: string | null;
  leadActors?: string[];
  leadCharacters?: string[];
  settingHint?: string;
  characterHint?: string;
  storyPremise?: string;
  premiseShort?: string;
  premiseKeywords?: string[];
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
  edition_count?: number;
  readinglog_count?: number;
  ratings_count?: number;
  ratings_average?: number;
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
    popularityScore: calculatePopularityScore(doc),
    readingLogCount: doc.readinglog_count,
    ratingsCount: doc.ratings_count,
    editionCount: doc.edition_count,
    ratingsAverage: doc.ratings_average,
  };
}

export function calculatePopularityScore(doc: OpenLibrarySearchDoc): number {
  const reading = Math.log10(1 + Math.max(0, doc.readinglog_count ?? 0));
  const ratings = Math.log10(1 + Math.max(0, doc.ratings_count ?? 0));
  const editions = Math.log10(1 + Math.max(0, doc.edition_count ?? 0));
  const baseScore = 0.6 * reading + 0.25 * ratings + 0.15 * editions;
  const ratingFactor = Math.min(5, Math.max(0, doc.ratings_average ?? 0)) / 5;
  const confidence = Math.min((doc.ratings_count ?? 0) / 100, 1);
  return baseScore * (0.9 + 0.1 * ratingFactor * confidence);
}

export function isPopularCandidate(candidate: BookCandidate): boolean {
  return candidate.popularityScore !== undefined &&
    (candidate.readingLogCount ?? 0) >= 1_000 &&
    (candidate.ratingsCount ?? 0) >= 50 &&
    (candidate.editionCount ?? 0) >= 5;
}

export function filterPopularCandidates(candidates: BookCandidate[]): BookCandidate[] {
  const qualifying = candidates.filter(isPopularCandidate);
  if (qualifying.length <= 1) {
    return qualifying.map((candidate) => ({ ...candidate, isPopular: true }));
  }

  const sorted = [...qualifying].sort(
    (a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0),
  );
  const resultCount = Math.max(1, Math.ceil(sorted.length * 0.25));
  return sorted.slice(0, resultCount).map((candidate) => ({ ...candidate, isPopular: true }));
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
  requestedIsbn13: string | null,
): BookCandidate | null {
  const info = volume.volumeInfo;
  const title = info?.title?.trim();
  const author = info?.authors?.[0]?.trim();
  if (!title || !author) return null;

  const identifier = info?.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;
  const isbn13 = (identifier && normalizeIsbn13(identifier)) || requestedIsbn13;
  if (!isbn13) return null;

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

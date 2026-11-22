import type { CoverTheme } from '@/components/typographic-cover';

export type ShelfStatus = 'TO_BE_READ' | 'READING' | 'FINISHED';

export type LibraryBook = {
  isbn13: string;
  title: string;
  author: string;
  publicationYear?: number;
  genre: string | null;
  coverTheme: CoverTheme;
  status: ShelfStatus;
  savedAt?: number;
  tmdbId?: number;
  moviePosterPath?: string | null;
  movieTitle?: string;
  movieYear?: number;
  leadActors?: string[];
  leadCharacters?: string[];
  settingHint?: string;
  characterHint?: string;
  storyPremise?: string;
  premiseShort?: string;
  premiseDecoys?: string[];
  premiseKeywords?: string[];
};

export type BookCandidate = Omit<
  LibraryBook,
  'status' | 'movieTitle' | 'movieYear' | 'tmdbId' | 'moviePosterPath'
> & {
  hasAdaptation?: boolean;
  tmdbId?: number;
  movieTitle?: string;
  releaseYear?: number | null;
  director?: string | null;
  moviePosterPath?: string | null;
  leadActors?: string[];
  leadCharacters?: string[];
  storyPremise?: string;
  premiseShort?: string;
  premiseDecoys?: string[];
  premiseKeywords?: string[];
  numberOfPages: number | null;
  publicationYear: number | null;
  subjects: readonly string[];
  source: 'openlibrary_manual' | 'googlebooks_manual';
  popularityScore?: number;
  isPopular?: boolean;
  readingLogCount?: number;
  ratingsCount?: number;
  editionCount?: number;
  ratingsAverage?: number;
};

export const SHELF_LABELS: Record<ShelfStatus, string> = {
  TO_BE_READ: 'To be read',
  READING: 'Reading',
  FINISHED: 'Finished',
};

export function findExistingLibraryMatch(
  books: LibraryBook[],
  candidate: Pick<BookCandidate, 'isbn13' | 'title' | 'author'>
): LibraryBook | undefined {
  const exact = books.find((book) => book.isbn13 === candidate.isbn13);
  if (exact) return exact;

  const identity = normalizeBookIdentity(candidate.title, candidate.author);
  return books.find((book) => normalizeBookIdentity(book.title, book.author) === identity);
}

function normalizeBookIdentity(title: string, author: string): string {
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .toLocaleLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${normalize(title)}|${normalize(author)}`;
}

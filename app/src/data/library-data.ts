import type { CoverTheme } from '@/components/typographic-cover';

export type ShelfStatus = 'TO_BE_READ' | 'FINISHED' | 'SNOOZE';

export type LibraryBook = {
  isbn13: string;
  title: string;
  author: string;
  publicationYear?: number;
  genre: string | null;
  coverTheme: CoverTheme;
  status: ShelfStatus;
  tmdbId?: number;
  moviePosterPath?: string | null;
  movieTitle?: string;
  movieYear?: number;
};

export type BookCandidate = Omit<
  LibraryBook,
  'status' | 'movieTitle' | 'movieYear' | 'tmdbId' | 'moviePosterPath'
> & {
  numberOfPages: number | null;
  publicationYear: number | null;
  subjects: readonly string[];
  source: 'openlibrary_manual' | 'googlebooks_manual';
};

export const SHELF_LABELS: Record<ShelfStatus, string> = {
  TO_BE_READ: 'To be read',
  FINISHED: 'Finished',
  SNOOZE: 'Snooze',
};

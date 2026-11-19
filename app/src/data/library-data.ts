import type { CoverTheme } from '@/components/typographic-cover';

export type ShelfStatus = 'TO_BE_READ' | 'FINISHED' | 'SNOOZE';

export type LibraryBook = {
  isbn13: string;
  title: string;
  author: string;
  genre: string | null;
  coverTheme: CoverTheme;
  status: ShelfStatus;
  movieTitle?: string;
  movieYear?: number;
  streamingProviders?: readonly string[];
};

export type BookCandidate = Omit<
  LibraryBook,
  'status' | 'movieTitle' | 'movieYear' | 'streamingProviders'
> & {
  numberOfPages: number | null;
  subjects: readonly string[];
  source: 'openlibrary_manual' | 'googlebooks_manual';
};

export const demoLibrary: readonly LibraryBook[] = [
  {
    isbn13: '9780345404473',
    title: 'Do Androids Dream of Electric Sheep?',
    author: 'Philip K. Dick',
    genre: 'Science fiction',
    coverTheme: 'scifi_teal',
    status: 'TO_BE_READ',
    movieTitle: 'Blade Runner',
    movieYear: 1982,
    streamingProviders: ['Prime Video', 'Apple TV'],
  },
  {
    isbn13: '9780441172719',
    title: 'Dune',
    author: 'Frank Herbert',
    genre: 'Science fiction',
    coverTheme: 'fantasy_plum',
    status: 'FINISHED',
    movieTitle: 'Dune: Part One',
    movieYear: 2021,
    streamingProviders: ['Max', 'Prime Video'],
  },
  {
    isbn13: '9780735211292',
    title: 'Atomic Habits',
    author: 'James Clear',
    genre: 'Psychology',
    coverTheme: 'nonfiction_forest',
    status: 'SNOOZE',
  },
];

export const demoCandidates: readonly BookCandidate[] = [
  {
    isbn13: '9780735211292',
    title: 'Atomic Habits',
    author: 'James Clear',
    genre: 'Psychology',
    coverTheme: 'nonfiction_forest',
    numberOfPages: 320,
    subjects: ['Self-help', 'Psychology'],
    source: 'openlibrary_manual',
  },
  {
    isbn13: '9780525559474',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    genre: 'Fantasy',
    coverTheme: 'fantasy_plum',
    numberOfPages: 304,
    subjects: ['Fantasy', 'Contemporary fiction'],
    source: 'openlibrary_manual',
  },
  {
    isbn13: '9780385547345',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    genre: 'Science fiction',
    coverTheme: 'scifi_teal',
    numberOfPages: 496,
    subjects: ['Science fiction', 'Space'],
    source: 'openlibrary_manual',
  },
];

export const SHELF_LABELS: Record<ShelfStatus, string> = {
  TO_BE_READ: 'To be read',
  FINISHED: 'Finished',
  SNOOZE: 'Snooze',
};

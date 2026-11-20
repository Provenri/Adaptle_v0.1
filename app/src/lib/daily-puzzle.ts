import type { CoverTheme } from '@/components/typographic-cover';

import type { DailyPuzzle, GameChoice } from './game-engine';
import { shuffleChoices } from './game-engine';
import { currentPuzzleDate } from './scores';
import { getSupabaseClient, initializeAnonymousSession } from './supabase';

export type CatalogRow = {
  isbn13: string;
  book_title: string;
  author: string;
  publication_year: number | null;
  genre: string | null;
  cover_theme: CoverTheme;
  tmdb_id: number | null;
  movie_title: string | null;
  release_year: number | null;
  director: string | null;
  movie_poster_path: string | null;
  lead_characters: unknown;
  lead_actors: unknown;
  setting_hint: string | null;
  character_hint: string | null;
};

export type ThreadRow = {
  pair_mode: 'BOOK_PAIR' | 'MOVIE_PAIR' | 'CROSSOVER';
  item_a_isbn13: string;
  item_b_isbn13: string;
  connection_category: string;
  connection_detail: string;
  decoy_1_category: string;
  decoy_1_detail: string;
  decoy_2_category: string;
  decoy_2_detail: string;
};

export type DailyRoundDetails = {
  isbn13: string;
  title: string;
  author: string;
  publicationYear: number | null;
  genre: string | null;
  coverTheme: CoverTheme;
  settingHint: string;
  characterHint: string;
  movieTitle: string;
  releaseYear: number;
  director: string;
  cast: string;
  characters: string;
  tmdbId: number | null;
  moviePosterPath: string | null;
};

export type BonusItem = {
  kind: 'book' | 'movie';
  title: string;
  author: string;
  genre: string | null;
  coverTheme: CoverTheme;
  movieTitle: string | null;
  moviePosterPath: string | null;
};

export type ProductionDailyPuzzle = {
  id: string;
  puzzleDate: string;
  puzzle: DailyPuzzle;
  roundDetails: Record<string, DailyRoundDetails>;
  bonusItems: readonly [BonusItem, BonusItem];
  pairMode: ThreadRow['pair_mode'];
};

export class PuzzleUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PuzzleUnavailableError';
  }
}

export async function fetchDailyPuzzle(): Promise<ProductionDailyPuzzle> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new PuzzleUnavailableError('Adaptle is not connected to Supabase yet.');
  }

  await initializeAnonymousSession();
  const puzzleDate = currentPuzzleDate();
  const { data: rows, error: booksError } = await supabase
    .from('catalog_items')
    .select(
      'isbn13,book_title,author,genre,cover_theme,publication_year,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_characters,lead_actors,setting_hint,character_hint'
    )
    .eq('scheduled_date', puzzleDate)
    .order('isbn13', { ascending: true });
  if (booksError) throw booksError;
  if (!rows || rows.length !== 5) {
    throw new PuzzleUnavailableError(
      `Today's puzzle is not ready yet. Expected 5 published books but found ${rows?.length ?? 0}.`
    );
  }

  const books = rows as CatalogRow[];
  validateBooks(books);

  const { data: thread, error: threadError } = await supabase
    .from('common_thread_pairs')
    .select(
      'pair_mode,item_a_isbn13,item_b_isbn13,connection_category,connection_detail,decoy_1_category,decoy_1_detail,decoy_2_category,decoy_2_detail'
    )
    .eq('scheduled_date', puzzleDate)
    .maybeSingle();
  if (threadError) throw threadError;
  if (!thread) {
    throw new PuzzleUnavailableError(
      "Today's five books are published, but its common-thread bonus is not ready yet."
    );
  }

  const threadRow = thread as ThreadRow;
  const bonusIsbns = [threadRow.item_a_isbn13, threadRow.item_b_isbn13];
  const { data: bonusRows, error: bonusError } = await supabase
    .from('catalog_items')
    .select(
      'isbn13,book_title,author,genre,cover_theme,publication_year,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_characters,lead_actors,setting_hint,character_hint'
    )
    .in('isbn13', bonusIsbns);
  if (bonusError) throw bonusError;
  if (!bonusRows || bonusRows.length !== 2) {
    throw new PuzzleUnavailableError("Today's common-thread works are not available yet.");
  }

  return buildDailyPuzzle(puzzleDate, books, threadRow, bonusRows as CatalogRow[]);
}

export function buildDailyPuzzle(
  puzzleDate: string,
  books: CatalogRow[],
  thread: ThreadRow,
  bonusRows: CatalogRow[]
): ProductionDailyPuzzle {
  if (books.length !== 5) {
    throw new PuzzleUnavailableError(
      `Today's puzzle is not ready yet. Expected 5 published books but found ${books.length}.`
    );
  }
  validateBooks(books);
  if (bonusRows.length !== 2) {
    throw new PuzzleUnavailableError("Today's common-thread works are not available yet.");
  }

  const bonusBooksByIsbn = new Map(bonusRows.map((book) => [book.isbn13, book]));
  const firstBonus = bonusBooksByIsbn.get(thread.item_a_isbn13);
  const secondBonus = bonusBooksByIsbn.get(thread.item_b_isbn13);
  if (!firstBonus || !secondBonus) {
    throw new PuzzleUnavailableError("Today's common-thread works are not available yet.");
  }

  return {
    id: puzzleSequenceForDate(puzzleDate),
    puzzleDate,
    puzzle: toGamePuzzle(puzzleDate, books, thread),
    roundDetails: Object.fromEntries(books.map((book) => [book.isbn13, toRoundDetails(book)])),
    bonusItems: [
      toBonusItem(firstBonus, thread.pair_mode, 0),
      toBonusItem(secondBonus, thread.pair_mode, 1),
    ],
    pairMode: thread.pair_mode,
  };
}

function toGamePuzzle(date: string, books: CatalogRow[], thread: ThreadRow): DailyPuzzle {
  const castChoices = books.map((book): GameChoice => ({
    id: `${book.isbn13}-cast`,
    label: readStringArray(book.lead_actors, 'lead_actors', 2).join(' & '),
  }));

  return {
    id: puzzleSequenceForDate(date),
    rounds: books.map((book, index) => {
      const correct = castChoices[index]!;
      const alternatives = [correct, castChoices[(index + 1) % 5]!, castChoices[(index + 3) % 5]!];
      return {
        id: book.isbn13,
        correctChoiceId: correct.id,
        choices: shuffleChoices(alternatives, `${date}:${book.isbn13}`),
      };
    }),
    bonus: {
      id: `${thread.item_a_isbn13}-${thread.item_b_isbn13}`,
      correctChoiceId: 'connection',
      choices: shuffleChoices(
        [
          {
            id: 'connection',
            label: `${thread.connection_category} — ${thread.connection_detail}`,
          },
          {
            id: 'decoy-1',
            label: `${thread.decoy_1_category} — ${thread.decoy_1_detail}`,
          },
          {
            id: 'decoy-2',
            label: `${thread.decoy_2_category} — ${thread.decoy_2_detail}`,
          },
        ],
        `${date}:bonus`
      ),
    },
  };
}

function toRoundDetails(book: CatalogRow): DailyRoundDetails {
  return {
    isbn13: book.isbn13,
    title: book.book_title,
    author: book.author,
    publicationYear: book.publication_year,
    genre: book.genre,
    coverTheme: book.cover_theme,
    settingHint: requireText(book.setting_hint, 'setting_hint'),
    characterHint: requireText(book.character_hint, 'character_hint'),
    movieTitle: requireText(book.movie_title, 'movie_title'),
    releaseYear: requireNumber(book.release_year, 'release_year'),
    director: requireText(book.director, 'director'),
    cast: readStringArray(book.lead_actors, 'lead_actors', 2).join(', '),
    characters: readStringArray(book.lead_characters, 'lead_characters', 2).join(' & '),
    tmdbId: book.tmdb_id,
    moviePosterPath: book.movie_poster_path,
  };
}

function toBonusItem(book: CatalogRow, pairMode: ThreadRow['pair_mode'], index: number): BonusItem {
  return {
    kind: pairMode === 'BOOK_PAIR' || (pairMode === 'CROSSOVER' && index === 0) ? 'book' : 'movie',
    title: book.book_title,
    author: book.author,
    genre: book.genre,
    coverTheme: book.cover_theme,
    movieTitle: book.movie_title,
    moviePosterPath: book.movie_poster_path,
  };
}

function validateBooks(books: CatalogRow[]): void {
  for (const book of books) {
    requireText(book.book_title, 'book_title');
    requireText(book.author, 'author');
    readStringArray(book.lead_characters, 'lead_characters', 2);
    readStringArray(book.lead_actors, 'lead_actors', 2);
    toRoundDetails(book);
  }
}

function readStringArray(value: unknown, field: string, expectedLength: number): string[] {
  if (!Array.isArray(value) || value.length < expectedLength) {
    throw new PuzzleUnavailableError(`Today's puzzle has invalid ${field} data.`);
  }
  const strings = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0
  );
  if (strings.length < expectedLength) {
    throw new PuzzleUnavailableError(`Today's puzzle has invalid ${field} data.`);
  }
  return strings.slice(0, expectedLength);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PuzzleUnavailableError(`Today's puzzle is missing ${field}.`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PuzzleUnavailableError(`Today's puzzle is missing ${field}.`);
  }
  return value;
}

function puzzleSequenceForDate(date: string): string {
  const launch = Date.parse('2026-11-20T00:00:00Z');
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - launch) / 86_400_000);
  return String(Math.max(1, day + 1));
}

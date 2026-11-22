import type { CoverTheme } from '@/components/typographic-cover';

import type { DailyPuzzle, GameChoice } from './game-engine';
import type { BookCandidate } from '@/data/library-data';
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
  story_premise: string | null;
  premise_short: string | null;
  premise_keywords: unknown;
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
  storyPremise: string;
  premiseShort: string;
  premiseKeywords: string[];
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

export type AdaptationPractice = {
  details: DailyRoundDetails;
  choices: GameChoice[];
  correctChoiceId: string;
};

export async function fetchAdaptationPractice(
  isbn13: string,
  title?: string,
  author?: string,
  tmdbId?: number,
  resolvedTarget?: BookCandidate
): Promise<AdaptationPractice> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new PuzzleUnavailableError('Adaptle is not connected to Supabase yet.');
  await initializeAnonymousSession();

  const select =
    'isbn13,book_title,author,genre,cover_theme,publication_year,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_characters,lead_actors,setting_hint,character_hint,story_premise,premise_short,premise_keywords';
  let { data: target, error: targetError } = await supabase
    .from('catalog_items')
    .select(select)
    .eq('isbn13', isbn13)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target && resolvedTarget) {
    target = catalogRowFromCandidate(resolvedTarget);
  }
  if ((!target || !target.tmdb_id) && tmdbId) {
    const byTmdb = await supabase
      .from('catalog_items')
      .select(select)
      .eq('tmdb_id', tmdbId)
      .limit(1)
      .maybeSingle();
    if (byTmdb.error) throw byTmdb.error;
    target = byTmdb.data;
  }
  if ((!target || !target.tmdb_id) && title && author) {
    const fallback = await supabase
      .from('catalog_items')
      .select(select)
      .ilike('book_title', `%${normalizeCatalogLabel(title).replace(/^the /i, '')}%`)
      .ilike('author', `%${normalizeCatalogLabel(author).split(/\s+/).at(-1) ?? ''}%`)
      .not('tmdb_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    target = fallback.data;
  }
  if (!target || !target.tmdb_id) {
    throw new PuzzleUnavailableError('This book does not have a playable screen adaptation.');
  }
  const targetDetails = toRoundDetails(target as CatalogRow);

  const { data: decoyRows, error: decoyError } = await supabase
    .from('catalog_items')
    .select(select)
    .neq('isbn13', target.isbn13)
    .not('tmdb_id', 'is', null)
    .not('premise_short', 'is', null)
    .not('premise_keywords', 'is', null)
    .limit(30);
  if (decoyError) throw decoyError;
  const validDecoys = (decoyRows as CatalogRow[]).filter(hasPremiseChoice);
  if (validDecoys.length < 2)
    throw new PuzzleUnavailableError('Practice choices are not ready yet.');

  const correct = toPremiseChoice(target as CatalogRow);
  const selected = selectPremiseDecoys(target as CatalogRow, validDecoys, `${isbn13}:practice`);

  return {
    details: targetDetails,
    correctChoiceId: correct.id,
    choices: shuffleChoices([correct, ...selected], `${isbn13}:practice-choices`),
  };
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
      'isbn13,book_title,author,genre,cover_theme,publication_year,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_characters,lead_actors,setting_hint,character_hint,story_premise,premise_short,premise_keywords'
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

  let { data: thread, error: threadError } = await supabase
    .from('common_thread_pairs')
    .select(
      'pair_mode,item_a_isbn13,item_b_isbn13,connection_category,connection_detail,decoy_1_category,decoy_1_detail,decoy_2_category,decoy_2_detail'
    )
    .eq('scheduled_date', puzzleDate)
    .maybeSingle();
  if (threadError) throw threadError;
  if (!thread) {
    const fallback = await supabase
      .from('common_thread_pairs')
      .select(
        'pair_mode,item_a_isbn13,item_b_isbn13,connection_category,connection_detail,decoy_1_category,decoy_1_detail,decoy_2_category,decoy_2_detail'
      )
      .lte('scheduled_date', puzzleDate)
      .order('scheduled_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    thread = fallback.data;
  }
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
      'isbn13,book_title,author,genre,cover_theme,publication_year,tmdb_id,movie_title,release_year,director,movie_poster_path,lead_characters,lead_actors,setting_hint,character_hint,story_premise,premise_short,premise_keywords'
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
  return {
    id: puzzleSequenceForDate(date),
    rounds: books.map((book, index) => {
      const correct = toPremiseChoice(book);
      const decoys = selectPremiseDecoys(
        book,
        books.filter((candidate) => candidate.isbn13 !== book.isbn13),
        `${date}:${book.isbn13}:decoys`
      );
      return {
        id: book.isbn13,
        correctChoiceId: correct.id,
        choices: shuffleChoices([correct, ...decoys], `${date}:${book.isbn13}:${index}`),
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
    storyPremise: optionalText(book.story_premise) ?? requirePremise(book.premise_short),
    premiseShort: requirePremise(book.premise_short),
    premiseKeywords: readPremiseKeywords(book.premise_keywords),
    movieTitle: requireText(book.movie_title, 'movie_title'),
    releaseYear: requireNumber(book.release_year, 'release_year'),
    director: requireText(book.director, 'director'),
    cast: readOptionalStringArray(book.lead_actors).join(', '),
    characters: readOptionalStringArray(book.lead_characters).join(' & '),
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

function catalogRowFromCandidate(candidate: BookCandidate): CatalogRow {
  return {
    isbn13: candidate.isbn13,
    book_title: candidate.title,
    author: candidate.author,
    publication_year: candidate.publicationYear,
    genre: candidate.genre,
    cover_theme: candidate.coverTheme,
    tmdb_id: candidate.tmdbId ?? null,
    movie_title: candidate.movieTitle ?? null,
    release_year: candidate.releaseYear ?? null,
    director: candidate.director ?? null,
    movie_poster_path: candidate.moviePosterPath ?? null,
    lead_actors: candidate.leadActors ?? null,
    lead_characters: candidate.leadCharacters ?? null,
    setting_hint: candidate.settingHint ?? null,
    character_hint: candidate.characterHint ?? null,
    story_premise: candidate.storyPremise ?? null,
    premise_short: candidate.premiseShort ?? null,
    premise_keywords: candidate.premiseKeywords ?? null,
  };
}

function validateBooks(books: CatalogRow[]): void {
  for (const book of books) {
    requireText(book.book_title, 'book_title');
    requireText(book.author, 'author');
    toRoundDetails(book);
  }
}

function toPremiseChoice(book: CatalogRow): GameChoice {
  return {
    id: `${book.isbn13}-premise`,
    label: requirePremise(book.premise_short),
  };
}

function selectPremiseDecoys(
  target: CatalogRow,
  candidates: CatalogRow[],
  seed: string
): GameChoice[] {
  const correctLabel = normalizeCatalogLabel(requirePremise(target.premise_short));
  const eligible = candidates
    .filter((candidate) => candidate.isbn13 !== target.isbn13)
    .filter(hasPremiseChoice)
    .filter(
      (candidate) =>
        normalizeCatalogLabel(toPremiseChoice(candidate).label).toLowerCase() !==
        correctLabel.toLowerCase()
    );
  const selected: GameChoice[] = [];
  const seenLabels = new Set([correctLabel.toLowerCase()]);
  const ordered = [
    ...shuffleChoices(
      eligible.filter((candidate) => candidate.genre === target.genre).map(toPremiseChoice),
      `${seed}:same-genre`
    ),
    ...shuffleChoices(
      eligible.filter((candidate) => candidate.genre !== target.genre).map(toPremiseChoice),
      `${seed}:other-genres`
    ),
  ];
  for (const candidate of ordered) {
    const normalized = normalizeCatalogLabel(candidate.label).toLowerCase();
    if (seenLabels.has(normalized)) continue;
    seenLabels.add(normalized);
    selected.push(candidate);
    if (selected.length === 2) break;
  }
  if (selected.length < 2) {
    throw new PuzzleUnavailableError('Premise choices are not ready yet.');
  }
  return selected;
}

function readOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function hasPremiseChoice(book: CatalogRow): boolean {
  return (
    typeof book.premise_short === 'string' &&
    book.premise_short.trim().length > 0 &&
    book.premise_short.length <= 70
  );
}

function readPremiseKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new PuzzleUnavailableError("Today's puzzle has invalid premise_keywords data.");
  }
  const keywords = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (keywords.some((keyword) => keyword.length === 0 || keyword.length > 24)) {
    throw new PuzzleUnavailableError("Today's puzzle has invalid premise_keywords data.");
  }
  return keywords;
}

function requirePremise(value: unknown): string {
  const premise = requireText(value, 'premise_short');
  if (premise.length > 70) {
    throw new PuzzleUnavailableError("Today's puzzle has invalid premise_short data.");
  }
  return premise;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PuzzleUnavailableError(`Today's puzzle is missing ${field}.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCatalogLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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

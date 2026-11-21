import { writeCheckpoint } from '../lib/checkpoint.js';
import { requireEnv } from '../lib/env.js';
import { fetchJson } from '../lib/http.js';

type ScheduledBook = {
  isbn13: string;
  book_title: string;
  author: string;
  genre: string | null;
  publication_year: number | null;
  release_year: number | null;
  scheduled_date: string;
};

type ScheduledThread = {
  id: string;
  scheduled_date: string;
  item_a_isbn13: string;
  item_b_isbn13: string;
};

type PlannedBook = ScheduledBook & { planned_date: string };

export async function reshuffleSchedule(options: {
  startDate: string;
  endDate: string;
  seed: string;
  apply: boolean;
}): Promise<void> {
  const baseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  const books =
    (await fetchJson<ScheduledBook[]>(
      `${baseUrl}/rest/v1/catalog_items?scheduled_date=gte.${options.startDate}&scheduled_date=lte.${options.endDate}&select=isbn13,book_title,author,genre,publication_year,release_year,scheduled_date`,
      { headers }
    )) ?? [];
  const threads =
    (await fetchJson<ScheduledThread[]>(
      `${baseUrl}/rest/v1/common_thread_pairs?scheduled_date=gte.${options.startDate}&scheduled_date=lte.${options.endDate}&select=id,scheduled_date,item_a_isbn13,item_b_isbn13&order=scheduled_date.asc`,
      { headers }
    )) ?? [];
  const referenceRows =
    (await fetchJson<Array<{ isbn13: string; scheduled_date: string | null }>>(
      `${baseUrl}/rest/v1/catalog_items?select=isbn13,scheduled_date`,
      { headers }
    )) ?? [];

  const dates = sortedUnique(books.map((book) => book.scheduled_date));
  if (
    books.length !== dates.length * 5 ||
    new Set(threads.map((thread) => thread.scheduled_date)).size !== threads.length
  ) {
    throw new Error('The selected range does not contain complete five-book puzzle days.');
  }

  const planned = buildPlan(books, threads, dates, options.seed);
  validatePlan(
    planned,
    threads,
    new Map(referenceRows.map((row) => [row.isbn13, row.scheduled_date]))
  );

  if (options.apply) {
    for (const book of planned) {
      await fetchJson(
        `${baseUrl}/rest/v1/catalog_items?isbn13=eq.${book.isbn13}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: { scheduled_date: book.planned_date },
        }
      );
    }
  }

  const moved = planned.filter((book) => book.scheduled_date !== book.planned_date);
  const days = dates.map((date) => ({
    date,
    books: planned
      .filter((book) => book.planned_date === date)
      .map((book) => ({
        title: book.book_title,
        author: book.author,
        genre: book.genre,
        movieYear: book.release_year,
      })),
  }));
  const report = {
    startDate: options.startDate,
    endDate: options.endDate,
    seed: options.seed,
    dates: dates.length,
    books: planned.length,
    threads: threads.length,
    moved: moved.length,
    applied: options.apply,
    days,
  };
  writeCheckpoint('08-schedule-reshuffle', [report]);
  console.log(JSON.stringify(report, null, 2));
}

function buildPlan(
  books: ScheduledBook[],
  threads: ScheduledThread[],
  dates: string[],
  seed: string
): PlannedBook[] {
  const bookByIsbn = new Map(books.map((book) => [book.isbn13, book]));
  const remaining = new Map(bookByIsbn);
  const plannedDateByIsbn = new Map<string, string>();
  const plan: PlannedBook[] = [];
  let previousAuthors = new Set<string>();
  let previousGenres = new Set<string>();
  const earliestThreadDate = new Map<string, string>();
  for (const thread of threads) {
    for (const isbn13 of [thread.item_a_isbn13, thread.item_b_isbn13]) {
      const current = earliestThreadDate.get(isbn13);
      if (!current || thread.scheduled_date < current) {
        earliestThreadDate.set(isbn13, thread.scheduled_date);
      }
    }
  }

  for (const date of dates) {
    const required = [...earliestThreadDate.entries()]
      .filter(([, deadline]) => deadline === date)
      .map(([isbn13]) => isbn13)
      .map((isbn13) => remaining.get(isbn13))
      .filter((book): book is ScheduledBook => Boolean(book));
    const day = dedupeBooks(required);
    if (day.length > 5) throw new Error(`Too many required books on ${date}.`);

    for (const book of day) {
      remaining.delete(book.isbn13);
    }

    while (day.length < 5) {
      const candidates = [...remaining.values()];
      const ranked = candidates
        .map((book) => ({
          book,
          score: diversityScore(book, day, previousAuthors, previousGenres, seed),
        }))
        .sort((left, right) => right.score - left.score || stableCompare(left.book, right.book));
      const next = ranked[0]?.book;
      if (!next) throw new Error(`Not enough books remain for ${date}.`);
      day.push(next);
      remaining.delete(next.isbn13);
    }

    previousAuthors = new Set(day.map((book) => normalize(book.author)));
    previousGenres = new Set(day.map((book) => normalize(book.genre ?? 'unknown')));
    for (const book of day) {
      plannedDateByIsbn.set(book.isbn13, date);
      plan.push({ ...book, planned_date: date });
    }
  }

  if (remaining.size > 0 || plannedDateByIsbn.size !== books.length) {
    throw new Error('The reshuffle did not assign every book exactly once.');
  }
  return plan;
}

function diversityScore(
  book: ScheduledBook,
  day: ScheduledBook[],
  previousAuthors: Set<string>,
  previousGenres: Set<string>,
  seed: string
): number {
  const author = normalize(book.author);
  const genre = normalize(book.genre ?? 'unknown');
  const authors = new Set(day.map((item) => normalize(item.author)));
  const genres = new Set(day.map((item) => normalize(item.genre ?? 'unknown')));
  const publicationDecades = new Set(
    day.map((item) => Math.floor((item.publication_year ?? 0) / 10))
  );
  const releaseYears = new Set(day.map((item) => item.release_year ?? 0));
  let score = hash(`${seed}:${book.isbn13}`) % 1_000_000;
  if (!authors.has(author)) score += 1_000_000_000;
  if (!genres.has(genre)) score += 300_000_000;
  if (!publicationDecades.has(Math.floor((book.publication_year ?? 0) / 10))) score += 50_000_000;
  if (!releaseYears.has(book.release_year ?? 0)) score += 20_000_000;
  if (previousAuthors.has(author)) score -= 250_000_000;
  if (previousGenres.has(genre)) score -= 80_000_000;
  return score;
}

function validatePlan(
  planned: PlannedBook[],
  threads: ScheduledThread[],
  originalDateByIsbn: Map<string, string | null>
): void {
  const dateByIsbn = new Map(planned.map((book) => [book.isbn13, book.planned_date]));
  for (const thread of threads) {
    const aDate =
      dateByIsbn.get(thread.item_a_isbn13) ?? originalDateByIsbn.get(thread.item_a_isbn13);
    const bDate =
      dateByIsbn.get(thread.item_b_isbn13) ?? originalDateByIsbn.get(thread.item_b_isbn13);
    if (!aDate || !bDate || aDate > thread.scheduled_date || bDate > thread.scheduled_date) {
      throw new Error(`Thread ${thread.id} would reference an unpublished book.`);
    }
  }
  const counts = new Map<string, number>();
  for (const book of planned) counts.set(book.planned_date, (counts.get(book.planned_date) ?? 0) + 1);
  if ([...counts.values()].some((count) => count !== 5)) {
    throw new Error('Each scheduled date must contain exactly five books.');
  }
}

function dedupeBooks(books: ScheduledBook[]): ScheduledBook[] {
  return [...new Map(books.map((book) => [book.isbn13, book])).values()];
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function stableCompare(left: ScheduledBook, right: ScheduledBook): number {
  return left.isbn13.localeCompare(right.isbn13);
}

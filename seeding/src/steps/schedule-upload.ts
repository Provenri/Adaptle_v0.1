import { readCheckpoint, writeCheckpoint } from "../lib/checkpoint.js";
import { requireEnv } from "../lib/env.js";
import { fetchJson } from "../lib/http.js";
import {
  CommonThreadSchema,
  HintedBookSchema,
  type CommonThread,
  type HintedBook,
} from "../types.js";

/** Rounds per daily puzzle (see Adaptle.md section 4). */
export const BOOKS_PER_DAY = 5;

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface ScheduledBook {
  book: HintedBook;
  scheduledDate: string;
}

export function alignBooksToThreads(
  books: HintedBook[],
  threads: CommonThread[],
): HintedBook[] {
  const dayCount = Math.floor(books.length / BOOKS_PER_DAY);
  if (dayCount === 0 || threads.length < dayCount) return books;

  const remaining = new Map(books.map((book) => [book.isbn13, book]));
  const ordered: HintedBook[] = [];
  const usedThreads = new Set<CommonThread>();

  for (let day = 0; day < dayCount; day++) {
    const thread = threads.find(
      (candidate) =>
        !usedThreads.has(candidate) &&
        (remaining.has(candidate.itemAIsbn13) ||
          remaining.has(candidate.itemBIsbn13)),
    );
    if (thread) {
      usedThreads.add(thread);
      for (const isbn of [thread.itemAIsbn13, thread.itemBIsbn13]) {
        const book = remaining.get(isbn);
        if (book) {
          ordered.push(book);
          remaining.delete(isbn);
        }
      }
    }

    const filler = [...remaining.values()].slice(
      0,
      BOOKS_PER_DAY - (ordered.length % BOOKS_PER_DAY),
    );
    for (const book of filler) {
      ordered.push(book);
      remaining.delete(book.isbn13);
    }
  }

  return [...ordered, ...remaining.values()];
}

/**
 * Chunks books into days of exactly BOOKS_PER_DAY. Only complete days are
 * scheduled — leftovers are excluded (they stay in the checkpoint for a
 * future, larger run). Round decoys are drawn from same-day items in the app,
 * so a complete set of 5 per day is a hard requirement.
 */
export function scheduleBooks(
  books: HintedBook[],
  startDate: string,
): { scheduled: ScheduledBook[]; leftover: HintedBook[] } {
  const completeDays = Math.floor(books.length / BOOKS_PER_DAY);
  const scheduled: ScheduledBook[] = [];
  for (let i = 0; i < completeDays * BOOKS_PER_DAY; i++) {
    scheduled.push({
      book: books[i]!,
      scheduledDate: addDays(startDate, Math.floor(i / BOOKS_PER_DAY)),
    });
  }
  return { scheduled, leftover: books.slice(completeDays * BOOKS_PER_DAY) };
}

export interface ScheduledThread {
  thread: CommonThread;
  scheduledDate: string;
}

/**
 * Assigns one bonus thread per puzzle day. A thread may only run once both of
 * its catalog items are published (RLS hides future-scheduled rows), so each
 * thread's earliest eligible day is the later of its two items' dates.
 * Greedy: each day takes the eligible thread with the earliest constraint,
 * with a three-day exposure window before a book may appear in a bonus.
 */
export function scheduleThreads(
  threads: CommonThread[],
  bookDateByIsbn: Map<string, string>,
  startDate: string,
  dayCount: number,
): { scheduled: ScheduledThread[]; unassigned: CommonThread[] } {
  const withMinDate = threads
    .map((thread) => {
      const dateA = bookDateByIsbn.get(thread.itemAIsbn13);
      const dateB = bookDateByIsbn.get(thread.itemBIsbn13);
      if (!dateA || !dateB) return null; // item not scheduled -> can't use
      const latestBookDate = dateA > dateB ? dateA : dateB;
      return { thread, minDate: addDays(latestBookDate, 3) };
    })
    .filter((t): t is { thread: CommonThread; minDate: string } => t !== null)
    .sort((a, b) => a.minDate.localeCompare(b.minDate));

  const scheduled: ScheduledThread[] = [];
  const remaining = [...withMinDate];

  for (let day = 0; day < dayCount; day++) {
    const date = addDays(startDate, day);
    const index = remaining.findIndex((t) => t.minDate <= date);
    if (index === -1) continue;
    const [candidate] = remaining.splice(index, 1);
    scheduled.push({ thread: candidate!.thread, scheduledDate: date });
  }

  const unassignedSet = new Set(remaining.map((t) => t.thread));
  const unusable = threads.filter(
    (t) => !withMinDate.some((w) => w.thread === t) || unassignedSet.has(t),
  );
  return { scheduled, unassigned: unusable };
}

/** Maps a scheduled book to a catalog_items row (snake_case DB columns). */
export function toCatalogRow(item: ScheduledBook): Record<string, unknown> {
  const { book, scheduledDate } = item;
  return {
    isbn13: book.isbn13,
    book_title: book.bookTitle,
    author: book.author,
    genre: book.genre,
    cover_theme: book.coverTheme,
    metadata_source: "wikidata_openlibrary",
    number_of_pages: book.numberOfPages,
    publication_year: book.bookPublicationYear,
    tmdb_id: book.tmdbId,
    movie_title: book.tmdbTitle,
    release_year: book.releaseYear,
    director: book.director,
    movie_poster_path: book.moviePosterPath,
    lead_characters: book.leadCharacters,
    lead_actors: book.leadActors,
    setting_hint: book.settingHint,
    character_hint: book.characterHint,
    story_premise: book.storyPremise,
    premise_short: book.premiseShort,
    premise_decoys: book.premiseDecoys,
    premise_keywords: book.premiseKeywords,
    scheduled_date: scheduledDate,
  };
}

export function toThreadRow(item: ScheduledThread): Record<string, unknown> {
  const { thread, scheduledDate } = item;
  return {
    pair_mode: thread.pairMode,
    item_a_isbn13: thread.itemAIsbn13,
    item_b_isbn13: thread.itemBIsbn13,
    connection_category: thread.connectionCategory,
    connection_detail: thread.connectionDetail,
    decoy_1_category: thread.decoy1Category,
    decoy_1_detail: thread.decoy1Detail,
    decoy_2_category: thread.decoy2Category,
    decoy_2_detail: thread.decoy2Detail,
    scheduled_date: scheduledDate,
  };
}

async function upsert(
  baseUrl: string,
  serviceKey: string,
  table: string,
  onConflict: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    await fetchJson(`${baseUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: rows.slice(i, i + BATCH),
      retries: 2,
    });
  }
}

/** Tomorrow in the puzzle timezone (Europe/Berlin), so today's play is undisturbed. */
export function defaultStartDate(now = new Date()): string {
  const berlinToday = now.toLocaleDateString("en-CA", {
    timeZone: "Europe/Berlin",
  });
  return addDays(berlinToday, 1);
}

export async function scheduleAndUpload(options: {
  startDate?: string;
  dryRun?: boolean;
}): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const startDate = options.startDate ?? defaultStartDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error(`--start-date must be YYYY-MM-DD, got "${startDate}"`);
  }

  const books = readCheckpoint("04-hinted-books", HintedBookSchema);
  const threads = readCheckpoint("05-common-threads", CommonThreadSchema);

  const alignedBooks = alignBooksToThreads(books, threads);
  const { scheduled, leftover } = scheduleBooks(alignedBooks, startDate);
  const dayCount = scheduled.length / BOOKS_PER_DAY;
  const bookDateByIsbn = new Map(
    scheduled.map((s) => [s.book.isbn13, s.scheduledDate]),
  );
  const threadPlan = scheduleThreads(
    threads,
    bookDateByIsbn,
    startDate,
    dayCount,
  );

  console.log(
    `Scheduling ${scheduled.length} books across ${dayCount} days starting ${startDate}` +
      (leftover.length
        ? ` (${leftover.length} leftover books not uploaded)`
        : ""),
  );
  console.log(
    `Scheduling ${threadPlan.scheduled.length}/${threads.length} bonus threads` +
      (threadPlan.unassigned.length
        ? ` (${threadPlan.unassigned.length} unassigned)`
        : ""),
  );

  if (!options.dryRun) {
    await upsert(
      supabaseUrl,
      serviceKey,
      "catalog_items",
      "isbn13",
      scheduled.map(toCatalogRow),
    );
    console.log("catalog_items upserted.");
    await upsert(
      supabaseUrl,
      serviceKey,
      "common_thread_pairs",
      "scheduled_date",
      threadPlan.scheduled.map(toThreadRow),
    );
    console.log("common_thread_pairs upserted.");
  }

  const manifest = {
    startDate,
    days: dayCount,
    booksUploaded: scheduled.length,
    threadsUploaded: threadPlan.scheduled.length,
    leftoverBooks: leftover.map((b) => b.isbn13),
    applied: !options.dryRun,
    uploadedAt: options.dryRun ? null : new Date().toISOString(),
  };
  const path = writeCheckpoint("06-upload-manifest", [manifest]);
  console.log(`Upload manifest written: ${path}`);
}

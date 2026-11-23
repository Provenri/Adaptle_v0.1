import { z } from "zod";

import { readCheckpoint, writeCheckpoint } from "../lib/checkpoint.js";
import { requireEnv } from "../lib/env.js";
import { fetchJson } from "../lib/http.js";
import { addDays } from "./schedule-upload.js";

type CatalogBook = {
  isbn13: string;
  book_title: string;
  author: string;
  genre: string | null;
  release_year: number | null;
  scheduled_date: string | null;
};

type ThreadRow = {
  id: string;
  pair_mode: "BOOK_PAIR" | "MOVIE_PAIR" | "CROSSOVER";
  item_a_isbn13: string;
  item_b_isbn13: string;
  connection_category: string;
  connection_detail: string;
  decoy_1_category: string;
  decoy_1_detail: string;
  decoy_2_category: string;
  decoy_2_detail: string;
};

export type PlannedDay = {
  date: string;
  recent: number;
  older: number;
  books: CatalogBook[];
  thread: ThreadRow | null;
};

const RECENT_YEAR = 1996;

export async function buildHybridSchedule(options: {
  seed: string;
  apply: boolean;
  days?: number;
}): Promise<void> {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (options.apply) {
    await applyReviewedSchedule(baseUrl, serviceKey);
    return;
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const books =
    (await fetchJson<CatalogBook[]>(
      `${baseUrl}/rest/v1/catalog_items?select=isbn13,book_title,author,genre,release_year,scheduled_date&tmdb_id=not.is.null&premise_short=not.is.null&premise_decoys=not.is.null&premise_keywords=not.is.null`,
      { headers },
    )) ?? [];
  const threads =
    (await fetchJson<ThreadRow[]>(
      `${baseUrl}/rest/v1/common_thread_pairs?select=id,pair_mode,item_a_isbn13,item_b_isbn13,connection_category,connection_detail,decoy_1_category,decoy_1_detail,decoy_2_category,decoy_2_detail`,
      { headers },
    )) ?? [];
  const today = currentPuzzleDate();
  const protectedBooks = books.filter(
    (book) => book.scheduled_date && book.scheduled_date <= today,
  );
  const candidates = books.filter(
    (book) => !book.scheduled_date || book.scheduled_date > today,
  );
  const plan = createHybridPlan(
    candidates,
    threads,
    today,
    options.seed,
    options.days,
  );

  const report = {
    seed: options.seed,
    protectedHistoricalBooks: protectedBooks.length,
    playablePool: books.length,
    candidatePool: candidates.length,
    startDate: plan.days[0]?.date ?? null,
    endDate: plan.days.at(-1)?.date ?? null,
    days: plan.days.length,
    booksScheduled: plan.days.length * 5,
    threadAssignments: plan.days.filter((day) => day.thread).length,
    missingThreadDays: plan.days
      .filter((day) => !day.thread)
      .map((day) => day.date),
    recentBooks: plan.days.length * 3,
    olderBooks: plan.days.length * 2,
    leftover: plan.leftover.length,
    applied: options.apply,
    plan,
  };
  writeCheckpoint("10-hybrid-future-schedule", [report]);

  if (!options.apply) {
    console.log(JSON.stringify(report, null, 2));
    console.log(
      "Dry run only. Review 10-hybrid-future-schedule.json before using --apply.",
    );
    return;
  }

  async function applyReviewedSchedule(
    baseUrl: string,
    serviceKey: string,
  ): Promise<void> {
    const [report] = readCheckpoint(
      "10-hybrid-future-schedule",
      z.custom<{
        applied: boolean;
        missingThreadDays: string[];
        plan: { days: PlannedDay[]; leftover: CatalogBook[] };
      }>((value) =>
        Boolean(value && typeof value === "object" && "plan" in value),
      ),
    );
    if (!report || report.applied) {
      throw new Error("No unapplied reviewed future schedule is available.");
    }
    if (report.missingThreadDays.length > 0) {
      throw new Error(
        `Cannot apply ${report.missingThreadDays.length} dates without Common Threads.`,
      );
    }
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };
    const today = currentPuzzleDate();
    const futureBooks =
      (await fetchJson<Array<{ isbn13: string }>>(
        `${baseUrl}/rest/v1/catalog_items?select=isbn13&scheduled_date=gt.${today}`,
        { headers },
      )) ?? [];
    for (const book of futureBooks) {
      await patchRow(
        baseUrl,
        serviceKey,
        "catalog_items",
        "isbn13",
        book.isbn13,
        {
          scheduled_date: null,
        },
      );
    }
    for (const day of report.plan.days) {
      if (
        day.books.length !== 5 ||
        day.recent !== 3 ||
        day.older !== 2 ||
        !day.thread
      ) {
        throw new Error(`Invalid reviewed schedule day ${day.date}.`);
      }
      for (const book of day.books) {
        await patchRow(
          baseUrl,
          serviceKey,
          "catalog_items",
          "isbn13",
          book.isbn13,
          { scheduled_date: day.date },
        );
      }
    }
    const futureThreads =
      (await fetchJson<Array<{ id: string }>>(
        `${baseUrl}/rest/v1/common_thread_pairs?select=id&scheduled_date=gt.${today}`,
        { headers },
      )) ?? [];
    for (const thread of futureThreads) {
      await patchRow(
        baseUrl,
        serviceKey,
        "common_thread_pairs",
        "id",
        thread.id,
        {
          scheduled_date: null,
        },
      );
    }
    for (const day of report.plan.days) {
      const thread = day.thread!;
      await fetchJson(`${baseUrl}/rest/v1/common_thread_pairs`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: {
          pair_mode: thread.pair_mode,
          item_a_isbn13: thread.item_a_isbn13,
          item_b_isbn13: thread.item_b_isbn13,
          connection_category: thread.connection_category,
          connection_detail: thread.connection_detail,
          decoy_1_category: thread.decoy_1_category,
          decoy_1_detail: thread.decoy_1_detail,
          decoy_2_category: thread.decoy_2_category,
          decoy_2_detail: thread.decoy_2_detail,
          scheduled_date: day.date,
        },
      });
    }
    writeCheckpoint("10-hybrid-future-schedule", [
      { ...report, applied: true },
    ]);
    console.log(
      `Applied ${report.plan.days.length} reviewed future puzzle days.`,
    );
  }

  if (report.missingThreadDays.length > 0) {
    throw new Error(
      `Cannot apply ${report.missingThreadDays.length} future dates without Common Thread coverage.`,
    );
  }

  const futureIsbns = books
    .filter((book) => book.scheduled_date && book.scheduled_date > today)
    .map((book) => book.isbn13);
  for (const isbn13 of futureIsbns) {
    await patchRow(baseUrl, serviceKey, "catalog_items", "isbn13", isbn13, {
      scheduled_date: null,
    });
  }
  for (const day of plan.days) {
    for (const book of day.books) {
      await patchRow(
        baseUrl,
        serviceKey,
        "catalog_items",
        "isbn13",
        book.isbn13,
        {
          scheduled_date: day.date,
        },
      );
    }
  }

  const futureThreads =
    (await fetchJson<Array<{ id: string }>>(
      `${baseUrl}/rest/v1/common_thread_pairs?select=id&scheduled_date=gt.${today}`,
      { headers },
    )) ?? [];
  for (const thread of futureThreads) {
    await patchRow(
      baseUrl,
      serviceKey,
      "common_thread_pairs",
      "id",
      thread.id,
      {
        scheduled_date: null,
      },
    );
  }
  for (const day of plan.days) {
    const thread = day.thread!;
    await fetchJson(`${baseUrl}/rest/v1/common_thread_pairs`, {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "return=minimal",
      },
      body: {
        pair_mode: thread.pair_mode,
        item_a_isbn13: thread.item_a_isbn13,
        item_b_isbn13: thread.item_b_isbn13,
        connection_category: thread.connection_category,
        connection_detail: thread.connection_detail,
        decoy_1_category: thread.decoy_1_category,
        decoy_1_detail: thread.decoy_1_detail,
        decoy_2_category: thread.decoy_2_category,
        decoy_2_detail: thread.decoy_2_detail,
        scheduled_date: day.date,
      },
    });
  }
  console.log(
    `Applied ${plan.days.length} future days with ${plan.days.length} Common Threads.`,
  );
}

export function createHybridPlan(
  candidates: CatalogBook[],
  threads: ThreadRow[],
  today: string,
  seed: string,
  requestedDays?: number,
): { days: PlannedDay[]; leftover: CatalogBook[] } {
  const recent = candidates
    .filter(isRecent)
    .sort((a, b) => compareScore(a, b, seed));
  const older = candidates
    .filter((book) => !isRecent(book))
    .sort((a, b) => compareScore(a, b, seed));
  const maximumDays = Math.min(
    Math.floor(recent.length / 3),
    Math.floor(older.length / 2),
  );
  const dayCount = Math.min(
    maximumDays,
    Math.max(0, requestedDays ?? maximumDays),
  );
  const days: PlannedDay[] = [];
  let previousAuthors = new Set<string>();
  let previousGenres = new Set<string>();
  const usedThreads = new Set<string>();
  const recentPool = new Map(recent.map((book) => [book.isbn13, book]));
  const olderPool = new Map(older.map((book) => [book.isbn13, book]));
  const threadRotation = [...threads].sort(
    (a, b) => stableHash(`${seed}:${a.id}`) - stableHash(`${seed}:${b.id}`),
  );

  for (let index = 0; index < dayCount; index++) {
    const date = addDays(today, index + 1);
    const thread =
      chooseThreadForPools(
        threadRotation,
        recentPool,
        olderPool,
        usedThreads,
        index,
      ) ?? null;
    const books: CatalogBook[] = [];
    if (thread) {
      for (const isbn13 of [thread.item_a_isbn13, thread.item_b_isbn13]) {
        const book = recentPool.get(isbn13) ?? olderPool.get(isbn13);
        if (book) {
          books.push(book);
          recentPool.delete(isbn13);
          olderPool.delete(isbn13);
        }
      }
      usedThreads.add(
        `${thread.id}:${Math.floor(index / threadRotation.length)}`,
      );
    }
    const recentNeeded = 3 - books.filter(isRecent).length;
    const olderNeeded = 2 - books.filter((book) => !isRecent(book)).length;
    books.push(
      ...pickDiversely(
        recentPool,
        recentNeeded,
        books,
        previousAuthors,
        previousGenres,
        seed,
      ),
      ...pickDiversely(
        olderPool,
        olderNeeded,
        books,
        previousAuthors,
        previousGenres,
        seed,
      ),
    );
    previousAuthors = new Set(books.map((book) => normalize(book.author)));
    previousGenres = new Set(
      books.map((book) => normalize(book.genre ?? "unknown")),
    );
    days.push({
      date,
      recent: books.filter(isRecent).length,
      older: books.filter((book) => !isRecent(book)).length,
      books,
      thread,
    });
  }

  const scheduled = new Set(
    days.flatMap((day) => day.books.map((book) => book.isbn13)),
  );
  return {
    days,
    leftover: [...recentPool.values(), ...olderPool.values()],
  };
}

function pickDiversely(
  pool: Map<string, CatalogBook>,
  count: number,
  day: CatalogBook[],
  previousAuthors: Set<string>,
  previousGenres: Set<string>,
  seed: string,
): CatalogBook[] {
  const selected: CatalogBook[] = [];
  for (let slot = 0; slot < count; slot++) {
    const ranked = [...pool.values()]
      .filter((book) => !selected.includes(book))
      .map((book) => ({
        book,
        score: diversityScore(
          book,
          [...day, ...selected],
          previousAuthors,
          previousGenres,
          seed,
        ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          stableHash(a.book.isbn13) - stableHash(b.book.isbn13),
      );
    const next = ranked[0]?.book;
    if (!next) break;
    selected.push(next);
    pool.delete(next.isbn13);
  }
  return selected;
}

function chooseThreadForPools(
  threads: ThreadRow[],
  recent: Map<string, CatalogBook>,
  older: Map<string, CatalogBook>,
  used: Set<string>,
  dayIndex: number,
): ThreadRow | null {
  const cycle = Math.floor(dayIndex / Math.max(threads.length, 1));
  return (
    threads.find((thread) => {
      if (used.has(`${thread.id}:${cycle}`)) return false;
      const a =
        recent.get(thread.item_a_isbn13) ?? older.get(thread.item_a_isbn13);
      const b =
        recent.get(thread.item_b_isbn13) ?? older.get(thread.item_b_isbn13);
      if (!a || !b) return false;
      const recentCount = [a, b].filter(isRecent).length;
      return recentCount <= 3 && 2 - recentCount <= 2;
    }) ?? null
  );
}

function diversityScore(
  book: CatalogBook,
  day: CatalogBook[],
  previousAuthors: Set<string>,
  previousGenres: Set<string>,
  seed: string,
): number {
  let score = stableHash(`${seed}:${book.isbn13}`) % 1_000_000;
  if (!day.some((item) => normalize(item.author) === normalize(book.author)))
    score += 1_000_000_000;
  if (
    !day.some(
      (item) => normalize(item.genre ?? "") === normalize(book.genre ?? ""),
    )
  )
    score += 300_000_000;
  if (previousAuthors.has(normalize(book.author))) score -= 250_000_000;
  if (previousGenres.has(normalize(book.genre ?? "unknown")))
    score -= 80_000_000;
  return score;
}

async function patchRow(
  baseUrl: string,
  serviceKey: string,
  table: string,
  key: string,
  value: string,
  body: Record<string, unknown>,
): Promise<void> {
  await fetchJson(`${baseUrl}/rest/v1/${table}?${key}=eq.${value}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=minimal",
    },
    body,
  });
}

function isRecent(book: CatalogBook): boolean {
  return (book.release_year ?? 0) >= RECENT_YEAR;
}

function compareScore(a: CatalogBook, b: CatalogBook, seed: string): number {
  return stableHash(`${seed}:${a.isbn13}`) - stableHash(`${seed}:${b.isbn13}`);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function currentPuzzleDate(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Berlin",
  });
}

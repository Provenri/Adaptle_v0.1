import { writeCheckpoint } from '../lib/checkpoint.js';
import { requireEnv } from '../lib/env.js';
import { fetchJson } from '../lib/http.js';

type BookDate = { isbn13: string; scheduled_date: string };
type Thread = {
  id: string;
  scheduled_date: string;
  item_a_isbn13: string;
  item_b_isbn13: string;
  connection_category: string;
  connection_detail: string;
};
type PlannedThread = Thread & { planned_date: string };

const DAY_MS = 86_400_000;

export async function rebalanceThreads(options: {
  startDate: string;
  endDate: string;
  apply: boolean;
}): Promise<void> {
  const baseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const books =
    (await fetchJson<BookDate[]>(
      `${baseUrl}/rest/v1/catalog_items?select=isbn13,scheduled_date`,
      { headers }
    )) ?? [];
  const threads =
    (await fetchJson<Thread[]>(
      `${baseUrl}/rest/v1/common_thread_pairs?scheduled_date=gte.${options.startDate}&scheduled_date=lte.${options.endDate}&select=id,scheduled_date,item_a_isbn13,item_b_isbn13,connection_category,connection_detail&order=scheduled_date.asc`,
      { headers }
    )) ?? [];
  const bookDateByIsbn = new Map(books.map((book) => [book.isbn13, book.scheduled_date]));
  const planned = assignThreads(threads, dateRange(options.startDate, options.endDate), bookDateByIsbn);

  if (options.apply) {
    for (const thread of threads) {
      await fetchJson(`${baseUrl}/rest/v1/common_thread_pairs?id=eq.${thread.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: { scheduled_date: null },
      });
    }
    for (const thread of planned) {
      await fetchJson(`${baseUrl}/rest/v1/common_thread_pairs?id=eq.${thread.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: { scheduled_date: thread.planned_date },
      });
    }
  }

  const gaps = planned.map((thread) => exposureGap(thread, bookDateByIsbn));
  const report = {
    startDate: options.startDate,
    endDate: options.endDate,
    threads: planned.length,
    missingDailySlots: dateRange(options.startDate, options.endDate).filter(
      (date) => !planned.some((thread) => thread.planned_date === date)
    ),
    moved: planned.filter((thread) => thread.scheduled_date !== thread.planned_date).length,
    sameDay: gaps.filter((gap) => gap === 0).length,
    prior1To2Days: gaps.filter((gap) => gap >= 1 && gap <= 2).length,
    prior3To7Days: gaps.filter((gap) => gap >= 3 && gap <= 7).length,
    priorOver7Days: gaps.filter((gap) => gap > 7).length,
    applied: options.apply,
    assignments: planned.map((thread) => ({
      from: thread.scheduled_date,
      to: thread.planned_date,
      category: thread.connection_category,
      detail: thread.connection_detail,
      exposureDays: exposureGap(thread, bookDateByIsbn),
    })),
  };
  writeCheckpoint('09-thread-rebalance', [report]);
  console.log(JSON.stringify(report, null, 2));
}

function assignThreads(
  threads: Thread[],
  dates: string[],
  bookDateByIsbn: Map<string, string>
): PlannedThread[] {
  const available = new Set(dates);
  const planned: PlannedThread[] = [];
  for (const thread of [...threads].sort((a, b) =>
    latestBookDate(b, bookDateByIsbn).localeCompare(latestBookDate(a, bookDateByIsbn))
  )) {
    const candidates = dates.filter(
      (date) => available.has(date) && date > latestBookDate(thread, bookDateByIsbn)
    );
    candidates.sort((left, right) => {
      const preferred = minimumBonusDate(thread, bookDateByIsbn);
      return scoreDate(left, preferred) - scoreDate(right, preferred) || left.localeCompare(right);
    });
    const plannedDate = candidates[0];
    if (!plannedDate) throw new Error(`No prior-exposure date is available for thread ${thread.id}.`);
    available.delete(plannedDate);
    planned.push({ ...thread, planned_date: plannedDate });
  }
  return planned.sort((a, b) => a.planned_date.localeCompare(b.planned_date));
}

function scoreDate(date: string, preferredMinimum: string): number {
  const days = dayDifference(preferredMinimum, date);
  if (days >= 0 && days <= 4) return days;
  if (days < 0) return 10_000 + Math.abs(days);
  return 5_000 + days;
}

function minimumBonusDate(thread: Thread, dates: Map<string, string>): string {
  return addDays(latestBookDate(thread, dates), 3);
}

function latestBookDate(thread: Thread, dates: Map<string, string>): string {
  const a = dates.get(thread.item_a_isbn13);
  const b = dates.get(thread.item_b_isbn13);
  if (!a || !b) throw new Error(`Thread ${thread.id} references a missing book.`);
  return a > b ? a : b;
}

function exposureGap(thread: PlannedThread, dates: Map<string, string>): number {
  return dayDifference(latestBookDate(thread, dates), thread.planned_date);
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS
  );
}

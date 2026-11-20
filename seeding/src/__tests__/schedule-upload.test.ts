import { describe, expect, it } from 'vitest';

import {
  addDays,
  defaultStartDate,
  scheduleBooks,
  scheduleThreads,
  toCatalogRow,
  toThreadRow,
} from '../steps/schedule-upload.js';
import type { CommonThread, HintedBook } from '../types.js';

function makeBook(isbn13: string): HintedBook {
  return {
    bookQid: 'Q1',
    filmQid: 'Q2',
    bookTitle: `Book ${isbn13}`,
    author: 'Author',
    isbn13,
    movieTitle: 'WD Movie',
    movieDirector: 'WD Director',
    movieReleaseYear: 1990,
    tmdbId: 1,
    bookPublicationYear: 1980,
    subjects: [],
    genre: 'Drama',
    coverTheme: 'literary_terracotta',
    numberOfPages: 200,
    openLibraryWorkKey: '/works/OL1W',
    tmdbTitle: 'TMDB Movie',
    releaseYear: 1991,
    director: 'TMDB Director',
    moviePosterPath: '/p.jpg',
    leadCharacters: ['A', 'B'],
    leadActors: ['X', 'Y'],
    settingHint: 'setting',
    characterHint: 'characters',
  };
}

function makeThread(a: string, b: string): CommonThread {
  return {
    pairMode: 'BOOK_PAIR',
    itemAIsbn13: a,
    itemBIsbn13: b,
    connectionCategory: 'The Setting',
    connectionDetail: 'Shared setting',
    decoy1Category: 'The Plot',
    decoy1Detail: 'decoy 1',
    decoy2Category: 'The Author',
    decoy2Detail: 'decoy 2',
  };
}

const isbn = (n: number) => `97800000000${String(n).padStart(2, '0')}`;

describe('addDays / defaultStartDate', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('defaults to tomorrow in Berlin time', () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Berlin (UTC+1) -> tomorrow is Jan 3.
    expect(defaultStartDate(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-03');
    expect(defaultStartDate(new Date('2026-01-01T12:00:00Z'))).toBe('2026-01-02');
  });
});

describe('scheduleBooks', () => {
  it('schedules 5 books per day and excludes incomplete trailing days', () => {
    const books = Array.from({ length: 12 }, (_, i) => makeBook(isbn(i)));
    const { scheduled, leftover } = scheduleBooks(books, '2026-12-01');
    expect(scheduled).toHaveLength(10);
    expect(leftover).toHaveLength(2);
    expect(scheduled.slice(0, 5).every((s) => s.scheduledDate === '2026-12-01')).toBe(true);
    expect(scheduled.slice(5).every((s) => s.scheduledDate === '2026-12-02')).toBe(true);
  });
});

describe('scheduleThreads', () => {
  it('never schedules a thread before both its items are published', () => {
    const books = Array.from({ length: 10 }, (_, i) => makeBook(isbn(i)));
    const { scheduled } = scheduleBooks(books, '2026-12-01');
    const dates = new Map(scheduled.map((s) => [s.book.isbn13, s.scheduledDate]));

    // isbn(7) is published on day 2 -> thread can't run on day 1.
    const threads = [makeThread(isbn(0), isbn(7))];
    const plan = scheduleThreads(threads, dates, '2026-12-01', 2);
    expect(plan.scheduled).toHaveLength(1);
    expect(plan.scheduled[0]?.scheduledDate).toBe('2026-12-02');
  });

  it('assigns at most one thread per day and reports unassignable threads', () => {
    const books = Array.from({ length: 5 }, (_, i) => makeBook(isbn(i)));
    const { scheduled } = scheduleBooks(books, '2026-12-01');
    const dates = new Map(scheduled.map((s) => [s.book.isbn13, s.scheduledDate]));

    const threads = [
      makeThread(isbn(0), isbn(1)),
      makeThread(isbn(2), isbn(3)),
      makeThread(isbn(0), isbn(99)), // isbn(99) never scheduled -> unusable
    ];
    const plan = scheduleThreads(threads, dates, '2026-12-01', 1);
    expect(plan.scheduled).toHaveLength(1); // only one day available
    expect(plan.unassigned).toHaveLength(2);
  });
});

describe('row mappers', () => {
  it('maps catalog rows with TMDB display fields and the scheduled date', () => {
    const row = toCatalogRow({ book: makeBook(isbn(1)), scheduledDate: '2026-12-01' });
    expect(row).toMatchObject({
      isbn13: isbn(1),
      movie_title: 'TMDB Movie',
      director: 'TMDB Director',
      publication_year: 1980,
      release_year: 1991,
      lead_characters: ['A', 'B'],
      setting_hint: 'setting',
      scheduled_date: '2026-12-01',
      metadata_source: 'wikidata_openlibrary',
    });
  });

  it('maps thread rows', () => {
    const row = toThreadRow({ thread: makeThread(isbn(1), isbn(2)), scheduledDate: '2026-12-03' });
    expect(row).toMatchObject({
      pair_mode: 'BOOK_PAIR',
      item_a_isbn13: isbn(1),
      item_b_isbn13: isbn(2),
      connection_category: 'The Setting',
      scheduled_date: '2026-12-03',
    });
  });
});

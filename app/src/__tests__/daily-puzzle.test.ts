import {
  PuzzleUnavailableError,
  buildDailyPuzzle,
  type CatalogRow,
  type ThreadRow,
} from '@/lib/daily-puzzle';

jest.mock('react-native-mmkv', () => {
  const values = new Map<string, string>();
  return {
    createMMKV: () => ({
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      remove: (key: string) => values.delete(key),
    }),
  };
});

const books: CatalogRow[] = Array.from({ length: 5 }, (_, index) => ({
  isbn13: `978000000000${index}`,
  book_title: `Book ${index + 1}`,
  author: `Author ${index + 1}`,
  genre: 'Science fiction',
  cover_theme: 'scifi_teal',
  tmdb_id: 100 + index,
  movie_title: `Movie ${index + 1}`,
  release_year: 2000 + index,
  director: `Director ${index + 1}`,
  movie_poster_path: `/poster-${index + 1}.jpg`,
  lead_characters: [`Hero ${index + 1}`, `Partner ${index + 1}`],
  lead_actors: [`Actor ${index + 1}`, `Actor B${index + 1}`],
  setting_hint: `Setting ${index + 1}`,
  character_hint: `Characters ${index + 1}`,
}));

const thread: ThreadRow = {
  pair_mode: 'BOOK_PAIR',
  item_a_isbn13: books[0].isbn13,
  item_b_isbn13: books[1].isbn13,
  connection_category: 'The Setting',
  connection_detail: 'Hostile other worlds',
  decoy_1_category: 'The Author',
  decoy_1_detail: 'Same writer',
  decoy_2_category: 'The Plot',
  decoy_2_detail: 'Time-loop mystery',
};

describe('production daily puzzle mapping', () => {
  it('builds five rounds and a deterministic three-choice bonus', () => {
    const first = buildDailyPuzzle('2026-11-20', books, thread, books.slice(0, 2));
    const second = buildDailyPuzzle('2026-11-20', books, thread, books.slice(0, 2));

    expect(first.id).toBe('1');
    expect(first.puzzle.rounds).toHaveLength(5);
    expect(first.puzzle.rounds[0].choices).toEqual(second.puzzle.rounds[0].choices);
    expect(first.puzzle.bonus.choices.map((choice) => choice.id).sort()).toEqual([
      'connection',
      'decoy-1',
      'decoy-2',
    ]);
  });

  it('rejects incomplete scheduled records', () => {
    expect(() =>
      buildDailyPuzzle('2026-11-20', books.slice(0, 4), thread, books.slice(0, 2))
    ).toThrow(PuzzleUnavailableError);
  });

  it('maps crossover item kinds consistently', () => {
    const mapped = buildDailyPuzzle(
      '2026-11-20',
      books,
      { ...thread, pair_mode: 'CROSSOVER' },
      books.slice(0, 2)
    );

    expect(mapped.bonusItems.map((item) => item.kind)).toEqual(['book', 'movie']);
  });
});

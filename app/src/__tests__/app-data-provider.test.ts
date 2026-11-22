import {
  mergeRemoteLibrary,
  updateBookStatus,
  upsertBookAtFront,
} from '@/providers/app-data-provider';
import { findExistingLibraryMatch } from '@/data/library-data';
import type { LibraryBook } from '@/data/library-data';

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

const localBook: LibraryBook = {
  isbn13: '9780000000001',
  title: 'Future book',
  author: 'Known locally',
  coverTheme: 'literary_terracotta',
  genre: 'Fiction',
  status: 'TO_BE_READ',
  storyPremise: 'A verified future catalog story.',
};

describe('library refresh merging', () => {
  it('keeps locally cached metadata when future catalog rows are hidden by RLS', () => {
    expect(mergeRemoteLibrary([], [localBook])).toEqual([localBook]);
  });

  it('keeps newly added local-only books ahead of older remote books', () => {
    const olderRemote: LibraryBook = {
      ...localBook,
      isbn13: '9780000000002',
      title: 'Older remote book',
      storyPremise: undefined,
    };
    expect(mergeRemoteLibrary([olderRemote], [localBook, olderRemote])).toEqual([
      localBook,
      olderRemote,
    ]);
  });

  it('still lets remote records win while filling sparse metadata from local data', () => {
    const result = mergeRemoteLibrary(
      [{ ...localBook, storyPremise: undefined, status: 'READING' }],
      [localBook]
    );
    expect(result[0]).toMatchObject({
      status: 'READING',
      storyPremise: localBook.storyPremise,
    });
  });

  it('sorts remote and local books by the newest save timestamp', () => {
    const olderRemote: LibraryBook = {
      ...localBook,
      isbn13: '9780000000002',
      title: 'Older remote book',
      savedAt: 100,
    };
    const newerLocal: LibraryBook = { ...localBook, savedAt: 200 };

    expect(mergeRemoteLibrary([olderRemote], [newerLocal, olderRemote])).toEqual([
      expect.objectContaining(newerLocal),
      expect.objectContaining(olderRemote),
    ]);
  });

  it('moves an already saved book to the front when it is added again', () => {
    const dune: LibraryBook = {
      ...localBook,
      isbn13: '9780441172719',
      title: 'Dune',
      author: 'Frank Herbert',
    };
    const result = upsertBookAtFront([localBook, dune], dune, 'READING');

    expect(result.map((book) => book.isbn13)).toEqual([dune.isbn13, localBook.isbn13]);
    expect(result[0].status).toBe('READING');
  });

  it('matches the same work even when the ISBN is from another edition', () => {
    const savedDune: LibraryBook = {
      ...localBook,
      isbn13: '9780441172719',
      title: 'Dune',
      author: 'Frank Herbert',
    };

    expect(
      findExistingLibraryMatch([savedDune], {
        isbn13: '9780340960196',
        title: 'Dune',
        author: 'Frank Herbert',
      })
    ).toBe(savedDune);
  });

  it('maps an adaptation release year when adding a book', () => {
    const result = upsertBookAtFront(
      [localBook],
      {
        isbn13: '9780000000002',
        title: 'Adapted book',
        author: 'Screen Author',
        publicationYear: 2001,
        genre: 'Fiction',
        coverTheme: 'literary_terracotta',
        releaseYear: 2010,
        movieTitle: 'Adapted film',
        tmdbId: 123,
      },
      'TO_BE_READ'
    );

    expect(result[0]).toMatchObject({
      movieTitle: 'Adapted film',
      movieYear: 2010,
    });
  });

  it('updates status without changing shelf order or save timestamp', () => {
    const second: LibraryBook = {
      ...localBook,
      isbn13: '9780000000002',
      title: 'Second book',
      savedAt: 100,
    };
    const first = { ...localBook, savedAt: 200 };
    const result = updateBookStatus([first, second], second.isbn13, 'FINISHED');

    expect(result.map((book) => book.isbn13)).toEqual([first.isbn13, second.isbn13]);
    expect(result[1]).toMatchObject({ status: 'FINISHED', savedAt: 100 });
  });
});

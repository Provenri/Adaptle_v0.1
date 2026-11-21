import { mergeRemoteLibrary } from '@/providers/app-data-provider';
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
});

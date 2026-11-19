import {
  clearOfflineMutations,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getOfflineMutations,
} from '@/lib/offline-queue';

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

beforeEach(() => {
  clearOfflineMutations();
});

describe('offline mutation queue', () => {
  it('keeps failed work and everything after it for an ordered retry', async () => {
    enqueueOfflineMutation({
      id: 'first',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'FINISHED' },
    });
    enqueueOfflineMutation({
      id: 'second',
      type: 'library-upsert',
      payload: { isbn13: '9780000000002', status: 'TO_BE_READ' },
    });

    const attempts: string[] = [];
    const synced = await flushOfflineMutations(async (mutation) => {
      attempts.push(mutation.id);
      if (mutation.id === 'first') throw new Error('offline');
    });

    expect(synced).toBe(0);
    expect(attempts).toEqual(['first']);
    expect(getOfflineMutations().map((mutation) => mutation.id)).toEqual(['first', 'second']);
  });

  it('removes successfully replayed mutations and can clear the queue', async () => {
    enqueueOfflineMutation({
      id: 'score',
      type: 'daily-score-upsert',
      payload: { totalPoints: 18 },
    });

    expect(await flushOfflineMutations(async () => undefined)).toBe(1);
    expect(getOfflineMutations()).toEqual([]);

    enqueueOfflineMutation({
      type: 'library-upsert',
      payload: { isbn13: '9780000000003' },
    });
    clearOfflineMutations();
    expect(getOfflineMutations()).toEqual([]);
  });
});

import {
  PermanentMutationError,
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

  it('coalesces repeated writes to the same book and puzzle date', () => {
    enqueueOfflineMutation({
      id: 'library-old',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'TO_BE_READ' },
    });

    enqueueOfflineMutation({
      id: 'library-new',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'FINISHED' },
    });
    enqueueOfflineMutation({
      id: 'score-old',
      type: 'daily-score-upsert',
      payload: { puzzleDate: '2026-11-20', totalPoints: 10 },
    });
    enqueueOfflineMutation({
      id: 'score-new',
      type: 'daily-score-upsert',
      payload: { puzzleDate: '2026-11-20', totalPoints: 18 },
    });

    expect(getOfflineMutations().map((mutation) => mutation.id)).toEqual([
      'library-new',
      'score-new',
    ]);
  });

  it('merges a status-only update into an unsynced book save', () => {
    enqueueOfflineMutation({
      id: 'saved',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'TO_BE_READ' },
    });
    enqueueOfflineMutation({
      id: 'status',
      type: 'library-status-update',
      payload: { isbn13: '9780000000001', status: 'FINISHED' },
    });

    expect(getOfflineMutations()).toEqual([
      expect.objectContaining({
        id: 'saved',
        type: 'library-upsert',
        payload: {
          isbn13: '9780000000001',
          status: 'FINISHED',
        },
      }),
    ]);
  });

  it('lets a library removal supersede an earlier save', () => {
    enqueueOfflineMutation({
      id: 'saved',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'TO_BE_READ' },
    });
    enqueueOfflineMutation({
      id: 'removed',
      type: 'library-delete',
      payload: { isbn13: '9780000000001' },
    });

    expect(getOfflineMutations().map((mutation) => mutation.type)).toEqual(['library-delete']);
  });

  it('migrates queued legacy Snooze writes into shelf deletions', () => {
    enqueueOfflineMutation({
      id: 'legacy-snooze',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'SNOOZE' },
    });

    expect(getOfflineMutations()).toEqual([
      expect.objectContaining({
        type: 'library-delete',
        payload: { isbn13: '9780000000001' },
      }),
    ]);
  });

  it('discards malformed and permanently invalid mutations without blocking later work', async () => {
    enqueueOfflineMutation({
      id: 'bad',
      type: 'library-upsert',
      payload: { isbn13: '9780000000001', status: 'INVALID' },
    });
    enqueueOfflineMutation({
      id: 'valid',
      type: 'library-upsert',
      payload: { isbn13: '9780000000002', status: 'READING' },
    });
    const attempted: string[] = [];

    const synced = await flushOfflineMutations(async (mutation) => {
      attempted.push(mutation.id);
      if (mutation.id === 'bad') throw new PermanentMutationError('invalid status');
    });

    expect(synced).toBe(1);
    expect(attempted).toEqual(['bad', 'valid']);
    expect(getOfflineMutations()).toEqual([]);
  });
});

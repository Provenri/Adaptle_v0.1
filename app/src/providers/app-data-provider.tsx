import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  demoLibrary,
  type BookCandidate,
  type LibraryBook,
  type ShelfStatus,
} from '@/data/library-data';
import { demoPuzzle } from '@/data/demo-puzzle';
import { enqueueOfflineMutation, flushOfflineMutations } from '@/lib/offline-queue';
import { persistQueryCache, queryClient } from '@/lib/query-client';
import { localStorage } from '@/lib/local-storage';
import {
  fetchDailyScores,
  getSupabaseClient,
  initializeAnonymousSession,
  syncOfflineMutation,
} from '@/lib/supabase';
import { calculateStreak, mergeDailyScores, type DailyScore } from '@/lib/scores';
import type { DailyPuzzle } from '@/lib/game-engine';

const LIBRARY_KEY = 'library-v1';
const SCORES_KEY = 'daily-scores-v1';

type LibraryContextValue = {
  books: LibraryBook[];
  scores: DailyScore[];
  currentStreak: number;
  saveBook: (
    candidate: Omit<BookCandidate, 'numberOfPages' | 'subjects' | 'source'>,
    status?: ShelfStatus
  ) => void;
  updateStatus: (isbn13: string, status: ShelfStatus) => void;
  saveScore: (score: DailyScore) => void;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LibraryProvider>{children}</LibraryProvider>
    </QueryClientProvider>
  );
}

function LibraryProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<LibraryBook[]>(
    () => localStorage.get<LibraryBook[]>(LIBRARY_KEY) ?? [...demoLibrary]
  );
  const [scores, setScores] = useState<DailyScore[]>(
    () => localStorage.get<DailyScore[]>(SCORES_KEY) ?? []
  );
  const [syncVersion, setSyncVersion] = useState(0);

  useEffect(() => {
    localStorage.set(LIBRARY_KEY, books);
  }, [books]);

  useEffect(() => {
    localStorage.set(SCORES_KEY, scores);
  }, [scores]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      persistQueryCache();
    });
    void queryClient.prefetchQuery({
      queryKey: ['daily-puzzle', 'today'],
      queryFn: async () => demoPuzzle,
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || !getSupabaseClient()) return;

    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await initializeAnonymousSession();
        await flushOfflineMutations(syncOfflineMutation);
        const remoteScores = await fetchDailyScores();
        setScores((localScores) => mergeDailyScores(localScores, remoteScores));
      } catch (error) {
        console.error('Unable to sync Adaptle local data; queued changes remain pending.', error);
      } finally {
        syncing = false;
      }
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void sync();
    });
    void sync();
    return () => subscription.remove();
  }, [syncVersion]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      books,
      scores,
      currentStreak: calculateStreak(scores),
      saveBook: (candidate, status = 'TO_BE_READ') => {
        setBooks((current) => {
          const existing = current.find((book) => book.isbn13 === candidate.isbn13);
          if (existing) {
            return current.map((book) =>
              book.isbn13 === candidate.isbn13 ? { ...book, status } : book
            );
          }
          return [{ ...candidate, status }, ...current];
        });
        enqueueOfflineMutation({
          type: 'library-upsert',
          payload: { ...candidate, status },
        });
        setSyncVersion((version) => version + 1);
      },
      updateStatus: (isbn13, status) => {
        setBooks((current) =>
          current.map((book) => (book.isbn13 === isbn13 ? { ...book, status } : book))
        );
        const book = books.find((item) => item.isbn13 === isbn13);
        if (book) {
          enqueueOfflineMutation({
            type: 'library-upsert',
            payload: { ...book, status },
          });
          setSyncVersion((version) => version + 1);
        }
      },
      saveScore: (score) => {
        setScores((current) => mergeDailyScores(current, [score]));
        enqueueOfflineMutation({
          type: 'daily-score-upsert',
          payload: {
            puzzleDate: score.puzzleDate,
            totalPoints: score.totalPoints,
            roundBreakdown: score.roundBreakdown,
          },
        });
        setSyncVersion((version) => version + 1);
      },
    }),
    [books, scores]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside AppDataProvider');
  return context;
}

export function useDailyPuzzle(): DailyPuzzle {
  const { data } = useQuery({
    queryKey: ['daily-puzzle', 'today'],
    queryFn: async () => demoPuzzle,
    initialData: () => {
      return queryClient.getQueryData<DailyPuzzle>(['daily-puzzle', 'today']) ?? demoPuzzle;
    },
  });
  return data;
}

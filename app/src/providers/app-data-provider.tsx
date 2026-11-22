import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { type BookCandidate, type LibraryBook, type ShelfStatus } from '@/data/library-data';
import { fetchDailyPuzzle, type ProductionDailyPuzzle } from '@/lib/daily-puzzle';
import {
  clearOfflineMutations,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getOfflineMutations,
} from '@/lib/offline-queue';
import { persistQueryCache, queryClient } from '@/lib/query-client';
import { localStorage } from '@/lib/local-storage';
import {
  fetchDailyScores,
  deleteDailyScore,
  fetchUserLibrary,
  getSupabaseClient,
  initializeAnonymousSession,
  syncOfflineMutation,
} from '@/lib/supabase';
import { calculateStreak, mergeDailyScores, type DailyScore } from '@/lib/scores';

const LIBRARY_KEY = 'library-v1';
const SCORES_KEY = 'daily-scores-v1';

type LibraryContextValue = {
  books: LibraryBook[];
  libraryError: string | null;
  isLibraryLoading: boolean;
  scores: DailyScore[];
  currentStreak: number;
  saveBook: (
    candidate: Omit<
      BookCandidate,
      'numberOfPages' | 'publicationYear' | 'subjects' | 'source' | 'tmdbId'
    > & {
      publicationYear?: number | null;
      tmdbId?: number | null;
    },
    status?: ShelfStatus
  ) => void;
  updateStatus: (isbn13: string, status: ShelfStatus) => void;
  removeBook: (isbn13: string) => void;
  saveScore: (score: DailyScore) => void;
  resetTodayScore: (puzzleDate: string) => Promise<void>;
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
  const [books, setBooks] = useState<LibraryBook[]>(() =>
    (localStorage.get<LibraryBook[]>(LIBRARY_KEY) ?? []).filter(
      (book) => (book as { status: string }).status !== 'SNOOZE'
    )
  );
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isLibraryLoading, setIsLibraryLoading] = useState(process.env.NODE_ENV !== 'test');
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
      queryFn: fetchDailyPuzzle,
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
        const [remoteScores, remoteLibrary] = await Promise.all([
          fetchDailyScores(),
          fetchUserLibrary(),
        ]);
        setScores((localScores) => mergeDailyScores(localScores, remoteScores));
        setBooks((localLibrary) =>
          overlayPendingLibraryMutations(mergeRemoteLibrary(remoteLibrary, localLibrary))
        );
        setLibraryError(null);
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : 'Unable to sync your library.');
        console.warn('Unable to sync Adaptle local data; queued changes remain pending.', error);
      } finally {
        setIsLibraryLoading(false);
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
      libraryError,
      isLibraryLoading,
      scores,
      currentStreak: calculateStreak(scores),
      saveBook: (candidate, status = 'TO_BE_READ') => {
        setBooks((current) => upsertBookAtFront(current, candidate, status));
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
      removeBook: (isbn13) => {
        setBooks((current) => current.filter((book) => book.isbn13 !== isbn13));
        enqueueOfflineMutation({
          type: 'library-delete',
          payload: { isbn13 },
        });
        setSyncVersion((version) => version + 1);
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
      resetTodayScore: async (puzzleDate) => {
        if (!__DEV__) return;
        await deleteDailyScore(puzzleDate);
        setScores((current) => current.filter((score) => score.puzzleDate !== puzzleDate));
        const pending = getOfflineMutations().filter(
          (mutation) =>
            mutation.type !== 'daily-score-upsert' || mutation.payload.puzzleDate !== puzzleDate
        );
        if (pending.length === getOfflineMutations().length) return;
        clearOfflineMutations();
        pending.forEach((mutation) => enqueueOfflineMutation(mutation));
      },
    }),
    [books, isLibraryLoading, libraryError, scores]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function mergeRemoteLibrary(remote: LibraryBook[], local: LibraryBook[]): LibraryBook[] {
  const localByIsbn = new Map(local.map((book) => [book.isbn13, book]));
  const remoteByIsbn = new Map(remote.map((book) => [book.isbn13, book]));
  const merged = remote.map((remoteBook) => {
    const localBook = localByIsbn.get(remoteBook.isbn13);
    if (!localBook) return remoteBook;
    const savedAt = Math.max(remoteBook.savedAt ?? 0, localBook.savedAt ?? 0);
    return {
      ...remoteBook,
      ...(savedAt > 0 ? { savedAt } : {}),
      publicationYear: remoteBook.publicationYear ?? localBook.publicationYear,
      tmdbId: remoteBook.tmdbId ?? localBook.tmdbId,
      moviePosterPath: remoteBook.moviePosterPath ?? localBook.moviePosterPath,
      movieTitle: remoteBook.movieTitle ?? localBook.movieTitle,
      movieYear: remoteBook.movieYear ?? localBook.movieYear,
      leadActors: remoteBook.leadActors ?? localBook.leadActors,
      leadCharacters: remoteBook.leadCharacters ?? localBook.leadCharacters,
      settingHint: remoteBook.settingHint ?? localBook.settingHint,
      characterHint: remoteBook.characterHint ?? localBook.characterHint,
      storyPremise: remoteBook.storyPremise ?? localBook.storyPremise,
      premiseShort: remoteBook.premiseShort ?? localBook.premiseShort,
      premiseKeywords: remoteBook.premiseKeywords ?? localBook.premiseKeywords,
    };
  });
  for (const localBook of local) {
    if (!remoteByIsbn.has(localBook.isbn13)) merged.push(localBook);
  }
  const localOnly = new Map(
    local.filter((book) => !remoteByIsbn.has(book.isbn13)).map((book) => [book.isbn13, book])
  );
  const combined = [
    ...local.filter((book) => localOnly.has(book.isbn13)),
    ...merged.filter((book) => !localOnly.has(book.isbn13)),
  ];
  return combined.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function upsertBookAtFront(
  books: LibraryBook[],
  candidate: Omit<
    BookCandidate,
    'numberOfPages' | 'publicationYear' | 'subjects' | 'source' | 'tmdbId'
  > & {
    publicationYear?: number | null;
    tmdbId?: number | null;
  },
  status: ShelfStatus = 'TO_BE_READ'
): LibraryBook[] {
  const existing = books.find((book) => book.isbn13 === candidate.isbn13);
  const savedBook: LibraryBook = {
    ...existing,
    ...candidate,
    tmdbId: candidate.tmdbId ?? existing?.tmdbId ?? undefined,
    publicationYear: candidate.publicationYear ?? existing?.publicationYear,
    savedAt: Date.now(),
    status,
  };
  return [savedBook, ...books.filter((book) => book.isbn13 !== candidate.isbn13)];
}

function overlayPendingLibraryMutations(remote: LibraryBook[]): LibraryBook[] {
  const result = [...remote];
  for (const mutation of getOfflineMutations()) {
    if (mutation.type === 'daily-score-upsert') continue;
    const payload = mutation.payload;
    const isbn13 = typeof payload.isbn13 === 'string' ? payload.isbn13 : null;
    const status = payload.status;
    if (mutation.type === 'library-delete') {
      if (isbn13) {
        const index = result.findIndex((book) => book.isbn13 === isbn13);
        if (index >= 0) result.splice(index, 1);
      }
      continue;
    }
    if (!isbn13 || (status !== 'TO_BE_READ' && status !== 'READING' && status !== 'FINISHED')) {
      continue;
    }
    const index = result.findIndex((book) => book.isbn13 === isbn13);
    if (index >= 0) {
      const [updated] = result.splice(index, 1);
      result.unshift({ ...updated, savedAt: mutation.createdAt, status });
      continue;
    }
    if (
      typeof payload.title === 'string' &&
      typeof payload.author === 'string' &&
      typeof payload.coverTheme === 'string'
    ) {
      result.unshift({
        isbn13,
        title: payload.title,
        author: payload.author,
        publicationYear:
          typeof payload.publicationYear === 'number' ? payload.publicationYear : undefined,
        genre: typeof payload.genre === 'string' ? payload.genre : null,
        coverTheme: payload.coverTheme as LibraryBook['coverTheme'],
        status,
        savedAt: mutation.createdAt,
        tmdbId: typeof payload.tmdbId === 'number' ? payload.tmdbId : undefined,
        moviePosterPath:
          typeof payload.moviePosterPath === 'string' ? payload.moviePosterPath : null,
        movieTitle: typeof payload.movieTitle === 'string' ? payload.movieTitle : undefined,
        movieYear: typeof payload.releaseYear === 'number' ? payload.releaseYear : undefined,
        settingHint: typeof payload.settingHint === 'string' ? payload.settingHint : undefined,
        characterHint:
          typeof payload.characterHint === 'string' ? payload.characterHint : undefined,
        storyPremise: typeof payload.storyPremise === 'string' ? payload.storyPremise : undefined,
        premiseShort: typeof payload.premiseShort === 'string' ? payload.premiseShort : undefined,
        premiseKeywords: Array.isArray(payload.premiseKeywords)
          ? payload.premiseKeywords.filter(
              (value): value is string => typeof value === 'string' && value.length > 0
            )
          : undefined,
        leadActors: Array.isArray(payload.leadActors)
          ? payload.leadActors.filter((value): value is string => typeof value === 'string')
          : undefined,
        leadCharacters: Array.isArray(payload.leadCharacters)
          ? payload.leadCharacters.filter((value): value is string => typeof value === 'string')
          : undefined,
      });
    }
  }
  return result.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside AppDataProvider');
  return context;
}

export function useDailyPuzzle() {
  return useQuery<ProductionDailyPuzzle>({
    queryKey: ['daily-puzzle', 'today'],
    queryFn: fetchDailyPuzzle,
    staleTime: 10 * 60 * 1000,
  });
}

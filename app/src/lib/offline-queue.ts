import { localStorage } from './local-storage';

const QUEUE_KEY = 'offline-mutations';

export type OfflineMutation =
  | { id: string; type: 'library-upsert'; payload: Record<string, unknown>; createdAt: number }
  | {
      id: string;
      type: 'daily-score-upsert';
      payload: Record<string, unknown>;
      createdAt: number;
    };

export type OfflineMutationHandler = (mutation: OfflineMutation) => Promise<void>;

export function getOfflineMutations(): OfflineMutation[] {
  return localStorage.get<OfflineMutation[]>(QUEUE_KEY) ?? [];
}

export function enqueueOfflineMutation(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  }
): OfflineMutation {
  const queued = {
    ...mutation,
    id: mutation.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: mutation.createdAt ?? Date.now(),
  } as OfflineMutation;
  const existing = getOfflineMutations();
  const queue = existing.filter((mutation) => mutationKey(mutation) !== mutationKey(queued));
  localStorage.set(QUEUE_KEY, [...queue, queued]);
  return queued;
}

export async function flushOfflineMutations(handler: OfflineMutationHandler): Promise<number> {
  const queue = getOfflineMutations();
  const pending: OfflineMutation[] = [];
  let synced = 0;

  for (const mutation of queue) {
    try {
      await handler(mutation);
      synced += 1;
    } catch (error) {
      console.error(`Offline mutation "${mutation.id}" will be retried.`, error);
      pending.push(mutation, ...queue.slice(queue.indexOf(mutation) + 1));
      break;
    }
  }

  localStorage.set(QUEUE_KEY, pending);
  return synced;
}

export function clearOfflineMutations(): void {
  localStorage.remove(QUEUE_KEY);
}

function mutationKey(mutation: OfflineMutation): string {
  if (mutation.type === 'daily-score-upsert') {
    return `score:${String(mutation.payload.puzzleDate ?? '')}`;
  }
  return `library:${String(mutation.payload.isbn13 ?? mutation.id)}`;
}

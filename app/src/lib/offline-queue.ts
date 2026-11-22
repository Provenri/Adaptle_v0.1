import { localStorage } from './local-storage';

const QUEUE_KEY = 'offline-mutations';

export type OfflineMutation =
  | { id: string; type: 'library-upsert'; payload: Record<string, unknown>; createdAt: number }
  | {
      id: string;
      type: 'library-status-update';
      payload: Record<string, unknown>;
      createdAt: number;
    }
  | { id: string; type: 'library-delete'; payload: Record<string, unknown>; createdAt: number }
  | {
      id: string;
      type: 'daily-score-upsert';
      payload: Record<string, unknown>;
      createdAt: number;
    };

export type OfflineMutationHandler = (mutation: OfflineMutation) => Promise<void>;

export class PermanentMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentMutationError';
  }
}

export function getOfflineMutations(): OfflineMutation[] {
  const stored = localStorage.get<OfflineMutation[]>(QUEUE_KEY) ?? [];
  const migrated = stored.map((mutation): OfflineMutation =>
    mutation.type === 'library-upsert' && mutation.payload.status === 'SNOOZE'
      ? {
          ...mutation,
          type: 'library-delete',
          payload: { isbn13: mutation.payload.isbn13 },
        }
      : mutation
  );
  const valid = migrated.filter(isValidMutation);
  if (
    valid.length !== stored.length ||
    valid.some((mutation, index) => mutation !== stored[index])
  ) {
    localStorage.set(QUEUE_KEY, valid);
  }
  return valid;
}

export function enqueueOfflineMutation(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  }
): OfflineMutation {
  let queued = {
    ...mutation,
    id: mutation.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: mutation.createdAt ?? Date.now(),
  } as OfflineMutation;
  const existing = getOfflineMutations();
  const previous = existing.find((entry) => mutationKey(entry) === mutationKey(queued));
  if (queued.type === 'library-status-update' && previous?.type === 'library-upsert') {
    queued = {
      ...previous,
      payload: { ...previous.payload, ...queued.payload },
    };
  }
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
      if (error instanceof PermanentMutationError) {
        console.warn(`Discarding invalid offline mutation "${mutation.id}".`, error);
        continue;
      }
      console.warn(`Offline mutation "${mutation.id}" will be retried.`, error);
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

function isValidMutation(mutation: OfflineMutation): boolean {
  if (!mutation || typeof mutation.id !== 'string' || typeof mutation.createdAt !== 'number') {
    return false;
  }
  if (
    !['library-upsert', 'library-status-update', 'library-delete', 'daily-score-upsert'].includes(
      mutation.type
    )
  ) {
    return false;
  }
  return (
    mutation.type === 'daily-score-upsert' ||
    (typeof mutation.payload?.isbn13 === 'string' &&
      mutation.payload.isbn13.length === 13 &&
      (mutation.type === 'library-delete' || typeof mutation.payload.status === 'string'))
  );
}

function mutationKey(mutation: OfflineMutation): string {
  if (mutation.type === 'daily-score-upsert') {
    return `score:${String(mutation.payload.puzzleDate ?? '')}`;
  }
  return `library:${String(mutation.payload.isbn13 ?? mutation.id)}`;
}

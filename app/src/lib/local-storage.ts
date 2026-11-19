import { createMMKV } from 'react-native-mmkv';

type RawStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean | void;
};

const serverValues = new Map<string, string>();
const storage: RawStorage =
  typeof window === 'undefined'
    ? {
        getString: (key) => serverValues.get(key),
        set: (key, value) => {
          serverValues.set(key, value);
        },
        remove: (key) => serverValues.delete(key),
      }
    : createMMKV({ id: 'adaptle.local' });

export type JsonStorage = {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
};

export const localStorage: JsonStorage = {
  get<T>(key: string): T | null {
    const raw = storage.getString(key);
    if (raw === undefined) return null;

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      storage.remove(key);
      console.warn(`Discarded invalid local data for "${key}".`, error);
      return null;
    }
  },
  set<T>(key: string, value: T) {
    storage.set(key, JSON.stringify(value));
  },
  remove(key: string) {
    storage.remove(key);
  },
};

export const mmkvSupabaseStorage = {
  getItem(key: string) {
    return Promise.resolve(storage.getString(key) ?? null);
  },
  setItem(key: string, value: string) {
    storage.set(key, value);
    return Promise.resolve();
  },
  removeItem(key: string) {
    storage.remove(key);
    return Promise.resolve();
  },
};

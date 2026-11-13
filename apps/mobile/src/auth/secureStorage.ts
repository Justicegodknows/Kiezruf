// Supabase session storage in expo-secure-store (Keychain / Android Keystore).
// SecureStore warns above 2048 bytes per value and a Supabase session (two tokens plus the user object) is larger,
// so a value is split into chunks of at most CHUNK_BYTES UTF-8 bytes: "<key>.0", "<key>.1", … and "<key>.n" holds
// the chunk count. The count is removed first and written last, so an interrupted write reads back as "no session"
// (signed out) rather than as a broken one. All operations run one after another.
import * as SecureStore from 'expo-secure-store';

export const CHUNK_BYTES = 1800;
/** Upper bound on chunks we read back, so a corrupt count cannot make us read thousands of keys. */
const MAX_CHUNKS = 64;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Splits a string into pieces of at most maxBytes UTF-8 bytes, never inside a character. */
export function splitUtf8(value: string, maxBytes = CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of value) {
    const size = utf8Length(char.codePointAt(0)!);
    if (bytes + size > maxBytes && current) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  chunks.push(current);
  return chunks;
}

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 1 && n <= MAX_CHUNKS ? n : 0;
}

async function removeChunks(key: string, from: number, to: number) {
  for (let i = from; i < to; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
}

export interface ChunkedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createChunkedSecureStorage(): ChunkedStorage {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    getItem: (key) =>
      serial(async () => {
        const n = await readCount(key);
        if (n === 0) return null;
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const part = await SecureStore.getItemAsync(chunkKey(key, i));
          if (part === null) return null;
          parts.push(part);
        }
        return parts.join('');
      }),
    setItem: (key, value) =>
      serial(async () => {
        const previous = await readCount(key);
        const chunks = splitUtf8(value);
        if (chunks.length > MAX_CHUNKS) throw new Error('secure storage value too large');
        await SecureStore.deleteItemAsync(countKey(key));
        for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]!);
        await SecureStore.setItemAsync(countKey(key), String(chunks.length));
        await removeChunks(key, chunks.length, previous);
      }),
    removeItem: (key) =>
      serial(async () => {
        const previous = await readCount(key);
        await SecureStore.deleteItemAsync(countKey(key));
        await removeChunks(key, 0, previous);
      }),
  };
}

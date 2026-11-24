/**
 * Persistent cache for TMDB responses, backed by IndexedDB.
 *
 * The hosted build used `unstable_cache` on the server. With no server there is
 * nothing between the page and TMDB, so without this every tab switch, every
 * reload and every repeated search would be a fresh burst of upstream requests.
 *
 * Two layers:
 *   - a small in-memory Map, so hot reads never touch IDB;
 *   - an IndexedDB store, so a reload keeps the cache.
 *
 * Entries carry their own expiry, so a stale entry is deleted on read. There is
 * no eviction loop: TMDB payloads are small and the browser quota evicts this
 * origin's data on its own if it ever fills.
 */

const DB_NAME = 'rellix_tmdb_cache';
const DB_VERSION = 1;
const STORE = 'entries';

interface CacheRow {
  key: string;
  value: unknown;
  expiresAt: number;
}

interface MemoryRow {
  value: unknown;
  expiresAt: number;
}

const memory = new Map<string, MemoryRow>();
const MEMORY_MAX = 300;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function idbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

function remember(key: string, value: unknown, expiresAt: number): void {
  if (memory.size >= MEMORY_MAX) {
    // Map preserves insertion order; drop the oldest entries first.
    const drop = Math.ceil(MEMORY_MAX / 4);
    let i = 0;
    for (const k of memory.keys()) {
      memory.delete(k);
      if (++i >= drop) break;
    }
  }
  memory.set(key, { value, expiresAt });
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit) {
    if (hit.expiresAt > Date.now()) return hit.value as T;
    memory.delete(key);
  }

  const db = await openDb();
  if (!db) return undefined;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as CacheRow | undefined;
        if (!row) return resolve(undefined);
        if (row.expiresAt <= Date.now()) {
          // Fire and forget; a failed delete only costs one extra read later.
          void cacheDelete(key);
          return resolve(undefined);
        }
        remember(key, row.value, row.expiresAt);
        resolve(row.value as T);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlMs: number
): Promise<void> {
  const expiresAt = Date.now() + ttlMs;
  remember(key, value, expiresAt);

  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, value, expiresAt } satisfies CacheRow);
  } catch {
    /* quota or serialisation failure: the memory layer still works */
  }
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(key);
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
  } catch {}
}

/** Wipe every cached TMDB response. Used by Settings → Storage. */
export async function clearTmdbCache(): Promise<void> {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
  } catch {}
}

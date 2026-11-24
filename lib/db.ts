/**
 * Local data store for the offline-first build.
 *
 * Profiles, My List, likes, watch progress and PINs all live in this browser.
 * There is no account and no server: the app is a metadata browser that keeps
 * its own state in IndexedDB. Nothing here is synced anywhere, and clearing
 * site data removes all of it.
 *
 * ⚠️ The profile PIN is a UX lock, not a security boundary. It stops someone
 * else in the room from opening a profile; it does not stop anyone with devtools
 * or access to this browser's storage. Do not describe it as protecting data.
 */

import { MediaItem, UserProfile } from '@/types/movie';
import { DEFAULT_MAX_PROFILES } from '@/lib/profile-limits';
import { getActiveProfileIdSession, setActiveProfileIdSession } from '@/lib/profile-session';

const DB_NAME = 'rellix_streaming_db';
const DB_VERSION = 1;

const PROFILES = 'profiles';
const WATCHLIST = 'watchlist';
const CONTINUE = 'continue_watching';
const LIKES = 'likes';

type StoreName = typeof PROFILES | typeof WATCHLIST | typeof CONTINUE | typeof LIKES;

interface ProfileRow {
  id: string;
  name: string;
  avatarUrl: string;
  isKid: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  pinLength: number;
  createdAt: number;
}

interface WatchlistRow {
  key: string;
  profileId: string;
  mediaId: string;
  media: MediaItem;
  addedAt: number;
}

interface ContinueRow {
  key: string;
  profileId: string;
  mediaId: string;
  media: MediaItem;
  progressPercent: number;
  seasonNumber?: number;
  episodeNumber?: number;
  remainingMinutes?: number;
  updatedAt: number;
}

interface LikeRow {
  key: string;
  profileId: string;
  mediaId: string;
  addedAt: number;
}

export class ProfileLimitError extends Error {
  constructor(public readonly limit: number) {
    super('profile_limit_reached');
    this.name = 'ProfileLimitError';
  }
}

/**
 * A refused profile operation, e.g. deleting the last remaining profile or
 * changing a PIN without knowing the current one. `retryAfter` is populated for
 * `pin_locked` so the caller can show the remaining lockout seconds.
 */
export class ProfileGateError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfter = 0
  ) {
    super(code);
    this.name = 'ProfileGateError';
  }
}

const pairKey = (profileId: string, mediaId: string) => `${profileId}:${mediaId}`;

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl || '',
    isKid: Boolean(row.isKid),
    hasPin: Boolean(row.pinHash),
    pinLength: row.pinHash ? row.pinLength || 4 : 0,
  };
}

// ---------------------------------------------------------------------------
// IndexedDB plumbing
// ---------------------------------------------------------------------------

const memoryFallback: Record<StoreName, Map<string, any>> = {
  profiles: new Map(),
  watchlist: new Map(),
  continue_watching: new Map(),
  likes: new Map(),
};

function idbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(PROFILES)) {
          db.createObjectStore(PROFILES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(WATCHLIST)) {
          const store = db.createObjectStore(WATCHLIST, { keyPath: 'key' });
          store.createIndex('profileId', 'profileId', { unique: false });
        }
        if (!db.objectStoreNames.contains(CONTINUE)) {
          const store = db.createObjectStore(CONTINUE, { keyPath: 'key' });
          store.createIndex('profileId', 'profileId', { unique: false });
        }
        if (!db.objectStoreNames.contains(LIKES)) {
          const store = db.createObjectStore(LIKES, { keyPath: 'key' });
          store.createIndex('profileId', 'profileId', { unique: false });
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

async function readAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) return [...memoryFallback[store].values()] as T[];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as T[]);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function readByProfile<T>(store: StoreName, profileId: string): Promise<T[]> {
  const db = await openDb();
  if (!db) {
    return [...memoryFallback[store].values()].filter(
      (row) => row.profileId === profileId
    ) as T[];
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const index = tx.objectStore(store).index('profileId');
      const req = index.getAll(profileId);
      req.onsuccess = () => resolve((req.result ?? []) as T[]);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function readOne<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return (memoryFallback[store].get(key) as T) ?? null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeRow(store: StoreName, value: Record<string, any>): Promise<boolean> {
  const key = (value as any).key ?? (value as any).id;
  const db = await openDb();
  if (!db) {
    if (key) memoryFallback[store].set(key, value);
    return true;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function deleteRow(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memoryFallback[store].delete(key);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function deleteRowsForProfile(store: StoreName, profileId: string): Promise<void> {
  const rows = await readByProfile<{ key: string }>(store, profileId);
  await Promise.all(rows.map((row) => deleteRow(store, row.key)));
}

async function clearStore(store: StoreName): Promise<void> {
  memoryFallback[store].clear();
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// PIN hashing + local lockout
// ---------------------------------------------------------------------------

const PIN_ITERATIONS = 120_000;
const GUARD_PREFIX = 'rellix_pin_guard_';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return toHex(bytes);
}

/**
 * FNV-1a fallback for contexts without WebCrypto (`crypto.subtle` is missing on
 * insecure origins). It is NOT a password KDF — but the PIN is a UX lock stored
 * in the same browser it protects, so the threat model does not change.
 */
function weakHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    let value = `${salt}:${pin}`;
    for (let i = 0; i < 2_000; i++) value = weakHash(value);
    return `fnv:${value}`;
  }

  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromHex(salt),
      iterations: PIN_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256
  );
  return toHex(new Uint8Array(bits));
}

interface PinGuard {
  fails: number;
  lockUntil: number;
}

function readGuard(profileId: string): PinGuard {
  if (typeof window === 'undefined') return { fails: 0, lockUntil: 0 };
  try {
    const raw = localStorage.getItem(`${GUARD_PREFIX}${profileId}`);
    if (!raw) return { fails: 0, lockUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      fails: Number(parsed?.fails) || 0,
      lockUntil: Number(parsed?.lockUntil) || 0,
    };
  } catch {
    return { fails: 0, lockUntil: 0 };
  }
}

function writeGuard(profileId: string, guard: PinGuard): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${GUARD_PREFIX}${profileId}`, JSON.stringify(guard));
  } catch {}
}

function clearGuard(profileId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${GUARD_PREFIX}${profileId}`);
  } catch {}
}

/**
 * Escalating lockout after every 5 consecutive wrong PINs: 30s, 60s, 2m, 4m,
 * then a 5-minute ceiling. Stored per profile so switching profiles does not
 * reset it, and in localStorage so a reload does not either.
 */
function lockSecondsFor(fails: number): number {
  const rounds = Math.floor(fails / 5);
  if (rounds < 1) return 0;
  return Math.min(300, 30 * Math.pow(2, rounds - 1));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class BrowserDB {
  // --- Profiles ---

  async getProfiles(): Promise<UserProfile[]> {
    const rows = await readAll<ProfileRow>(PROFILES);
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(mapProfile);
  }

  /** This build has no plans; the cap is a local constant. */
  async getProfileLimit(): Promise<number> {
    return DEFAULT_MAX_PROFILES;
  }

  async addProfile(
    profile: UserProfile & { pin?: string | null }
  ): Promise<UserProfile | null> {
    const existing = await readAll<ProfileRow>(PROFILES);
    const limit = await this.getProfileLimit();
    if (existing.length >= limit) throw new ProfileLimitError(limit);

    const pin = (profile.pin || '').trim();
    if (pin && pin.length !== 4 && pin.length !== 6) {
      throw new ProfileGateError('bad_pin_length');
    }

    const salt = pin ? randomSalt() : null;
    const row: ProfileRow = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: profile.name.trim(),
      avatarUrl: profile.avatarUrl || '',
      isKid: Boolean(profile.isKid),
      pinHash: pin && salt ? await hashPin(pin, salt) : null,
      pinSalt: salt,
      pinLength: pin ? pin.length : 0,
      createdAt: Date.now(),
    };

    const ok = await writeRow(PROFILES, row);
    if (!ok) return null;
    return mapProfile(row);
  }

  async updateProfile(profile: UserProfile): Promise<void> {
    const row = await readOne<ProfileRow>(PROFILES, profile.id);
    if (!row) throw new ProfileGateError('profile_not_found');

    const next: ProfileRow = {
      ...row,
      name: profile.name.trim() || row.name,
      avatarUrl: profile.avatarUrl || row.avatarUrl,
      isKid: Boolean(profile.isKid),
    };
    if (!(await writeRow(PROFILES, next))) {
      throw new Error('Could not save the profile.');
    }
  }

  /**
   * Set or replace a profile PIN.
   *
   * Replacing an existing PIN requires the current one: the editor is reachable
   * from Settings without unlocking the profile, so without this check anyone
   * holding the browser could silently re-key somebody else's lock. The check
   * goes through `verifyPin`, which means it shares the same escalating lockout
   * as the lock screen instead of offering an unlimited-guess side door.
   *
   * No password is involved: there is no account. See the file header for what
   * this lock does and does not protect.
   */
  async setProfilePin(profileId: string, pin: string, currentPin?: string): Promise<void> {
    if (pin.length !== 4 && pin.length !== 6) {
      throw new ProfileGateError('bad_pin_length');
    }
    const row = await readOne<ProfileRow>(PROFILES, profileId);
    if (!row) throw new ProfileGateError('profile_not_found');

    if (row.pinHash) {
      const check = await verifyPin(profileId, currentPin ?? '');
      if (!check.ok) {
        throw new ProfileGateError(check.locked ? 'pin_locked' : 'wrong_pin', check.retryAfter);
      }
    }

    const salt = randomSalt();
    const next: ProfileRow = {
      ...row,
      pinHash: await hashPin(pin, salt),
      pinSalt: salt,
      pinLength: pin.length,
    };
    if (!(await writeRow(PROFILES, next))) {
      throw new Error('Could not save the PIN.');
    }
    clearGuard(profileId);
  }

  /** Remove a profile PIN. An existing lock requires its current PIN. */
  async clearProfilePin(profileId: string, currentPin?: string): Promise<void> {
    const row = await readOne<ProfileRow>(PROFILES, profileId);
    if (!row) throw new ProfileGateError('profile_not_found');

    if (row.pinHash) {
      const check = await verifyPin(profileId, currentPin ?? '');
      if (!check.ok) {
        throw new ProfileGateError(check.locked ? 'pin_locked' : 'wrong_pin', check.retryAfter);
      }
    }

    const next: ProfileRow = {
      ...row,
      pinHash: null,
      pinSalt: null,
      pinLength: 0,
    };
    if (!(await writeRow(PROFILES, next))) {
      throw new Error('Could not remove the PIN.');
    }
    clearGuard(profileId);
  }

  /**
   * Delete a profile and everything keyed to it. Refuses to remove the last
   * profile, because an app with no profile has no way back in.
   *
   * A PIN-locked profile also requires its current PIN here: deletion is the
   * most destructive thing the editor can do, and Settings can be opened without
   * unlocking a profile. Without this, the lock would stop someone opening a
   * profile but not wiping it.
   */
  async deleteProfile(profileId: string, currentPin?: string): Promise<void> {
    const rows = await readAll<ProfileRow>(PROFILES);
    if (rows.length <= 1) throw new ProfileGateError('last_profile');

    const row = rows.find((p) => p.id === profileId);
    if (!row) throw new ProfileGateError('profile_not_found');
    if (row.pinHash) {
      const check = await verifyPin(profileId, currentPin ?? '');
      if (!check.ok) {
        throw new ProfileGateError(check.locked ? 'pin_locked' : 'wrong_pin', check.retryAfter);
      }
    }

    await Promise.all([
      deleteRowsForProfile(WATCHLIST, profileId),
      deleteRowsForProfile(CONTINUE, profileId),
      deleteRowsForProfile(LIKES, profileId),
    ]);
    await deleteRow(PROFILES, profileId);
    clearGuard(profileId);

    if (getActiveProfileIdSession() === profileId) setActiveProfileIdSession(null);
  }

  // --- Watchlist / My List ---

  /**
   * My List returns the stored snapshot, not just ids.
   *
   * A title saved from search or a rail may not be in the current home feed
   * after a reload. Returning ids forced the UI to join against whatever the
   * catalogue happened to contain, which silently dropped saved titles.
   */
  async getWatchlist(profileId: string): Promise<MediaItem[]> {
    const rows = await readByProfile<WatchlistRow>(WATCHLIST, profileId);
    return rows
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((r) => r.media);
  }

  async toggleWatchlist(profileId: string, media: MediaItem): Promise<MediaItem[]> {
    const current = await this.getWatchlist(profileId);
    const key = pairKey(profileId, media.id);
    const exists = current.some((item) => item.id === media.id);

    if (exists) {
      await deleteRow(WATCHLIST, key);
      return current.filter((item) => item.id !== media.id);
    }

    await writeRow(WATCHLIST, {
      key,
      profileId,
      mediaId: media.id,
      media,
      addedAt: Date.now(),
    } satisfies WatchlistRow);
    return [media, ...current];
  }

  // --- Continue Watching ---

  async getContinueWatching(profileId: string): Promise<MediaItem[]> {
    const rows = await readByProfile<ContinueRow>(CONTINUE, profileId);
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        ...row.media,
        continueWatchingProgress: row.progressPercent,
        remainingMinutes: row.remainingMinutes,
        continueWatchingSeason: row.seasonNumber,
        continueWatchingEpisode: row.episodeNumber,
      }));
  }

  async updateContinueWatching(
    profileId: string,
    media: MediaItem,
    progressPercent: number,
    seasonNumber?: number,
    episodeNumber?: number,
    runtimeMinutes?: number
  ): Promise<MediaItem[]> {
    const current = await this.getContinueWatching(profileId);
    const previous = current.find((m) => m.id === media.id);
    const remaining = runtimeMinutes
      ? Math.max(1, Math.round(runtimeMinutes * (1 - progressPercent / 100)))
      : previous?.remainingMinutes ?? media.remainingMinutes;

    const key = pairKey(profileId, media.id);
    await writeRow(CONTINUE, {
      key,
      profileId,
      mediaId: media.id,
      media,
      progressPercent,
      seasonNumber,
      episodeNumber,
      remainingMinutes: remaining,
      updatedAt: Date.now(),
    } satisfies ContinueRow);

    const updatedItem: MediaItem = {
      ...media,
      continueWatchingProgress: progressPercent,
      remainingMinutes: remaining,
      continueWatchingSeason: seasonNumber,
      continueWatchingEpisode: episodeNumber,
    };

    const idx = current.findIndex((m) => m.id === media.id);
    if (idx >= 0) {
      const next = [...current];
      next[idx] = updatedItem;
      return next;
    }
    return [updatedItem, ...current];
  }

  async removeContinueWatching(
    profileId: string,
    mediaId: string
  ): Promise<MediaItem[]> {
    await deleteRow(CONTINUE, pairKey(profileId, mediaId));
    const current = await this.getContinueWatching(profileId);
    return current.filter((m) => m.id !== mediaId);
  }

  // --- Likes ---

  async getLikes(profileId: string): Promise<string[]> {
    const rows = await readByProfile<LikeRow>(LIKES, profileId);
    return rows.map((r) => r.mediaId);
  }

  async toggleLike(profileId: string, mediaId: string): Promise<string[]> {
    const current = await this.getLikes(profileId);
    const key = pairKey(profileId, mediaId);
    const exists = current.includes(mediaId);

    if (exists) {
      await deleteRow(LIKES, key);
      return current.filter((id) => id !== mediaId);
    }

    await writeRow(LIKES, {
      key,
      profileId,
      mediaId,
      addedAt: Date.now(),
    } satisfies LikeRow);
    return [mediaId, ...current];
  }

  // --- Active profile (this tab only) ---
  //
  // The marker lives in sessionStorage and is owned by the page. Do not also
  // write it to localStorage: two sources of truth let a deleted profile look
  // active across reloads.
}

export const browserDB = new BrowserDB();

// --- Lightweight local settings ---
const SETTINGS_KEY = 'rellix_app_settings';

export interface AppSettings {
  profileAsk: 'always' | 'first-time' | 'never';
}

export function getAppSettings(): AppSettings {
  if (typeof window === 'undefined') return { profileAsk: 'always' };
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && ['always', 'first-time', 'never'].includes(parsed.profileAsk)) {
        return parsed;
      }
    }
  } catch {}
  return { profileAsk: 'always' };
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

// --- PIN verification ---

/**
 * Verify a profile PIN, applying a local escalating lockout.
 *
 * Returns the same shape the lock screen already understands so the component
 * did not need to change:
 *   { ok: true }
 *   { ok: false, locked: true, retryAfter: <seconds> }
 *   { ok: false, locked: false }
 */
export async function verifyPin(
  profileId: string,
  input: string
): Promise<{ ok: boolean; locked: boolean; retryAfter: number }> {
  try {
    const guard = readGuard(profileId);
    if (guard.lockUntil > Date.now()) {
      return {
        ok: false,
        locked: true,
        retryAfter: Math.ceil((guard.lockUntil - Date.now()) / 1000),
      };
    }

    const row = await readOne<ProfileRow>(PROFILES, profileId);
    if (!row) return { ok: false, locked: false, retryAfter: 0 };
    if (!row.pinHash || !row.pinSalt) {
      // No PIN on this profile: nothing to verify.
      return { ok: true, locked: false, retryAfter: 0 };
    }

    const candidate = await hashPin(input, row.pinSalt);
    if (candidate === row.pinHash) {
      clearGuard(profileId);
      return { ok: true, locked: false, retryAfter: 0 };
    }

    const fails = guard.fails + 1;
    const lockSeconds = lockSecondsFor(fails);
    writeGuard(profileId, {
      fails,
      lockUntil: lockSeconds > 0 ? Date.now() + lockSeconds * 1000 : 0,
    });

    return {
      ok: false,
      locked: lockSeconds > 0,
      retryAfter: lockSeconds,
    };
  } catch {
    return { ok: false, locked: false, retryAfter: 0 };
  }
}

// --- Bulk operations used by Settings ---

export async function clearHistory(profileId: string): Promise<void> {
  await deleteRowsForProfile(CONTINUE, profileId);
}

export async function clearWatchlist(profileId: string): Promise<void> {
  await deleteRowsForProfile(WATCHLIST, profileId);
}

export async function clearEverything(): Promise<void> {
  await Promise.all([
    clearStore(PROFILES),
    clearStore(WATCHLIST),
    clearStore(CONTINUE),
    clearStore(LIKES),
  ]);

  // "Delete all local data" must include the TMDB key, playback preferences,
  // recent searches and PIN guards. They all live under the rellix_ prefix in
  // localStorage/sessionStorage. The IndexedDB TMDB cache is cleared separately
  // by Settings because its module owns that database.
  if (typeof window !== 'undefined') {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      try {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key?.startsWith('rellix_')) storage.removeItem(key);
        }
      } catch {}
    }
  }
}

/** JSON backup of everything this browser holds. */
export async function exportData(): Promise<string> {
  const [profiles, watchlist, continueWatching, likes] = await Promise.all([
    readAll<ProfileRow>(PROFILES),
    readAll<WatchlistRow>(WATCHLIST),
    readAll<ContinueRow>(CONTINUE),
    readAll<LikeRow>(LIKES),
  ]);

  return JSON.stringify(
    {
      app: 'Rellix',
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        isKid: p.isKid,
        pinHash: p.pinHash,
        pinSalt: p.pinSalt,
        pinLength: p.pinLength,
        createdAt: p.createdAt,
      })),
      watchlist: watchlist.map((r) => ({
        profileId: r.profileId,
        mediaId: r.mediaId,
        media: r.media,
        addedAt: r.addedAt,
      })),
      continueWatching: continueWatching.map((r) => ({
        profileId: r.profileId,
        mediaId: r.mediaId,
        media: r.media,
        progressPercent: r.progressPercent,
        seasonNumber: r.seasonNumber,
        episodeNumber: r.episodeNumber,
        remainingMinutes: r.remainingMinutes,
        updatedAt: r.updatedAt,
      })),
      likes: likes.map((r) => ({
        profileId: r.profileId,
        mediaId: r.mediaId,
        addedAt: r.addedAt,
      })),
    },
    null,
    2
  );
}

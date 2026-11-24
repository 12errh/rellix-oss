/**
 * TMDB API key storage for the browser-only build.
 *
 * There is no server to hold a key, so the key lives in this browser's
 * localStorage and every TMDB call is made directly from the page. TMDB's API
 * sends `access-control-allow-origin: *`, so this works from any origin.
 *
 * An operator who would rather ship a working build than ask visitors for a key
 * can set NEXT_PUBLIC_TMDB_API_KEY at build time. That value is inlined into the
 * JavaScript bundle and is therefore PUBLIC — it is a convenience default for a
 * private/self-hosted deployment, not a secret.
 */

const STORAGE_KEY = 'rellix_tmdb_key';
const CHANGE_EVENT = 'rellix:tmdb-key-changed';

const BUILD_TIME_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY?.trim() || null;

/** The user's own key, falling back to an operator-supplied build default. */
export function getTmdbKey(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)?.trim();
      if (stored) return stored;
    } catch {
      /* localStorage can throw in private mode */
    }
  }
  return BUILD_TIME_KEY;
}

/** True when a key came from the build, not from this browser. */
export function isUsingBuildTimeKey(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !localStorage.getItem(STORAGE_KEY)?.trim() && Boolean(BUILD_TIME_KEY);
  } catch {
    return Boolean(BUILD_TIME_KEY);
  }
}

export function setTmdbKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  try {
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearTmdbKey(): void {
  setTmdbKey('');
}

/** Subscribe to key changes. Returns an unsubscribe function. */
export function onTmdbKeyChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function hasTmdbKey(): boolean {
  return Boolean(getTmdbKey());
}

/**
 * Validate a key against TMDB before storing it.
 *
 * `/configuration` is the cheapest authenticated endpoint and proves the key is
 * live. A 401 means the key is wrong or revoked; anything else non-200 is
 * reported as a network problem rather than "invalid key", because blaming the
 * user's key for TMDB being down is worse than saying nothing.
 */
export async function validateTmdbKey(
  key: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: 'Enter a key first.' };

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(trimmed)}`
    );
    if (res.ok) return { ok: true };
    if (res.status === 401) {
      return { ok: false, error: 'TMDB rejected that key. Check it and try again.' };
    }
    return {
      ok: false,
      error: `TMDB answered ${res.status}. Try again in a moment.`,
    };
  } catch {
    return {
      ok: false,
      error: 'Could not reach TMDB. Check your connection and try again.',
    };
  }
}

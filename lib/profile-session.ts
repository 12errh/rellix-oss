/**
 * In-memory "who is browsing right now" marker.
 *
 * Unlike localStorage it survives client-side navigation (settings → home) but
 * is lost on a real reload / new tab, which is exactly the behaviour we want:
 * app navigation keeps the session, reload returns to the profile picker.
 */
const ACTIVE_PROFILE_KEY = 'rellix_active_profile_id';

let activeProfileMemory: string | null = null;

export function setActiveProfileMemory(id: string | null): void {
  activeProfileMemory = id;
}

export function getActiveProfileMemory(): string | null {
  return activeProfileMemory;
}

/** The active profile for this tab. sessionStorage clears with the tab. */
export function getActiveProfileIdSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProfileIdSession(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id === null) window.sessionStorage.removeItem(ACTIVE_PROFILE_KEY);
    else window.sessionStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {}
}

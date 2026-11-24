/**
 * Small user preferences that are not part of the profile data model.
 * All localStorage, all per-browser.
 */

import { DEFAULT_SERVER, STREAM_SOURCES, type StreamServer } from './embed-urls';

const SERVER_KEY = 'rellix_default_server';

function isStreamServer(value: string | null): value is StreamServer {
  return Boolean(value) && STREAM_SOURCES.includes(value as StreamServer);
}

/** Preferred streaming source, used as the player's initial selection. */
export function getDefaultServer(): StreamServer {
  if (typeof window === 'undefined') return DEFAULT_SERVER;
  try {
    const stored = localStorage.getItem(SERVER_KEY);
    return isStreamServer(stored) ? stored : DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}

export function setDefaultServer(server: StreamServer): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SERVER_KEY, server);
  } catch {}
}

const CUSTOM_URL_KEY = 'rellix_custom_embed_url';

/**
 * Last Custom URL the user typed.
 *
 * The app ships no custom URL; whatever is here was supplied by the user. It is
 * only ever loaded after an explicit scheme check, and only inside the sandboxed
 * iframe when the Custom source is selected.
 */
export function getCustomEmbedUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(CUSTOM_URL_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomEmbedUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = url.trim();
    if (trimmed) localStorage.setItem(CUSTOM_URL_KEY, trimmed);
    else localStorage.removeItem(CUSTOM_URL_KEY);
  } catch {}
}

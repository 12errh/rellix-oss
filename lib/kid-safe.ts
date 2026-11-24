import type { MediaItem } from '@/types/movie';

/**
 * Kid mode.
 *
 * A "Kids profile" promises family-safe content, so the filtering cannot live
 * only in the home tab — the browse grids, search, suggestions, recommendations
 * and every rail all read the same catalogue. This module is the single flag
 * those reads share.
 *
 * `lib/client-media.ts` applies it to every list payload it returns, which
 * makes it a boundary rather than a per-component convention: a new screen that
 * calls `mediaFetch` is covered without opting in. The home screen also filters
 * its pre-fetched state, because that state can exist before a profile is
 * chosen.
 *
 * Rating buckets are coarse by nature (`ALL`, `7+`, `13+`, `16+`, `18+`).
 * "Family-safe" here means `ALL` or `7+`. A title with no US certification is
 * conservatively mapped to `13+` by `mapTmdbRating`, so an unknown age rating
 * never enters a kids catalogue.
 */
let kidMode = false;

export function setKidMode(value: boolean): void {
  kidMode = value;
}

export function isKidMode(): boolean {
  return kidMode;
}

export function isKidSafe(item: Pick<MediaItem, 'rating'>): boolean {
  return item.rating === 'ALL' || item.rating === '7+';
}

export function kidSafeItems(items: MediaItem[]): MediaItem[] {
  return items.filter(isKidSafe);
}

/** Filter the list fields of a catalogue payload; leaves everything else alone. */
export function filterKidPayload<T>(body: T): T {
  if (!kidMode || !body || typeof body !== 'object') return body;
  const source = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  for (const key of ['items', 'results', 'movies', 'tv', 'anime']) {
    const value = source[key];
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (entry): entry is MediaItem =>
          Boolean(entry) && typeof entry === 'object' && isKidSafe(entry as MediaItem)
      );
    }
  }
  return out as T;
}

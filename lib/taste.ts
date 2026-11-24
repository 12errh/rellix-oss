import { MediaItem } from '@/types/movie';

/**
 * Taste profile + match score.
 *
 * Root cause of the old scores: `matchScore` (TMDB `vote_average * 10`) was
 * used as the base, so "98% Match" mostly meant "critics liked it", and adding
 * a flat genre boost pushed most of the catalogue into 85-99. A number was
 * shown even for a brand-new account with no likes and no watch history, which
 * is a fabricated recommendation.
 *
 * The score is now derived only from what the viewer has actually done:
 *   - a like weights a genre 3x a watch
 *   - the item's genre overlap with that weighted profile sets the base
 *   - critically-rated titles nudge up, popular ones nudge down (a tiebreak,
 *     never the driver)
 * The profile is passed in explicitly (see components/TasteProvider.tsx), so a
 * render can never read a previous profile's module-global state. When there is
 * no taste signal at all, computeMatch returns null and callers hide the badge
 * instead of inventing one.
 */

const GENRE_WEIGHT_LIKE = 3;
const GENRE_WEIGHT_WATCH = 1;

/** Pure derivation of the weighted genre profile. */
export function buildTasteProfile(
  allMedia: MediaItem[],
  likedIds: string[],
  watched: MediaItem[]
): Map<string, number> {
  const profile = new Map<string, number>();

  for (const item of watched) {
    for (const g of item.genres) profile.set(g, (profile.get(g) ?? 0) + GENRE_WEIGHT_WATCH);
  }
  // A like is a stronger signal than a watch, and is applied after so it wins ties.
  for (const item of allMedia) {
    if (!likedIds.includes(item.id)) continue;
    for (const g of item.genres) profile.set(g, (profile.get(g) ?? 0) + GENRE_WEIGHT_LIKE);
  }

  return profile;
}

export function topGenresFrom(profile: Map<string, number>, limit = 3): string[] {
  return [...profile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}

/**
 * Returns a 0-100 affinity score, or null when the viewer has no taste signal
 * yet (no likes, no watch history) — callers must hide the badge in that case.
 *
 * Two independent signals, because one is not enough:
 *   AFFINITY  — what share of the viewer's total interest this title covers.
 *               Scale-invariant, so it ranks breadth correctly.
 *   CONFIDENCE— how much evidence backs the profile at all, derived from total
 *               weight. This is what stops a single like and a single watch from
 *               producing the same number: normalising affinity alone is
 *               scale-invariant and would rank them identically.
 */
export function computeMatch(
  item: MediaItem,
  tasteProfile: ReadonlyMap<string, number> | null
): number | null {
  if (!tasteProfile || tasteProfile.size === 0) return null;

  const genres = item.genres ?? [];
  if (genres.length === 0) return null;

  let totalWeight = 0;
  for (const w of tasteProfile.values()) totalWeight += w;
  if (totalWeight <= 0) return null;

  // Share of the viewer's interest that this title's genres account for.
  let affinity = 0;
  let matchedGenres = 0;
  for (const g of genres) {
    const w = tasteProfile.get(g);
    if (!w) continue;
    affinity += w / totalWeight;
    matchedGenres++;
  }

  // Evidence behind the profile. log so the first few signals matter most.
  const confidence = Math.min(18, Math.round(4 * Math.log2(1 + totalWeight)));

  let score = 30 + Math.min(1, affinity) * 52 + confidence;
  if (matchedGenres === 0) score -= 12; // nothing in common: say so
  else if (matchedGenres >= 2) score += 4; // corroborating overlap

  // Small quality/popularity tiebreak so two equally-relevant titles differ.
  const rating = typeof item.matchScore === 'number' ? item.matchScore / 10 : 7;
  score += (rating - 7) * 3;
  if (item.isNewRelease) score += 2;
  if (item.isTrending) score += 1;

  return Math.max(20, Math.min(99, Math.round(score)));
}
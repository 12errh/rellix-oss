// Lightweight fuzzy title matching for search suggestions.
// Not perfect — tolerant enough to catch mild typos, missing/extra spaces, and
// partial words on the titles our app already knows about.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[b.length];
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\[\]()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scoreTitle(title: string, overview: string, query: string): number {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return 0;
  const words = normalizeTitle(title).split(/\s+/).filter(Boolean);
  const qWords = normalizeTitle(trimmed).split(/\s+/).filter(Boolean);
  let score = 0;
  for (const q of qWords) {
    let best = 0;
    for (const w of words) {
      if (w === q) best = Math.max(best, 10);
      else if (w.startsWith(q) || q.startsWith(w)) best = Math.max(best, 7);
      else if (w.includes(q) || (q.length >= 4 && q.includes(w))) best = Math.max(best, 4);
      else {
        const maxLen = Math.max(w.length, q.length);
        const dist = levenshtein(w, q);
        const ratio = 1 - dist / maxLen;
        if (ratio >= 0.55) best = Math.max(best, Math.round(ratio * 5));
      }
      if (q.length <= 2 && w.includes(q)) best = Math.max(best, 3);
    }
    if (best === 0) {
      // typo-pair penalty: a token with no match ends the hope, don't score at all
      return 0;
    }
    score += best;
  }
  if (overview && overview.toLowerCase().includes(trimmed)) score += 3;
  return score;
}

export function fuzzySuggestions<T extends { title: string; overview?: string }>(
  items: T[],
  query: string,
  max = 6
): T[] {
  return items
    .map((item) => ({ item, s: scoreTitle(item.title, item.overview || '', query) }))
    .filter((entry) => entry.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((entry) => entry.item);
}

/**
 * The full ranking signal for a search: title/overview fuzziness plus a bonus
 * when the query names someone in the cast or a genre of the item.
 *
 * Used by BOTH the server (ranking TMDB search results in lib/tmdb.ts) and the
 * client (ordering search-tab results), so the two surfaces cannot disagree
 * about what the "Top Match" is.
 */
export function searchRankScore(
  item: { title: string; overview?: string; cast?: string[]; genres?: string[] },
  query: string
): number {
  let score = scoreTitle(item.title, item.overview || '', query);
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (item.cast?.some((c) => c.toLowerCase().includes(q))) score += 8;
  if (item.genres?.some((g) => g.toLowerCase().includes(q))) score += 3;
  return score;
}

/**
 * Alternative TMDB queries to try when the exact phrase barely matches.
 *
 * Root cause of "searching bhoot bangla finds nothing while Bhooth Bangla
 * exists": TMDB's `/search/multi` is near-exact — one missing letter inside a
 * word ("bhoot" vs "bhooth") yields zero results, and then every fallback layer
 * in the app is also substring-based, so the user sees an empty page.
 *
 * The variants below attempt progressively shorter prefixes of the query,
 * cheapest and most likely first: "bhoot bangla" -> "bhoot". A one-word prefix
 * matches TMDB's per-word prefix index, which does catch Bhooth Bangla and any
 * other title starting with that word. Results are merged and then RANKED
 * against the ORIGINAL query with searchRankScore, so the rescued items cannot
 * bury the best match.
 *
 * Bounded: at most maxVariants entries beyond the original, which bounds the
 * extra TMDB requests per search to the same number. Each attempt is
 * unstable_cache'd for an hour, so repeat searches for the same typo'd query do
 * not re-hit TMDB.
 */
export function variantQueries(rawQuery: string, maxVariants = 3): string[] {
  const q = rawQuery.trim().replace(/\s+/g, ' ');
  if (!q) return [];

  const out: string[] = [];
  const words = q.split(' ');
  // Drop trailing words one at a time: "iron man 3 hindi" -> "iron man 3" ->
  // "iron man" -> "iron". Stop before a one-letter fragment.
  for (let n = words.length - 1; n >= 1; n--) {
    const v = words.slice(0, n).join(' ');
    if (v.replace(/[^a-z0-9]/gi, '').length < 3) break;
    out.push(v);
    if (out.length >= maxVariants) break;
  }
  return out;
}

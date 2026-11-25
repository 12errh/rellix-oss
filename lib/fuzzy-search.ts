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
 * TMDB's `/search/multi` is near-exact: a misspelled word ("avengres",
 * "interstelar", "bhoot bangla") returns nothing useful, and every fallback
 * layer in the app is substring-based too, so the user sees an empty page.
 *
 * TMDB does match *word prefixes*, so the cheapest rescue is to shorten the
 * words that are likely wrong. Trimming one or two letters off the end turns
 * "avengres" into "aveng" and "endgme" into "endg", which still hits
 * "Avengers: Endgame". Trailing-word drops stay as the last resort for queries
 * padded with extras ("iron man 3 hindi").
 *
 * Results are merged and RANKED against the ORIGINAL query with
 * searchRankScore, so rescued rows cannot bury the best match.
 *
 * Bounded: at most maxVariants entries beyond the original, so a search costs
 * at most 1 + maxVariants TMDB requests.
 */
export function variantQueries(rawQuery: string, maxVariants = 4): string[] {
  const q = rawQuery.trim().replace(/\s+/g, ' ');
  if (!q) return [];

  const out: string[] = [];
  const words = q.split(' ');
  const seen = new Set<string>([q.toLowerCase()]);

  const push = (v: string) => {
    const key = v.trim().toLowerCase();
    if (!seen.has(key) && v.replace(/[^a-z0-9]/gi, '').length >= 3) {
      seen.add(key);
      out.push(v.trim());
    }
  };

  // A misspelling diverges at an unknown letter, so TMDB only accepts the
  // SHORT prefix that both spellings still share ("avengres" -> "aveng",
  // "interstelar" -> "interste"). Cut long words aggressively; short words
  // lose one letter at a time.
  const prefixes = (w: string) => {
    const letters = w.replace(/[^a-z0-9]/gi, '');
    const lens = letters.length > 6 ? [5, 6, 4] : [letters.length - 1, letters.length - 2];
    const res: string[] = [];
    for (const len of lens) {
      if (len >= 4 && len < letters.length) res.push(letters.slice(0, len));
    }
    return res;
  };

  // 1. Drop trailing padding first: "iron man 3 hindi" -> "iron man 3".
  for (let n = words.length - 1; n >= 1; n--) {
    const v = words.slice(0, n).join(' ');
    if (v.replace(/[^a-z0-9]/gi, '').length < 3) break;
    push(v);
    if (out.length >= maxVariants) return out;
  }

  // 2. Single-token prefixes of the longest words. This is the rescue that
  //    survives a fully misspelled phrase, where TMDB cannot AND-match.
  const tokens = [...words].sort((a, b) => b.length - a.length);
  for (const t of tokens) {
    for (const p of prefixes(t)) {
      push(p);
      if (out.length >= maxVariants) return out;
    }
  }

  // 3. Keep the leading words (often right) and shorten only the last word:
  //    "avengers endgme" -> "avengers endg".
  if (words.length > 1) {
    const head = words.slice(0, -1).join(' ');
    for (const p of prefixes(words[words.length - 1])) {
      push(`${head} ${p}`);
      if (out.length >= maxVariants) return out;
    }
  }
  return out;
}

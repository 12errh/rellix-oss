/**
 * TMDB client — the browser port of the old server-side `lib/tmdb.ts`.
 *
 * Differences from the server version, all forced by the absence of a server:
 *   - the API key comes from localStorage (`lib/tmdb-key.ts`) instead of an
 *     env var or the admin-managed key pool;
 *   - `unstable_cache` and `next: { revalidate }` are replaced by an
 *     IndexedDB-backed TTL cache (`lib/tmdb-cache.ts`);
 *   - nothing is exported that depends on Node built-ins.
 *
 * Everything else — mapping, rating buckets, anime classification, the fuzzy
 * search rescue, filter construction — is unchanged. It is the same catalogue
 * logic, so the UI behaves exactly as it did.
 */

import { MediaItem, MediaType } from '@/types/movie';
import {
  ALL_MEDIA,
  LATEST_MOVIES,
  POPULAR_ANIME,
  ACCLAIMED_TV_SHOWS,
  TOP_10_SHOWS,
} from './movies-data';
import { getTmdbKey } from './tmdb-key';
import { cacheGet, cacheSet } from './tmdb-cache';
import { searchRankScore, variantQueries } from './fuzzy-search';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const LIST_TTL = 60 * 60 * 1000; // 1 hour
const CERT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TmdbListResult {
  results?: any[];
  total_pages?: number;
  total_results?: number;
}

interface TmdbVideo {
  site: string;
  type: string;
  key: string;
}

/**
 * Raw TMDB request. Returns null on any failure — never throws.
 *
 * 12s is generous for a list call and short enough that a hung request does not
 * hold a rail open indefinitely. The old server had the same bound.
 */
async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const key = getTmdbKey();
  if (!key) return null;

  try {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('language', 'en-US');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } finally {
      clearTimeout(tid);
    }
  } catch {
    return null;
  }
}

/**
 * Cache identity includes a fingerprint of the active TMDB key.
 *
 * Without it, replacing a visitor's key served list/cert responses cached under
 * the previous key for up to 30 days. The key never leaves this device, so a
 * short non-cryptographic hash is enough to separate cache namespaces.
 */
function activeKeyTag(): string {
  const key = getTmdbKey();
  if (!key) return 'none';
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheKeyFor(path: string, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `list:${activeKeyTag()}:${path}?${sorted}`;
}

/**
 * In-flight list requests, keyed the same way as the cache.
 *
 * Several rails can mount in the same tick and ask for an identical query. The
 * cache is async (IndexedDB), so without this map they would all miss it and all
 * call TMDB.
 */
const listInFlight = new Map<string, Promise<unknown>>();

async function tmdbCached<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const key = cacheKeyFor(path, params);

  const cached = await cacheGet<T>(key);
  if (cached !== undefined) return cached;

  const existing = listInFlight.get(key);
  if (existing) return existing as Promise<T | null>;

  const pending = (async () => {
    const data = await tmdbFetch<T>(path, params);
    // Failures are deliberately not cached: a transient timeout must not pin an
    // empty rail for an hour.
    if (data !== null) await cacheSet(key, data, LIST_TTL);
    return data;
  })().finally(() => {
    listInFlight.delete(key);
  });

  listInFlight.set(key, pending);
  return pending;
}

async function fetchCertRemote(
  kind: 'movie' | 'tv',
  id: number
): Promise<string | null> {
  if (kind === 'movie') {
    const d = await tmdbFetch<any>(`/movie/${id}/release_dates`);
    return (
      d?.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates?.[0]
        ?.certification || null
    );
  }
  const d = await tmdbFetch<any>(`/tv/${id}/content_ratings`);
  return (
    d?.results?.find((r: any) => r.iso_3166_1 === 'US')?.rating || null
  );
}

/**
 * Bounded in-memory memo for certifications.
 *
 * The 30-day IndexedDB entry is the real store; this only absorbs the repeated
 * ids within one page session. Capped because an unbounded Map on a long-lived
 * tab is a leak.
 */
const CERT_CACHE_MAX = 5_000;
const certCache = new Map<string, string>();
const certMisses = new Set<string>();

function certCacheSet(key: string, value: string): void {
  if (certCache.size >= CERT_CACHE_MAX) {
    const oldest = certCache.keys().next();
    if (!oldest.done) certCache.delete(oldest.value);
  }
  certCache.set(key, value);
}

/**
 * One in-flight promise per title, so two rails asking for the same poster's
 * rating do not both hit TMDB.
 */
const certInFlight = new Map<string, Promise<string | null>>();

/**
 * Global cap on concurrent certification requests.
 *
 * Each rail used to run its own 8-worker pool; with 36 rails that multiplied
 * into hundreds of simultaneous calls. A single process-wide semaphore is what
 * actually bounds it, and in a browser that also keeps the tab responsive.
 */
const CERT_MAX_CONCURRENT = 10;
let certActive = 0;
const certWaiters: Array<() => void> = [];

async function withCertSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (certActive >= CERT_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => certWaiters.push(resolve));
  }
  certActive++;
  try {
    return await fn();
  } finally {
    certActive--;
    const next = certWaiters.shift();
    if (next) next();
  }
}

// Adult/hentai titles on TMDB are not flagged via the `adult` boolean — the only
// reliable way to keep them behind the 18+ toggle is to exclude these keywords.
const ADULT_ANIME_KEYWORDS = '198385,195669,384581,256466,325693,155477,161919';

async function fetchCert(
  kind: 'movie' | 'tv',
  id: number
): Promise<string | null> {
  const key = `cert:${activeKeyTag()}:${kind}:${id}`;

  const mem = certCache.get(key);
  if (mem) return mem;

  // A title with no US certification would otherwise be re-fetched on every
  // single rail render. Remember the miss for this session.
  if (certMisses.has(key)) return null;

  const persisted = await cacheGet<string>(key);
  if (persisted) {
    certCacheSet(key, persisted);
    return persisted;
  }

  const existing = certInFlight.get(key);
  if (existing) return existing;

  const pending = withCertSlot(async () => {
    const cert = await fetchCertRemote(kind, id);
    if (cert) {
      certCacheSet(key, cert);
      await cacheSet(key, cert, CERT_TTL);
    } else {
      certMisses.add(key);
    }
    return cert;
  }).finally(() => {
    certInFlight.delete(key);
  });

  certInFlight.set(key, pending);
  return pending;
}

// TMDB list responses don't include certifications, so hydrate ages one by one
// (memoized, coalesced, and bounded by the global semaphore). This is what keeps
// card rating badges real instead of guessed.
async function withCertifications(items: MediaItem[]): Promise<MediaItem[]> {
  const CONCURRENCY = 8;
  const queue = [...items];
  const workers = Array.from({ length: CONCURRENCY }, () =>
    (async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item || !item.tmdbId) continue;
        const kind = item.type === 'movie' ? 'movie' : 'tv';
        const cert = await fetchCert(kind, item.tmdbId);
        if (cert) item.rating = mapTmdbRating(cert);
      }
    })()
  );
  await Promise.all(workers);
  return items;
}

export function mapTmdbRating(certification?: string | null): MediaItem['rating'] {
  const c = (certification || '').toUpperCase();
  if (c === 'G' || c === 'TV-G' || c === 'TV-Y' || c === 'TV-Y7') return 'ALL';
  if (c === 'PG' || c === 'TV-PG') return '7+';
  if (c === 'PG-13' || c === 'TV-14') return '13+';
  if (c === 'R' || c === 'TV-MA' || c === 'MA') return '18+';
  if (c === 'TV-16' || c === '16' || c === '15') return '16+';
  return '13+';
}

export function mapTmdbItem(
  raw: any,
  kind: MediaType,
  cert?: string | null
): MediaItem {
  const type: MediaType = kind;
  const year =
    raw?.release_date || raw?.first_air_date
      ? new Date(raw.release_date || raw.first_air_date).getFullYear()
      : new Date().getFullYear();
  const title = raw?.title || raw?.name || 'Untitled';
  const poster = raw?.poster_path ? `${IMG}/w500${raw.poster_path}` : undefined;
  const backdrop = raw?.backdrop_path
    ? `${IMG}/w1280${raw.backdrop_path}`
    : undefined;

  return {
    id: `${type}-${raw.id}`,
    tmdbId: raw.id,
    title,
    originalTitle: raw?.original_title || raw?.original_name,
    type,
    releaseYear: Number.isFinite(year) ? year : new Date().getFullYear(),
    seasonsCount: raw?.number_of_seasons,
    duration: raw?.runtime
      ? `${Math.floor(raw.runtime / 60)}h ${raw.runtime % 60}m`
      : undefined,
    rating: mapTmdbRating(cert),
    matchScore: Math.round((raw?.vote_average ?? 7) * 10),
    overview: raw?.overview || `Watch ${title} on Rellix.`,
    backdropUrl:
      backdrop || poster || 'https://picsum.photos/seed/movie/1280/720',
    posterUrl:
      poster || backdrop || 'https://picsum.photos/seed/movie/500/750',
    genres: [],
    cast: [],
    isTrending: raw?.vote_average >= 7,
    isNewRelease: year >= new Date().getFullYear() - 1,
  };
}

const GENRE_ID_NAME: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

export function genreNames(ids: number[] | undefined): string[] {
  if (!ids) return [];
  return ids.map((id) => GENRE_ID_NAME[id] || 'Cinema');
}

// ISO 639-1 -> English name. Used only when TMDB omits `original_language_name`.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', ja: 'Japanese', ko: 'Korean', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
  ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', bn: 'Bengali', pa: 'Punjabi', gu: 'Gujarati',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
  zh: 'Chinese', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', tl: 'Tagalog',
  ar: 'Arabic', tr: 'Turkish', pl: 'Polish', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', fi: 'Finnish', cs: 'Czech', hu: 'Hungarian', el: 'Greek', ro: 'Romanian',
  uk: 'Ukrainian', he: 'Hebrew', fa: 'Persian', ur: 'Urdu', bn_in: 'Bengali',
};

export async function getTrending(
  kind: MediaType,
  page = 1
): Promise<{
  items: MediaItem[];
  hasMore: boolean;
  page: number;
  degraded?: boolean;
}> {
  const isAnime = kind === 'anime';
  const tmdbKind = kind === 'tv' || isAnime ? 'tv' : 'movie';
  const path = isAnime ? '/discover/tv' : `/trending/${tmdbKind}/week`;
  const params: Record<string, string> = isAnime
    ? {
        page: String(page),
        with_genres: '16',
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
        without_keywords: ADULT_ANIME_KEYWORDS,
      }
    : { page: String(page) };

  const data = await tmdbCached<TmdbListResult>(path, params);
  if (!data?.results?.length) {
    // `degraded` tells the caller this is the static fallback shape, not live
    // TMDB data, so the home feed can retry instead of pretending it is fresh.
    return {
      items: localFallback(kind, page),
      hasMore: page < 3,
      page,
      degraded: true,
    };
  }
  const items = data.results.map((r) => ({
    ...mapTmdbItem(r, kind),
    genres: genreNames(r.genre_ids),
  }));
  return {
    items: await withCertifications(items),
    hasMore: page < (data.total_pages || 1) && page < 20,
    page,
  };
}

/**
 * How a raw TMDB result maps to our MediaType.
 *
 * The app's definition of anime mirrors getTrending's: TV that is
 * Japanese-original. Genre 16 alone would misclassify western animation
 * (Family Guy, Avatar); original_language 'ja' is the spine.
 */
function tmdbKindForSearch(r: any): MediaType {
  if (r.media_type !== 'tv') return 'movie';
  if (r.original_language === 'ja') return 'anime';
  return 'tv';
}

export async function searchMedia(
  q: string,
  page = 1
): Promise<{ results: MediaItem[]; hasMore: boolean; page: number }> {
  // Local hits ranked by the shared fuzzy scorer (title + overview + cast +
  // genre), not by raw substring — "bhoot" must surface "Bhooth Bangla" here
  // too when it exists in the static catalog.
  const localMatches = ALL_MEDIA.map((item) => ({ item, s: searchRankScore(item, q) }))
    .filter((entry) => entry.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 24)
    .map((entry) => entry.item);

  const mapResults = (data: TmdbListResult | null): MediaItem[] =>
    (data?.results ?? [])
      .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r: any) => ({
        ...mapTmdbItem(r, tmdbKindForSearch(r)),
        genres: genreNames(r.genre_ids),
      }));

  const mergeUnique = (groups: MediaItem[][]): MediaItem[] => {
    const seen = new Set<string>();
    const out: MediaItem[] = [];
    for (const group of groups) {
      for (const item of group) {
        const key = item.tmdbId ? `t${item.tmdbId}` : item.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };

  const data = await tmdbCached<TmdbListResult>('/search/multi', {
    query: q,
    page: String(page),
    include_adult: 'false',
  });
  let results = mergeUnique([localMatches, mapResults(data)]);

  /**
   * Rescue path, page 1 only.
   *
   * TMDB's search is near-exact, so a misspelled or slightly-short query
   * ("bhoot bangla" for "Bhooth Bangla") can come back with zero hits while the
   * title clearly exists. When the exact phrase barely matched, retry
   * progressively narrower queries and merge everything that came back. The
   * merged set is then ranked against the ORIGINAL query, so the rescued extras
   * sit below the best match instead of drowning it.
   */
  let rescued = false;
  if (page === 1 && results.length < 4) {
    for (const v of variantQueries(q)) {
      const vdata = await tmdbCached<TmdbListResult>('/search/multi', {
        query: v,
        page: '1',
        include_adult: 'false',
      });
      const merged = mergeUnique([results, mapResults(vdata)]);
      if (merged.length > results.length) {
        results = merged;
        rescued = true;
      }
      if (results.length >= 12) break;
    }
  }

  // Rank so the closest title match leads. searchRankScore is 0 for items that
  // match only by cast/genre or not at all, and ties fall back to the incoming
  // order (i) — meaning TMDB's own popularity order is preserved whenever the
  // title score alone cannot discriminate.
  const ranked = results
    .map((item, i) => ({ item, i, s: searchRankScore(item, q) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((entry) => entry.item);

  // A rescue merges page 1 of several queries; deeper pages would mix disjoint
  // result sets, so the feed deliberately ends there.
  const totalPages = data?.total_pages ?? 1;
  const hasMore = !rescued && page < totalPages && page < 10;
  return { results: await withCertifications(ranked), hasMore, page };
}

/**
 * Lightweight autocomplete feed for the search input.
 *
 * Deliberately cheap: page 1 of /search/multi only — the SAME cached entry the
 * full search page 1 uses, so typing up to a title and clicking a suggestion
 * never costs a second TMDB request — no certifications, no variants. Ranks by
 * the shared scorer so the actually-typed title leads.
 */
export async function searchSuggestions(
  q: string,
  max = 8
): Promise<MediaItem[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const data = await tmdbCached<TmdbListResult>('/search/multi', {
    query,
    page: '1',
    include_adult: 'false',
  });
  if (!data?.results?.length) return [];

  const seen = new Set<string>();
  const mapped: MediaItem[] = [];
  for (const r of data.results) {
    if (r.media_type !== 'movie' && r.media_type !== 'tv') continue;
    const key = `t${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push({
      ...mapTmdbItem(r, tmdbKindForSearch(r)),
      genres: genreNames(r.genre_ids),
    });
  }

  const ranked = mapped
    .map((item, i) => ({ item, i, s: searchRankScore(item, query) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((entry) => entry.item);

  // Small thumbnails do not need the w500 poster.
  return ranked
    .slice(0, max)
    .map((item) =>
      item.posterUrl
        ? { ...item, posterUrl: item.posterUrl.replace('/w500', '/w154') }
        : item
    );
}

export async function getDetails(
  tmdbId: number,
  kind: 'movie' | 'tv'
): Promise<MediaItem | null> {
  const data = await tmdbCached<any>(`/${kind}/${tmdbId}`, {
    append_to_response: 'videos,credits,release_dates,content_ratings',
  });
  if (!data) return null;

  let cert: string | null = null;
  if (kind === 'movie') {
    cert =
      data?.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'US')
        ?.release_dates?.[0]?.certification || null;
  } else {
    cert =
      data?.content_ratings?.results?.find((r: any) => r.iso_3166_1 === 'US')
        ?.rating || null;
  }

  const videos: TmdbVideo[] = data?.videos?.results || [];
  const trailer =
    videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
    videos.find((v) => v.site === 'YouTube');

  const item = mapTmdbItem(data, kind, cert);
  item.genres = (data.genres || []).map((g: any) => g.name);
  item.cast = (data?.credits?.cast || []).slice(0, 8).map((c: any) => c.name);
  item.youtubeTrailerId = trailer?.key;

  // Real language / release facts, so the details view can stop inventing them.
  item.originalLanguage =
    data?.original_language_name ||
    (data?.original_language
      ? LANGUAGE_NAMES[data.original_language] ?? data.original_language
      : undefined);
  item.spokenLanguages = (data?.spoken_languages || [])
    .map((l: any) => l.english_name || l.name)
    .filter(Boolean)
    .slice(0, 8);
  item.releaseDate = data?.release_date || data?.first_air_date || undefined;
  item.status = data?.status || undefined;
  if (data?.tagline) item.tagline = data.tagline;
  if (data?.seasons?.length) {
    item.seasons = data.seasons
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
        episodes: [],
      }));
    item.seasonsCount = item.seasons?.length ?? item.seasonsCount;
  }
  return item;
}

export async function getSeasonEpisodes(tmdbId: number, season: number) {
  const data = await tmdbCached<any>(`/tv/${tmdbId}/season/${season}`);
  if (!data?.episodes) return null;
  return data.episodes.map((e: any) => ({
    id: `e${tmdbId}-s${season}-e${e.episode_number}`,
    seasonNumber: season,
    episodeNumber: e.episode_number,
    title: e.name,
    duration: e.runtime ? `${e.runtime}m` : '—',
    overview: e.overview || '',
    stillUrl: e.still_path ? `${IMG}/w500${e.still_path}` : '',
  }));
}

function localFallback(kind: MediaType, page: number): MediaItem[] {
  const base =
    kind === 'anime'
      ? POPULAR_ANIME
      : kind === 'tv'
        ? [...TOP_10_SHOWS, ...ACCLAIMED_TV_SHOWS]
        : LATEST_MOVIES;
  if (page === 1) return base;
  return [];
}

export type RailCategory =
  | 'top_rated_movies'
  | 'hollywood_movies'
  | 'bollywood_movies'
  | 'latest_anime'
  | 'top_rated_anime'
  | 'top_rated_tv'
  | 'hollywood_tv'
  | 'indian_tv'
  | 'anime_airing'
  | 'anime_completed'
  | 'anime_new_episodes';

export async function getCategory(
  category: RailCategory,
  page = 1
): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const yearAgo = new Date().getFullYear() - 1;
  switch (category) {
    case 'top_rated_movies': {
      const d = await tmdbCached<TmdbListResult>('/discover/movie', {
        page: String(page),
        sort_by: 'vote_average.desc',
        'vote_count.gte': '200',
        'primary_release_date.gte': `${yearAgo}-01-01`,
      });
      return finish(d, 'movie', page);
    }
    case 'hollywood_movies': {
      const d = await tmdbCached<TmdbListResult>('/discover/movie', {
        page: String(page),
        with_original_language: 'en',
        sort_by: 'vote_average.desc',
        'vote_count.gte': '50',
        'primary_release_date.gte': new Date(Date.now() - 180 * 864e5)
          .toISOString()
          .slice(0, 10),
      });
      return finish(d, 'movie', page);
    }
    case 'bollywood_movies': {
      const d = await tmdbCached<TmdbListResult>('/discover/movie', {
        page: String(page),
        with_original_language: 'hi',
        sort_by: 'vote_average.desc',
        'vote_count.gte': '30',
        'primary_release_date.gte': new Date(Date.now() - 365 * 864e5)
          .toISOString()
          .slice(0, 10),
      });
      return finish(d, 'movie', page);
    }
    case 'latest_anime': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        with_genres: '16',
        without_keywords: ADULT_ANIME_KEYWORDS,
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
      });
      return finish(d, 'anime', page);
    }
    case 'top_rated_anime': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        with_genres: '16',
        without_keywords: ADULT_ANIME_KEYWORDS,
        with_original_language: 'ja',
        sort_by: 'vote_average.desc',
        'vote_count.gte': '100',
      });
      return finish(d, 'anime', page);
    }
    case 'anime_airing': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        with_genres: '16',
        without_keywords: ADULT_ANIME_KEYWORDS,
        with_original_language: 'ja',
        with_status: '0',
        sort_by: 'popularity.desc',
      });
      return finish(d, 'anime', page);
    }
    case 'anime_completed': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        with_genres: '16',
        without_keywords: ADULT_ANIME_KEYWORDS,
        with_original_language: 'ja',
        with_status: '3',
        sort_by: 'popularity.desc',
      });
      return finish(d, 'anime', page);
    }
    case 'anime_new_episodes': {
      const d = await tmdbCached<TmdbListResult>('/tv/airing_today', {
        page: String(page),
      });
      if (!d?.results?.length) return { items: [], hasMore: false };
      // Match the app's anime definition everywhere else: Japanese-original
      // animation. `/tv/airing_today` does not return keywords, so the adult
      // keyword list cannot be applied here; TMDB's own adult flag and a final
      // 18+ certification filter are the safeguards available on this endpoint.
      const items = d.results
        .filter(
          (r) =>
            (r.genre_ids || []).includes(16) &&
            r.original_language === 'ja' &&
            !r.adult
        )
        .map((r) => ({ ...mapTmdbItem(r, 'anime'), genres: genreNames(r.genre_ids) }));
      const hydrated = await withCertifications(items);
      return {
        items: hydrated.filter((item) => item.rating !== '18+'),
        hasMore: page < (d.total_pages || 1) && page < 20,
      };
    }
    case 'top_rated_tv': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        sort_by: 'vote_average.desc',
        'vote_count.gte': '200',
        'first_air_date.gte': `${yearAgo}-01-01`,
      });
      return finish(d, 'tv', page);
    }
    case 'hollywood_tv': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        with_original_language: 'en',
        sort_by: 'vote_average.desc',
        'vote_count.gte': '100',
        'first_air_date.gte': new Date(Date.now() - 365 * 4 * 864e5)
          .toISOString()
          .slice(0, 10),
      });
      return finish(d, 'tv', page);
    }
    case 'indian_tv': {
      const d = await tmdbCached<TmdbListResult>('/discover/tv', {
        page: String(page),
        with_original_language: 'hi',
        sort_by: 'popularity.desc',
      });
      return finish(d, 'tv', page);
    }
  }
}

function finish(d: TmdbListResult | null, kind: MediaType, page: number) {
  if (!d?.results?.length) return { items: [], hasMore: false };
  return withCertifications(
    d.results.map((r) => ({ ...mapTmdbItem(r, kind), genres: genreNames(r.genre_ids) }))
  ).then((items) => ({
    items,
    hasMore: page < (d.total_pages || 1) && page < 20,
  }));
}

export async function getTrendingNow(
  page = 1
): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const d = await tmdbCached<TmdbListResult>('/trending/all/day', {
    page: String(page),
  });
  if (!d?.results?.length) return { items: [], hasMore: false };
  const items = d.results
    .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r: any) => ({
      ...mapTmdbItem(r, r.media_type === 'tv' ? 'tv' : 'movie'),
      genres: genreNames(r.genre_ids),
    }));
  return {
    items: await withCertifications(items),
    hasMore: page < (d.total_pages || 1) && page < 20,
  };
}

export async function getRecommendations(
  tmdbId: number,
  kind: 'movie' | 'tv',
  page = 1
): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const d = await tmdbCached<TmdbListResult>(
    `/${kind}/${tmdbId}/recommendations`,
    { page: String(page) }
  );
  if (!d?.results?.length) return { items: [], hasMore: false };
  const items = d.results.map((r) => ({
    ...mapTmdbItem(r, kind),
    genres: genreNames(r.genre_ids),
  }));
  return {
    items: await withCertifications(items),
    hasMore: page < (d.total_pages || 1) && page < 10,
  };
}

export interface DiscoverFilters {
  type: 'movie' | 'tv' | 'anime';
  sort: 'popular' | 'top_rated' | 'newest';
  genreId?: string;
  year?: string;
  language?: string;
  country?: string;
  rating?: 'ALL' | '7+' | '13+' | '16+' | '18+';
  status?: 'airing' | 'completed' | 'upcoming' | '';
  adult?: boolean;
}

export async function discover(
  filters: DiscoverFilters,
  page = 1
): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const isAnime = filters.type === 'anime';
  const tmdbKind = filters.type === 'movie' ? 'movie' : 'tv';

  const params: Record<string, string> = { page: String(page) };
  params.include_adult = filters.adult ? 'true' : 'false';

  if (filters.status) {
    const statusMap: Record<string, string> = {
      airing: '0',
      upcoming: '1',
      completed: '3',
    };
    params.with_status = statusMap[filters.status];
  }

  if (isAnime) {
    params.with_genres = filters.genreId ? `16,${filters.genreId}` : '16';
    params.with_original_language = filters.language || 'ja';
    if (!filters.adult) params.without_keywords = ADULT_ANIME_KEYWORDS;
  } else if (filters.genreId) {
    params.with_genres = filters.genreId;
  }

  if (!isAnime && filters.language) params.with_original_language = filters.language;

  // Callers pass comma-joined genre lists (TVShowsTab sends '16,10759' for its
  // Action genre), so the Animation exclusion has to test membership rather than
  // compare the whole string to '16'.
  const requestedGenres = (filters.genreId || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  if (filters.type === 'tv' && !requestedGenres.includes('16')) {
    params.without_genres = '16';
  }
  if (filters.country) params.with_origin_country = filters.country;

  if (filters.sort === 'top_rated') {
    params.sort_by = 'vote_average.desc';
    params['vote_count.gte'] = '100';
  } else if (filters.sort === 'newest') {
    params.sort_by =
      tmdbKind === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
    if (tmdbKind === 'movie') {
      params['primary_release_date.lte'] = new Date().toISOString().slice(0, 10);
    } else {
      params['first_air_date.lte'] = new Date().toISOString().slice(0, 10);
    }
  } else {
    params.sort_by = 'popularity.desc';
  }

  if (filters.year) {
    if (tmdbKind === 'movie') params.primary_release_year = filters.year;
    else params.first_air_date_year = filters.year;
  }

  if (filters.rating) {
    // TMDB's certification filters take ONE ceiling value per country, in that
    // country's own ladder. A comma-joined list (`G,PG,PG-13`) is silently
    // ignored, which is why a "7+" filter used to return the same adult
    // popularity list as no filter at all. Movie and TV have separate ladders:
    //   movies  G -> PG -> PG-13 -> R
    //   TV      TV-Y -> TV-Y7 -> TV-G -> TV-PG -> TV-14 -> TV-MA
    // 18+ is the whole catalogue here; include_adult stays false.
    const movieCeilings: Record<string, string> = {
      ALL: 'G',
      '7+': 'PG',
      '13+': 'PG-13',
      '16+': 'R',
    };
    const tvCeilings: Record<string, string> = {
      ALL: 'TV-Y7',
      '7+': 'TV-PG',
      '13+': 'TV-14',
      '16+': 'TV-MA',
    };
    const ceiling =
      tmdbKind === 'movie' ? movieCeilings[filters.rating] : tvCeilings[filters.rating];
    if (ceiling) {
      params.certification_country = 'US';
      params['certification.lte'] = ceiling;
    }
  }

  const d = await tmdbCached<TmdbListResult>(`/discover/${tmdbKind}`, params);
  const kind: MediaType = isAnime ? 'anime' : tmdbKind;
  if (!d?.results?.length) return { items: [], hasMore: false };
  return {
    items: await withCertifications(
      d.results.map((r) => ({ ...mapTmdbItem(r, kind), genres: genreNames(r.genre_ids) }))
    ),
    hasMore: page < (d.total_pages || 1) && page < 20,
  };
}

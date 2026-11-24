/**
 * The `/api/media/*` replacement.
 *
 * The app was written against seven read-only JSON routes. Rather than rewrite
 * every component's query building, abort handling and `res.ok` checks, this
 * module answers the same URLs with the same payload shapes and returns a real
 * `Response`. Components only change `fetch(...)` to `mediaFetch(...)`.
 *
 * Nothing here touches the network except TMDB, via `lib/client-tmdb.ts`.
 */

import type { MediaItem, MediaType } from '@/types/movie';
import {
  ALL_MEDIA,
  LATEST_MOVIES,
  POPULAR_ANIME,
  ACCLAIMED_TV_SHOWS,
  TOP_10_SHOWS,
} from './movies-data';
import {
  discover,
  getCategory,
  getDetails,
  getRecommendations,
  getSeasonEpisodes,
  getTrending,
  getTrendingNow,
  searchMedia,
  searchSuggestions,
  type RailCategory,
} from './client-tmdb';
import { filterKidPayload, isKidMode } from './kid-safe';

interface LatestFeed {
  movies: MediaItem[];
  tv: MediaItem[];
  anime: MediaItem[];
  degraded: boolean;
}

const STATIC = {
  movies: LATEST_MOVIES,
  tv: ACCLAIMED_TV_SHOWS,
  anime: POPULAR_ANIME,
};

async function collectLatest(): Promise<LatestFeed> {
  const [movies, tv, anime] = await Promise.all([
    getTrending('movie', 1),
    getTrending('tv', 1),
    getTrending('anime', 1),
  ]);

  return {
    movies: movies.items.length > 0 ? movies.items : STATIC.movies,
    tv: tv.items.length > 0 ? tv.items : STATIC.tv,
    anime: anime.items.length > 0 ? anime.items : STATIC.anime,
    degraded: Boolean(movies.degraded || tv.degraded || anime.degraded),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Same contract as the old route: retry once around a degraded response, and
 * mark the payload so the home screen can schedule its own retry rather than
 * freezing on the static catalogue.
 */
async function latestFeed(): Promise<LatestFeed> {
  let feed = await collectLatest();
  if (feed.degraded) {
    await sleep(800);
    const second = await collectLatest();
    if (!second.degraded) feed = second;
  }
  return feed;
}

interface RouteResult {
  body: unknown;
  status: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function intParam(value: string | null, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function route(url: URL): Promise<RouteResult> {
  const path = url.pathname.replace(/\/+$/, '');
  const sp = url.searchParams;

  switch (path) {
    case '/api/media/latest':
      return { body: await latestFeed(), status: 200 };

    case '/api/media/suggest': {
      const items = await searchSuggestions(sp.get('q') ?? '');
      return { body: { items }, status: 200 };
    }

    case '/api/media/search': {
      const q = sp.get('q')?.trim();
      const page = intParam(sp.get('page'), 1);
      if (!q) {
        return {
          body: { results: ALL_MEDIA.slice(0, 20), hasMore: false, page: 1 },
          status: 200,
        };
      }
      const data = await searchMedia(q, page);
      return {
        body: { results: data.results, hasMore: data.hasMore, page: data.page },
        status: 200,
      };
    }

    case '/api/media/discover': {
      const type = (sp.get('type') || 'movie') as 'movie' | 'tv' | 'anime';
      const sort = (sp.get('sort') || 'popular') as
        | 'popular'
        | 'top_rated'
        | 'newest';
      const page = intParam(sp.get('page'), 1);
      const data = await discover(
        {
          type,
          sort,
          genreId: sp.get('genre') || undefined,
          year: sp.get('year') || undefined,
          language: sp.get('lang') || undefined,
          country: sp.get('country') || undefined,
          // A kids profile gets the ceiling pushed up to TMDB instead of
          // filtering a page of 20 adult titles down to two. This also makes
          // "Load More" useful: every page is already kid-safe.
          rating: isKidMode() ? '7+' : (sp.get('rating') as any) || undefined,
          status: (sp.get('status') as any) || '',
          adult: sp.get('adult') === 'true',
        },
        page
      );
      return {
        body: { items: data.items, page, hasMore: data.hasMore },
        status: 200,
      };
    }

    case '/api/media/browse': {
      const type = (sp.get('type') || 'movie') as MediaType;
      const page = intParam(sp.get('page'), 1);
      const category = sp.get('category') as
        | RailCategory
        | 'trending_now'
        | null;
      const genre = sp.get('genre');
      const country = sp.get('country');
      const sort = sp.get('sort');

      if (!category && (genre || country || sort)) {
        const data = await discover(
          {
            type,
            sort: (sort === 'top_rated' || sort === 'newest'
              ? sort
              : 'popular') as 'popular' | 'top_rated' | 'newest',
            genreId: genre || undefined,
            country: country || undefined,
            rating: isKidMode() ? '7+' : undefined,
          },
          page
        );
        if (data.items.length > 0) {
          return {
            body: {
              items: data.items,
              page,
              hasMore: data.hasMore,
              total: data.items.length * (data.hasMore ? 2 : 1),
            },
            status: 200,
          };
        }
        // Thin catalogue (smaller regions especially): fall through to trending
        // so the rail renders content instead of a permanent empty gap.
      }

      if (category === 'trending_now') {
        const data = await getTrendingNow(page);
        return {
          body: {
            items: data.items,
            page,
            hasMore: data.hasMore,
            total: data.items.length,
          },
          status: 200,
        };
      }

      if (category) {
        const data = await getCategory(category, page);
        return {
          body: {
            items: data.items,
            page,
            hasMore: data.hasMore,
            total: data.items.length * (data.hasMore ? 2 : 1),
          },
          status: 200,
        };
      }

      const data = await getTrending(type, page);
      if (data.items.length > 0) {
        return {
          body: {
            items: data.items,
            page: data.page,
            hasMore: data.hasMore,
            total: data.items.length * (data.hasMore ? 2 : 1),
          },
          status: 200,
        };
      }

      const basePool =
        type === 'anime'
          ? POPULAR_ANIME
          : type === 'tv'
            ? [...TOP_10_SHOWS, ...ACCLAIMED_TV_SHOWS]
            : LATEST_MOVIES;

      return {
        body: {
          items: page === 1 ? basePool : [],
          page,
          hasMore: false,
          total: basePool.length,
        },
        status: 200,
      };
    }

    case '/api/media/details': {
      const typeParam = sp.get('type') || 'movie';
      const idStr = sp.get('id');
      const season = sp.get('season');

      if (!idStr) {
        return { body: { error: 'Missing id parameter' }, status: 400 };
      }

      const tmdbId = parseInt(idStr, 10);

      if (
        season &&
        (typeParam === 'tv' || typeParam === 'anime') &&
        Number.isFinite(tmdbId)
      ) {
        const episodes = await getSeasonEpisodes(tmdbId, parseInt(season, 10));
        if (episodes) return { body: { episodes }, status: 200 };
      }

      const local = ALL_MEDIA.find((m) => m.tmdbId === tmdbId || m.id === idStr);
      if (local) {
        if (local.tmdbId) {
          const live = await getDetails(
            local.tmdbId,
            local.type === 'movie' ? 'movie' : 'tv'
          );
          if (live) return { body: { ...local, ...live, id: local.id }, status: 200 };
        }
        return { body: local, status: 200 };
      }

      if (Number.isFinite(tmdbId)) {
        const kind = typeParam === 'tv' || typeParam === 'anime' ? 'tv' : 'movie';
        const live = await getDetails(tmdbId, kind);
        if (live) return { body: live, status: 200 };
      }

      return { body: { error: 'Not found' }, status: 404 };
    }

    case '/api/media/recommendations': {
      const id = parseInt(sp.get('id') || '', 10);
      const type =
        sp.get('type') === 'tv' || sp.get('type') === 'anime' ? 'tv' : 'movie';
      const page = intParam(sp.get('page'), 1);

      if (!Number.isFinite(id)) {
        return { body: { error: 'Missing id parameter' }, status: 400 };
      }

      const data = await getRecommendations(id, type, page);
      return {
        body: { items: data.items, page, hasMore: data.hasMore },
        status: 200,
      };
    }

    default:
      return { body: { error: 'Not found' }, status: 404 };
  }
}

/**
 * Drop-in replacement for `fetch('/api/media/...')`.
 *
 * Honours `AbortSignal` at the boundaries, which is what the existing
 * `useEffect` cleanups rely on: an aborted call rejects with an `AbortError`
 * exactly like a cancelled network request, and callers already catch it.
 */
export async function mediaFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const signal = init?.signal ?? undefined;
  if (signal?.aborted) throw abortError();

  const base =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(input, base);

  try {
    const result = await route(url);
    if (signal?.aborted) throw abortError();
    // Kid mode is enforced here, at the catalogue boundary, so no screen can
    // forget to filter. Individual components may still filter their own
    // pre-fetched state (the home screen does), but this is the backstop.
    return json(filterKidPayload(result.body), result.status);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // Mirror the old route behaviour: an upstream failure is a real error
    // response, not a fabricated empty catalogue.
    return json({ error: 'upstream_failed' }, 502);
  }
}

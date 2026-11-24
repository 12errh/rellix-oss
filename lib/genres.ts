/**
 * Canonical genre and region tables.
 *
 * Single source of truth for both sides of the wire:
 *   - server: lib/tmdb.ts maps TMDB genre_ids -> names when listing rows
 *   - client: lib/home-rails.ts builds rails from a genre, and lib/taste.ts
 *     turns the viewer's liked/watched genres back into ids for a rail query
 *
 * Previously lib/tmdb.ts owned this list privately, which meant the client
 * could not name a genre it wanted to build a rail from.
 */

export interface GenreDef {
  id: number;
  name: string;
  /** Movies and TV use different ids for the same concept. */
  movie?: number;
  tv?: number;
  anime?: number;
}

export const GENRES: GenreDef[] = [
  // Shared ids (same numeric id for movie and tv)
  { id: 28, name: 'Action', movie: 28, tv: 10759 },
  { id: 12, name: 'Adventure', movie: 12, tv: 10759 },
  { id: 16, name: 'Animation', movie: 16, tv: 16 },
  { id: 35, name: 'Comedy', movie: 35, tv: 35 },
  { id: 80, name: 'Crime', movie: 80, tv: 80 },
  { id: 99, name: 'Documentary', movie: 99, tv: 99 },
  { id: 18, name: 'Drama', movie: 18, tv: 18 },
  { id: 10751, name: 'Family', movie: 10751, tv: 10751 },
  { id: 14, name: 'Fantasy', movie: 14, tv: 10765 },
  { id: 27, name: 'Horror', movie: 27, tv: 27 },
  { id: 36, name: 'History', movie: 36, tv: 36 },
  { id: 9648, name: 'Mystery', movie: 9648, tv: 9648 },
  { id: 10749, name: 'Romance', movie: 10749, tv: 10749 },
  { id: 878, name: 'Sci-Fi', movie: 878, tv: 10765 },
  { id: 53, name: 'Thriller', movie: 53, tv: 53 },
  { id: 37, name: 'Western', movie: 37, tv: 37 },
  { id: 10752, name: 'War', movie: 10752, tv: 10768 },
  { id: 10762, name: 'Kids', movie: 10751, tv: 10762 },
  { id: 10764, name: 'Reality', tv: 10764 },
];

export const GENRE_BY_NAME: Map<string, GenreDef> = new Map(GENRES.map((g) => [g.name, g]));

/** TMDB genre id -> display name, for mapping list responses. */
export const GENRE_ID_TO_NAME: Record<number, string> = (() => {
  const map: Record<number, string> = {};
  for (const g of GENRES) {
    // First definition wins so shared ids keep their movie-flavoured name.
    if (map[g.id] === undefined) map[g.id] = g.name;
    if (g.movie !== undefined && map[g.movie] === undefined) map[g.movie] = g.name;
    if (g.tv !== undefined && map[g.tv] === undefined) map[g.tv] = g.name;
  }
  return map;
})();

/** Resolve a display genre name to the TMDB id for a given media type. */
export function genreIdFor(name: string, type: 'movie' | 'tv' | 'anime'): number | null {
  const g = GENRE_BY_NAME.get(name);
  if (!g) return null;
  if (type === 'movie') return g.movie ?? g.id;
  if (type === 'anime') return g.anime ?? g.tv ?? g.movie ?? g.id;
  return g.tv ?? g.id;
}

export interface RegionDef {
  code: string;
  label: string;
  /** Short label used for compact row headings. */
  short: string;
}

/**
 * Regions with rails. Every one of these uses TMDB `with_origin_country`, so no
 * per-region special casing is needed.
 *
 * Deliberately omitted: Turkey, France, Spain, Nigeria. They were considered and
 * not selected, though they work the same way if added here later.
 */
export const REGIONS: RegionDef[] = [
  { code: 'US', label: 'Hollywood', short: 'Hollywood' },
  { code: 'GB', label: 'United Kingdom', short: 'UK' },
  { code: 'IN', label: 'Bollywood & Indian cinema', short: 'Bollywood' },
  { code: 'KR', label: 'K-Drama', short: 'K-Drama' },
  { code: 'JP', label: 'Japanese cinema', short: 'Japan' },
  { code: 'CN', label: 'Chinese cinema', short: 'China' },
];

export const REGION_BY_CODE: Map<string, RegionDef> = new Map(REGIONS.map((r) => [r.code, r]));

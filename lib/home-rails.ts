import { MediaType } from '@/types/movie';
import type { RailCategory } from '@/lib/client-tmdb';
import { REGIONS, genreIdFor } from '@/lib/genres';

/**
 * Home-screen rail registry.
 *
 * The home page used to hand-write ~14 <MediaRail> elements, each paired with a
 * `case` in lib/tmdb.ts#getCategory. Covering every genre and region that way
 * means a new `case` per row. A rail is now one entry here and one generic
 * discover query, so extending coverage is a config change.
 */

export type RailSectionId = 'for-you' | 'trending' | 'genre-movies' | 'genre-tv' | 'region';

export type RailSort = 'popular' | 'top_rated' | 'newest';

export interface HomeRail {
  id: string;
  title: string;
  section: RailSectionId;
  type: MediaType;
  /** TMDB genre id, already resolved for this media type. */
  genreId?: number;
  /** TMDB ISO 3166-1 country code, for with_origin_country. */
  country?: string;
  sort?: RailSort;
  /** Bypasses the named-category rail and queries discover directly. */
  direct?: boolean;
  /** Full endpoint override, for rows that are not discover-shaped. */
  apiPath?: string;
  /**
   * Named category in lib/tmdb.ts#getCategory. Tuned queries (vote floors,
   * release windows) that a generic discover call would lose, so these keep
   * their existing behaviour rather than being re-expressed as filters.
   */
  category?: RailCategory;
}

export interface HomeSection {
  id: RailSectionId;
  title: string;
  subtitle?: string;
  /** Sections with more rails than this render a "Show all" control. */
  collapsible?: boolean;
  defaultVisible?: number;
}

export const DEFAULT_VISIBLE_RAILS = 4;

/**
 * Section metadata.
 *
 * `for-you` has no heading of its own in the UI — its rows are titled by what
 * they are ("Because You Watched X"), so a "For You" banner above them would be
 * noise. The section exists so those rows sort ahead of everything curated.
 */
export const SECTIONS: HomeSection[] = [
  { id: 'for-you', title: 'For You' },
  { id: 'trending', title: 'Trending & Top', subtitle: 'What everyone is watching' },
  { id: 'genre-movies', title: 'Browse by Genre — Movies', collapsible: true },
  { id: 'genre-tv', title: 'Browse by Genre — TV & Anime', collapsible: true },
  { id: 'region', title: 'Browse by Region', collapsible: true },
];

function movieGenreRails(): HomeRail[] {
  const wanted = [
    'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Drama', 'Fantasy',
    'Family', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Documentary',
    'History', 'Western', 'War',
  ];
  return wanted.flatMap((name) => {
    const id = genreIdFor(name, 'movie');
    return id === null ? [] : [{ id: `movie-genre-${id}`, title: name, section: 'genre-movies' as const, type: 'movie' as const, genreId: id, sort: 'popular' as const, direct: true }];
  });
}

function tvGenreRails(): HomeRail[] {
  const wanted = ['Action & Adventure', 'Drama', 'Sci-Fi & Fantasy', 'Crime', 'Comedy', 'Animation'];
  // TMDB labels the TV genre "Sci-Fi & Fantasy" and "Action & Adventure"; map
  // them onto the shared table by their canonical names.
  const alias: Record<string, string> = {
    'Action & Adventure': 'Action',
    Drama: 'Drama',
    'Sci-Fi & Fantasy': 'Sci-Fi',
    Crime: 'Crime',
    Comedy: 'Comedy',
    Animation: 'Animation',
  };
  const titles: Record<string, string> = {
    'Action & Adventure': 'Action & Adventure',
    Drama: 'TV Drama',
    'Sci-Fi & Fantasy': 'Sci-Fi & Fantasy',
    Crime: 'Crime',
    Comedy: 'Comedy',
    Animation: 'Animation',
  };
  return wanted.flatMap((key) => {
    const id = genreIdFor(alias[key], 'tv');
    return id === null ? [] : [{ id: `tv-genre-${id}`, title: titles[key], section: 'genre-tv' as const, type: 'tv' as const, genreId: id, sort: 'popular' as const, direct: true }];
  });
}

function regionRails(): HomeRail[] {
  return REGIONS.flatMap((r) => {
    // Region rails deliberately use popularity with no vote floor: TMDB's
    // coverage for individual countries is thin, and a `vote_average.desc` sort
    // with a vote_count minimum returns an empty row for smaller catalogues.
    const rows: HomeRail[] = [
      {
        id: `region-movie-${r.code}`,
        title: `${r.short} movies`,
        section: 'region',
        type: 'movie',
        country: r.code,
        sort: 'popular',
        direct: true,
      },
    ];
    if (r.code === 'KR' || r.code === 'JP' || r.code === 'CN') {
      rows.push({
        id: `region-tv-${r.code}`,
        title: `${r.short} shows`,
        section: 'region',
        type: 'tv',
        country: r.code,
        sort: 'popular',
        direct: true,
      });
    }
    return rows;
  });
}

/**
 * Curated rows for the Trending & Top section. These keep using the named
 * category rails in lib/tmdb.ts rather than discover, because those queries are
 * tuned (vote floors, release windows) and already cached.
 */
export function trendingRails(): HomeRail[] {
  return [
    {
      id: 'cat-trending',
      title: 'Trending Now',
      section: 'trending',
      type: 'movie',
      apiPath: '/api/media/browse?category=trending_now',
    },
    { id: 'cat-top-movies', title: 'Top Rated Movies', section: 'trending', type: 'movie', category: 'top_rated_movies' },
    { id: 'cat-top-tv', title: 'Top Rated TV Shows', section: 'trending', type: 'tv', category: 'top_rated_tv' },
    { id: 'cat-anime', title: 'Popular Anime Right Now', section: 'trending', type: 'anime', category: 'latest_anime' },
  ];
}

/** Every rail, grouped into sections, in editorial order. */
export function buildSections(adaptive: HomeRail[] = []): { section: HomeSection; rails: HomeRail[] }[] {
  const all: HomeRail[] = [
    ...adaptive,
    ...trendingRails(),
    ...movieGenreRails(),
    ...tvGenreRails(),
    ...regionRails(),
  ];

  return SECTIONS.map((section) => ({
    section,
    rails: all.filter((r) => r.section === section.id),
  })).filter((s) => s.rails.length > 0);
}

export const BROWSE_PATH = '/api/media/browse';

/**
 * Full URL for a rail, so every row shares one code path.
 *
 * This must include the path. It is handed straight to MediaRail as `query`,
 * which uses it verbatim as the fetch base — returning a bare `type=…` string
 * resolves relative to the current route and 404s every request.
 */
export function railQuery(rail: HomeRail): string {
  if (rail.apiPath) return '';
  const parts = [`type=${rail.type}`];
  if (rail.category) {
    parts.push(`category=${rail.category}`);
  } else if (rail.direct) {
    if (rail.genreId !== undefined) parts.push(`genre=${rail.genreId}`);
    if (rail.country) parts.push(`country=${rail.country}`);
    if (rail.sort) parts.push(`sort=${rail.sort}`);
  }
  return `${BROWSE_PATH}?${parts.join('&')}`;
}

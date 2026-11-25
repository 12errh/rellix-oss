'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { MediaItem } from '@/types/movie';
import { MovieCard } from './MovieCard';
import { usePagedFeed } from '@/hooks/use-paged-feed';
import { LoadMoreSentinel } from './LoadMoreSentinel';
import { BrowseFilterBar, facet } from '@/components/BrowseFilterBar';
import { mediaFetch } from '@/lib/client-media';

interface BrowserTabProps {
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
  /** Kids profiles are already filter-locked upstream; hide controls that imply otherwise. */
  isKid?: boolean;
}

const TYPES: { id: 'movie' | 'tv' | 'anime'; label: string }[] = [
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'anime', label: 'Anime' },
];

const SORTS = [
  { id: 'popular', label: 'Popular' },
  { id: 'top_rated', label: 'Top Rated' },
  { id: 'newest', label: 'Newest' },
] as const;

interface GenreOption {
  id: string;
  label: string;
}

/**
 * TMDB genre ids are per media kind. The old Browse tab handed the movie list
 * to TV and anime queries too, so picking "Action" on TV sent `with_genres=28`,
 * which is not a TV genre: TMDB ignored it and the filter looked broken.
 */
const MOVIE_GENRES: GenreOption[] = [
  { id: '', label: 'All genres' },
  { id: '28', label: 'Action' },
  { id: '12', label: 'Adventure' },
  { id: '16', label: 'Animation' },
  { id: '35', label: 'Comedy' },
  { id: '80', label: 'Crime' },
  { id: '99', label: 'Documentary' },
  { id: '18', label: 'Drama' },
  { id: '10751', label: 'Family' },
  { id: '14', label: 'Fantasy' },
  { id: '36', label: 'History' },
  { id: '27', label: 'Horror' },
  { id: '10402', label: 'Music' },
  { id: '9648', label: 'Mystery' },
  { id: '10749', label: 'Romance' },
  { id: '878', label: 'Sci-Fi' },
  { id: '53', label: 'Thriller' },
  { id: '10752', label: 'War' },
  { id: '37', label: 'Western' },
];

const TV_GENRES: GenreOption[] = [
  { id: '', label: 'All genres' },
  { id: '10759', label: 'Action & Adventure' },
  { id: '16', label: 'Animation' },
  { id: '35', label: 'Comedy' },
  { id: '80', label: 'Crime' },
  { id: '99', label: 'Documentary' },
  { id: '18', label: 'Drama' },
  { id: '10751', label: 'Family' },
  { id: '10762', label: 'Kids' },
  { id: '9648', label: 'Mystery' },
  { id: '10765', label: 'Sci-Fi & Fantasy' },
  { id: '10766', label: 'Soap' },
  { id: '10768', label: 'War & Politics' },
  { id: '37', label: 'Western' },
];

/** Anime queries already force genre 16, so only TV genres that co-occur with it. */
const ANIME_GENRES: GenreOption[] = [
  { id: '', label: 'All genres' },
  { id: '10759', label: 'Action & Adventure' },
  { id: '35', label: 'Comedy' },
  { id: '18', label: 'Drama' },
  { id: '10765', label: 'Sci-Fi & Fantasy' },
  { id: '9648', label: 'Mystery' },
  { id: '10751', label: 'Family' },
  { id: '80', label: 'Crime' },
];

interface PairOption {
  id: string;
  label: string;
}

const LANGS: PairOption[] = [
  { id: '', label: 'Any language' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ko', label: 'Korean' },
  { id: 'ja', label: 'Japanese' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
];

const COUNTRIES: PairOption[] = [
  { id: '', label: 'Any country' },
  { id: 'US', label: 'USA' },
  { id: 'IN', label: 'India' },
  { id: 'KR', label: 'Korea' },
  { id: 'JP', label: 'Japan' },
  { id: 'GB', label: 'UK' },
  { id: 'FR', label: 'France' },
];

const RATINGS: PairOption[] = [
  { id: '', label: 'Any rating' },
  { id: 'ALL', label: 'All ages' },
  { id: '7+', label: '7+' },
  { id: '13+', label: '13+' },
  { id: '16+', label: '16+' },
];

const YEARS = ['', ...Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() - i))];

const GENRES_BY_TYPE: Record<'movie' | 'tv' | 'anime', GenreOption[]> = {
  movie: MOVIE_GENRES,
  tv: TV_GENRES,
  anime: ANIME_GENRES,
};

export function BrowserTab({ onPlay, onOpenDetails, myListIds, onToggleMyList, isKid = false }: BrowserTabProps) {
  const [type, setType] = useState<'movie' | 'tv' | 'anime'>('movie');
  const [sort, setSort] = useState<'popular' | 'top_rated' | 'newest'>('popular');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [lang, setLang] = useState('');
  const [country, setCountry] = useState('');
  const [rating, setRating] = useState('');

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('type', type);
    p.set('sort', sort);
    if (genre) p.set('genre', genre);
    if (year) p.set('year', year);
    if (lang) p.set('lang', lang);
    if (country) p.set('country', country);
    if (rating) p.set('rating', rating);
    return p.toString();
  }, [type, sort, genre, year, lang, country, rating]);

  const fetchPage = useCallback(async (page: number) => {
    const res = await mediaFetch(`/api/media/discover?${queryString}&page=${page}`);
    if (!res.ok) return { items: [], hasMore: false };
    const data = await res.json();
    return { items: data.items || [], hasMore: data.hasMore ?? false };
  }, [queryString]);

  // Root cause of the false "no results" flash: `isLoadingFirst` was never
  // destructured, so the empty-state check was `items.length === 0 &&
  // !isLoadingMore`, which is true *during* the first fetch.
  const { items, hasMore, isLoadingMore, isLoadingFirst, loadMore, sentinelRef } = usePagedFeed(fetchPage, []);

  const hasActiveFilters = !!(genre || year || lang || country || rating || sort !== 'popular' || type !== 'movie');

  const resetAll = () => {
    setType('movie');
    setSort('popular');
    setGenre('');
    setYear('');
    setLang('');
    setCountry('');
    setRating('');
  };

  const changeType = (next: 'movie' | 'tv' | 'anime') => {
    setType(next);
    // Genre ids differ per media kind; keep the selection only if the new list
    // has it. Anime also needs a Japanese original language to be anime at all.
    const stillValid = GENRES_BY_TYPE[next].some((g) => g.id === genre);
    if (!stillValid) setGenre('');
    if (next === 'anime' && lang === '') setLang('ja');
    if (next !== 'anime' && lang === 'ja') setLang('');
  };

  return (
    <div className="select-none pb-12">
      <div className="px-6 pt-8 pb-5 md:px-16">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#E50914]">
          Catalogue
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
          Browse
        </h1>
      </div>

      <div className="sticky top-16 z-30 bg-[#111111]/95 px-6 py-3 backdrop-blur-md md:px-16">
        <BrowseFilterBar
          resultCount={items.length}
          loading={isLoadingFirst}
          showClear={hasActiveFilters}
          onClear={resetAll}
          facets={[
            facet(
              'type',
              'Type',
              TYPES.map((t) => ({ value: t.id, label: t.label })),
              type,
              (v) => changeType(v as 'movie' | 'tv' | 'anime')
            ),
            facet(
              'genre',
              'Genre',
              GENRES_BY_TYPE[type].map((g) => ({ value: g.id, label: g.label })),
              genre,
              setGenre
            ),
            facet(
              'year',
              'Year',
              [
                { value: '', label: 'Any year' },
                ...YEARS.filter(Boolean).map((y) => ({ value: y, label: y })),
              ],
              year,
              setYear
            ),
            facet(
              'sort',
              'Sort',
              SORTS.map((s) => ({ value: s.id, label: s.label })),
              sort,
              (v) => setSort(v as 'popular' | 'top_rated' | 'newest')
            ),
            facet(
              'lang',
              'Language',
              LANGS.map((l) => ({ value: l.id, label: l.label })),
              lang,
              setLang
            ),
            facet(
              'country',
              'Country',
              COUNTRIES.map((c) => ({ value: c.id, label: c.label })),
              country,
              setCountry
            ),
            ...(isKid
              ? []
              : [
                  facet(
                    'rating',
                    'Rating',
                    RATINGS.map((r) => ({ value: r.id, label: r.label })),
                    rating,
                    setRating
                  ),
                ]),
          ]}
        />
      </div>

      <div className="px-6 pt-6 md:px-16">
        {items.length === 0 && isLoadingFirst ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-[3px] bg-[#1b1b1b]" />
            ))}
          </div>
        ) : items.length === 0 && !isLoadingMore ? (
          <div className="border border-white/[0.08] px-6 py-16 text-center">
            <p className="text-base font-medium text-white">No titles match these filters</p>
            <p className="mt-1 text-xs text-[#8a8a8a]">
              Try widening the year, language or rating.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAll}
                className="mt-5 border border-white/20 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white transition-colors hover:border-white/50"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <MovieCard
                variant="grid"
                key={item.id}
                item={item}
                onPlay={onPlay}
                onOpenDetails={onOpenDetails}
                isInMyList={myListIds.includes(item.id)}
                onToggleMyList={onToggleMyList}
              />
            ))}
          </div>
        )}

        <LoadMoreSentinel
          sentinelRef={sentinelRef}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          itemCount={items.length}
        />
      </div>
    </div>
  );
}

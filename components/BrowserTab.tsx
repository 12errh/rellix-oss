'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
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

const GENRES = [
  { id: '', label: 'All Genres' },
  { id: '28', label: 'Action' },
  { id: '35', label: 'Comedy' },
  { id: '18', label: 'Drama' },
  { id: '27', label: 'Horror' },
  { id: '10749', label: 'Romance' },
  { id: '878', label: 'Sci-Fi' },
  { id: '53', label: 'Thriller' },
  { id: '16', label: 'Animation' },
  { id: '99', label: 'Documentary' },
  { id: '10751', label: 'Family' },
  { id: '9648', label: 'Mystery' },
  { id: '80', label: 'Crime' },
];

const LANGS: { id: string; label: string }[] = [
  { id: '', label: 'Any Language' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ko', label: 'Korean' },
  { id: 'ja', label: 'Japanese' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
];

const COUNTRIES: { id: string; label: string }[] = [
  { id: '', label: 'Any Country' },
  { id: 'US', label: 'USA' },
  { id: 'IN', label: 'India' },
  { id: 'KR', label: 'Korea' },
  { id: 'JP', label: 'Japan' },
  { id: 'GB', label: 'UK' },
  { id: 'FR', label: 'France' },
];

const RATINGS = [
  { id: '', label: 'Any Rating' },
  { id: 'ALL', label: 'ALL' },
  { id: '7+', label: '7+' },
  { id: '13+', label: '13+' },
  { id: '16+', label: '16+' },
  { id: '18+', label: '18+' },
];

const YEARS = ['', ...Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() - i))];

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

  return (
    <div className="space-y-6 select-none">
      {/* Sticky Filter Bar — same component as the Movies / TV / Anime tabs */}
      <div className="sticky top-16 z-20 border-b border-white/10 bg-[#111111]/95 px-6 py-4 backdrop-blur-md md:px-16">
        <div className="flex items-center gap-2 pb-3">
          <SlidersHorizontal className="h-4 w-4 text-[#E50914]" />
          <span className="text-xs font-bold uppercase tracking-widest text-white">Browse</span>
        </div>

        <div>
          <BrowseFilterBar
            resultCount={items.length}
            loading={isLoadingFirst}
            totalLabel={hasActiveFilters ? 'filtered' : 'popular right now'}
            showClear={hasActiveFilters}
            onClear={resetAll}
            facets={[
              // Switching type resets the genre list, and defaults anime to
              // Japanese so the results are actually anime.
              facet(
                'type',
                'Type',
                TYPES.map((t) => ({ value: t.id, label: t.label })),
                type,
                (v) => {
                  setType(v as 'movie' | 'tv' | 'anime');
                  setGenre('');
                  if (v === 'anime' && lang === '') setLang('ja');
                  if (v !== 'anime' && lang === 'ja') setLang('');
                },
                true
              ),
              facet(
                'sort',
                'Sort',
                SORTS.map((s) => ({ value: s.id, label: s.label })),
                sort,
                (v) => setSort(v as 'popular' | 'top_rated' | 'newest'),
                true
              ),
            ]}
            advancedFacets={[
              facet(
                'genre',
                'Genre',
                GENRES.map((g) => ({ value: g.id, label: g.label })),
                genre,
                setGenre,
                true
              ),
              facet(
                'year',
                'Year',
                [{ value: '', label: 'Any Year' }, ...YEARS.filter(Boolean).map((y) => ({ value: y, label: y }))],
                year,
                setYear,
                true
              ),
              facet(
                'lang',
                'Language',
                LANGS.map((l) => ({ value: l.id, label: l.label })),
                lang,
                setLang,
                true
              ),
              facet(
                'country',
                'Country',
                COUNTRIES.map((c) => ({ value: c.id, label: c.label })),
                country,
                setCountry,
                true
              ),
              ...(isKid
                ? []
                : [
                    facet(
                      'rating',
                      'Rating',
                      RATINGS.map((r) => ({ value: r.id, label: r.label })),
                      rating,
                      setRating,
                      true
                    ),
                  ]),
            ]}
          />
        </div>
      </div>

      {/* Results */}
      <div className="px-6 md:px-16">
        {items.length === 0 && isLoadingFirst ? (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-[#1f1f1f]" />
            ))}
          </div>
        ) : items.length === 0 && !isLoadingMore ? (
          <div className="py-20 text-center text-[#737373]">
            <p className="text-base font-semibold text-white mb-1">No titles match these filters</p>
            <p className="text-xs">Try widening the year, language, or rating filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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

'use client';

import React, { useState, useCallback } from 'react';
import { Film } from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { MovieCard } from './MovieCard';
import { usePagedFeed } from '@/hooks/use-paged-feed';
import { LoadMoreSentinel } from './LoadMoreSentinel';
import { Top10Row } from './Top10Row';
import { BrowseFilterBar, facet } from '@/components/BrowseFilterBar';
import { mediaFetch } from '@/lib/client-media';

interface MoviesTabProps {
  top10Movies: MediaItem[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
}

export function MoviesTab({
  top10Movies,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
}: MoviesTabProps) {
  const [sort, setSort] = useState<'popular' | 'top_rated' | 'newest'>('popular');
  const [year, setYear] = useState('');
  const [genreId, setGenreId] = useState('');

  const fetchPage = useCallback(async (p: number) => {
    const params = new URLSearchParams({ type: 'movie', sort, page: String(p) });
    if (genreId) params.set('genre', genreId);
    if (year) params.set('year', year);
    const res = await mediaFetch(`/api/media/discover?${params.toString()}`);
    if (!res.ok) return { items: [], hasMore: false };
    const data = await res.json();
    return { items: data.items || [], hasMore: data.hasMore ?? false };
  }, [sort, year, genreId]);

  const { items: movies, hasMore, isLoadingMore, isLoadingFirst, loadMore: loadMoreMovies, sentinelRef } = usePagedFeed(fetchPage, []);

  const genres: { id: string; label: string }[] = [
    { id: '', label: 'All' },
    { id: '28', label: 'Action' },
    { id: '35', label: 'Comedy' },
    { id: '18', label: 'Drama' },
    { id: '53', label: 'Thriller' },
    { id: '27', label: 'Horror' },
    { id: '878', label: 'Sci-Fi' },
    { id: '10749', label: 'Romance' },
    { id: '80', label: 'Crime' },
    { id: '16', label: 'Animation' },
    { id: '99', label: 'Documentary' },
    { id: '10751', label: 'Family' },
  ];

  return (
    <div className="space-y-8 pb-12 select-none">
      {top10Movies.length > 0 && (
        <Top10Row
          title="Top 10 Movies Today"
          items={top10Movies}
          onPlay={onPlay}
          onOpenDetails={onOpenDetails}
          myListIds={myListIds}
          onToggleMyList={onToggleMyList}
        />
      )}

      <div className="px-6 md:px-16 space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Film className="w-6 h-6 text-[#E50914]" />
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Movies</h1>
        </div>

        <BrowseFilterBar
          resultCount={movies.length}
          loading={isLoadingFirst}
          showClear={Boolean(sort !== 'popular' || genreId || year)}
          onClear={() => {
            setSort('popular');
            setGenreId('');
            setYear('');
          }}
          facets={[
            facet(
              'sort',
              'Sort',
              [
                { value: 'popular', label: 'Popular' },
                { value: 'top_rated', label: 'Top Rated' },
                { value: 'newest', label: 'Newest' },
              ],
              sort,
              (v) => setSort(v as 'popular' | 'top_rated' | 'newest')
            ),
            facet(
              'genre',
              'Genre',
              genres.map((g) => ({ value: g.id, label: g.label })),
              genreId,
              setGenreId
            ),
            facet(
              'year',
              'Year',
              [
                { value: '', label: 'Any Year' },
                ...Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() - i)).map(
                  (y) => ({ value: y, label: y })
                ),
              ],
              year,
              setYear
            ),
          ]}
        />

        {/* Grid */}
        {movies.length === 0 && isLoadingFirst ? (
          <div className="flex gap-3 overflow-hidden animate-pulse">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="shrink-0 w-[140px] sm:w-[170px] md:w-[200px] aspect-[2/3] bg-[#1f1f1f] rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map((item) => (
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

        {/* Infinite Scroll Sentinel */}
        <LoadMoreSentinel
          sentinelRef={sentinelRef}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMoreMovies}
          itemCount={movies.length}
        />
      </div>
    </div>
  );
}

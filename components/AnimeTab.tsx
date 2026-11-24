'use client';

import React, { useState, useCallback } from 'react';
import { Play, Info, Orbit, Plus, Check } from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { MovieCard } from './MovieCard';
import { usePagedFeed } from '@/hooks/use-paged-feed';
import { LoadMoreSentinel } from './LoadMoreSentinel';
import { Top10Row } from './Top10Row';
import { MediaRail } from './MediaRail';
import { useMatchScore } from '@/components/TasteProvider';
import { BrowseFilterBar, facet } from '@/components/BrowseFilterBar';
import { mediaFetch } from '@/lib/client-media';

interface AnimeTabProps {
  animeList: MediaItem[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
  /** Kids profiles are already filter-locked upstream; hide controls that imply otherwise. */
  isKid?: boolean;
}

export function AnimeTab({
  animeList,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
  isKid = false,
}: AnimeTabProps) {
  const featuredAnime = animeList[0] || null;
  const matchFor = useMatchScore();
  const spotlightMatch = featuredAnime ? matchFor(featuredAnime) : null;

  // Filter state for the browse grid
  const [sort, setSort] = useState<'popular' | 'top_rated' | 'newest'>('popular');
  const [status, setStatus] = useState<'' | 'airing' | 'completed' | 'upcoming'>('');
  const [genreId, setGenreId] = useState('');
  const [year, setYear] = useState('');
  const [rating, setRating] = useState('');
  const [adult, setAdult] = useState(false);

  const fetchPage = useCallback(async (p: number) => {
    const params = new URLSearchParams({ type: 'anime', sort, page: String(p) });
    if (genreId) params.set('genre', genreId);
    if (year) params.set('year', year);
    if (rating) params.set('rating', rating);
    if (status) params.set('status', status);
    if (adult) params.set('adult', 'true');
    const res = await mediaFetch(`/api/media/discover?${params.toString()}`);
    if (!res.ok) return { items: [], hasMore: false };
    const data = await res.json();
    return { items: data.items || [], hasMore: data.hasMore ?? false };
  }, [sort, year, genreId, rating, status, adult]);

  const { items: gridItems, hasMore, isLoadingMore, isLoadingFirst, loadMore, sentinelRef } = usePagedFeed(fetchPage, []);

  const genres: { id: string; label: string }[] = [
    { id: '', label: 'All' },
    { id: '10759', label: 'Action & Adventure' },
    { id: '35', label: 'Comedy' },
    { id: '18', label: 'Drama' },
    { id: '9648', label: 'Mystery' },
    { id: '10765', label: 'Sci-Fi & Fantasy' },
    { id: '10749', label: 'Romance' },
    { id: '27', label: 'Horror' },
    { id: '10751', label: 'Family' },
  ];

  return (
    <div className="space-y-8 pb-12 select-none">
      {/* Featured Anime Banner */}
      {featuredAnime && (
        <section className="relative w-full min-h-[460px] md:min-h-[520px] flex items-center overflow-hidden px-6 md:px-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={featuredAnime.backdropUrl || featuredAnime.posterUrl}
            alt={featuredAnime.title}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-transparent to-transparent" />

          <div className="relative z-10 max-w-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#E50914] uppercase tracking-widest">
              <Orbit className="w-4 h-4" />
              <span>POPULAR ANIME SPOTLIGHT</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-black uppercase text-white tracking-tight drop-shadow-md">
              {featuredAnime.title}
            </h1>

            <div className="flex items-center gap-2 text-xs text-[#cccccc]">
              {spotlightMatch !== null && (
                <>
                  <span className="text-[#46d369] font-bold">{spotlightMatch}% Match</span>
                  <span>•</span>
                </>
              )}
              <span>{featuredAnime.releaseYear}</span>
              <span>•</span>
              <span className="px-1 border border-white/40 rounded">{featuredAnime.rating}</span>
            </div>

            <p className="text-xs md:text-sm text-[#d4d4d4] line-clamp-3 leading-relaxed">
              {featuredAnime.overview}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => onPlay(featuredAnime)}
                className="flex items-center gap-2 px-5 py-2 rounded bg-white hover:bg-[#e6e6e6] text-black font-bold text-sm transition-all"
              >
                <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                <span>Stream Anime</span>
              </button>

              <button
                onClick={() => onOpenDetails(featuredAnime)}
                className="flex items-center gap-2 px-4 py-2 rounded bg-[#6d6d6e]/70 hover:bg-[#6d6d6e]/50 text-white font-semibold text-sm backdrop-blur-md"
              >
                <Info className="w-4 h-4" />
                <span>Episodes</span>
              </button>

              <button
                onClick={() => onToggleMyList(featuredAnime)}
                className="p-2 rounded-full border border-white/30 bg-black/40 text-white hover:bg-white/20 transition-all"
              >
                {myListIds.includes(featuredAnime.id) ? (
                  <Check className="w-4 h-4 text-[#46d369]" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Top 10 Anime */}
      {animeList.length >= 10 && (
        <Top10Row
          title="Top 10 Anime Today"
          items={animeList.slice(0, 10)}
          onPlay={onPlay}
          onOpenDetails={onOpenDetails}
          myListIds={myListIds}
          onToggleMyList={onToggleMyList}
        />
      )}

      {/* Currently Airing / New Episodes / Completed */}
      <MediaRail title="Currently Airing" category="anime_airing" type="anime" onPlay={onPlay} onOpenDetails={onOpenDetails} myListIds={myListIds} onToggleMyList={onToggleMyList} />
      <MediaRail title="New Episodes Today" category="anime_new_episodes" type="anime" onPlay={onPlay} onOpenDetails={onOpenDetails} myListIds={myListIds} onToggleMyList={onToggleMyList} />
      <MediaRail title="Completed Series" category="anime_completed" type="anime" onPlay={onPlay} onOpenDetails={onOpenDetails} myListIds={myListIds} onToggleMyList={onToggleMyList} />

      {/* Browse Grid with Filters */}
      <div className="px-6 md:px-16 space-y-6">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Orbit className="w-5 h-5 text-[#E50914]" />
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Browse Anime</h2>
        </div>

        <BrowseFilterBar
          resultCount={gridItems.length}
          loading={isLoadingFirst}
          showClear={Boolean(sort !== 'popular' || status || year || rating || genreId || adult)}
          onClear={() => {
            setSort('popular');
            setStatus('');
            setGenreId('');
            setYear('');
            setRating('');
            setAdult(false);
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
              'status',
              'Status',
              [
                { value: '', label: 'Any' },
                { value: 'airing', label: 'Airing' },
                { value: 'completed', label: 'Completed' },
                { value: 'upcoming', label: 'Upcoming' },
              ],
              status,
              (v) => setStatus(v as '' | 'airing' | 'completed' | 'upcoming')
            ),
            facet(
              'genre',
              'Genre',
              genres.map((g) => ({ value: g.id, label: g.label })),
              genreId,
              setGenreId,
              true
            ),
            facet(
              'year',
              'Year',
              [
                { value: '', label: 'Any' },
                ...Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() - i)).map(
                  (y) => ({ value: y, label: y })
                ),
              ],
              year,
              setYear,
              true
            ),
            ...(isKid
              ? []
              : [
                  facet(
                    'rating',
                    'Rating',
                    [
                      { value: '', label: 'Any' },
                      { value: 'ALL', label: 'All ages' },
                      { value: '7+', label: '7+' },
                      { value: '13+', label: '13+' },
                      { value: '16+', label: '16+' },
                      { value: '18+', label: '18+' },
                    ],
                    rating,
                    setRating,
                    true
                  ),
                  facet(
                    'mature',
                    'Mature',
                    [
                      { value: 'off', label: '18+ Off' },
                      { value: 'on', label: '18+ On' },
                    ],
                    adult ? 'on' : 'off',
                    (v) => setAdult(v === 'on')
                  ),
                ]),
          ]}
        />

        {/* Grid */}
        {gridItems.length === 0 && isLoadingFirst ? (
          <div className="flex gap-3 overflow-hidden animate-pulse">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="shrink-0 w-[140px] sm:w-[170px] md:w-[200px] aspect-[2/3] bg-[#1f1f1f] rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {gridItems.map((item) => (
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
          itemCount={gridItems.length}
        />
      </div>
    </div>
  );
}

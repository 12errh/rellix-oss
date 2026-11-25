'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MediaItem } from '@/types/movie';
import { MovieRow } from './MovieRow';
import { usePagedFeed } from '@/hooks/use-paged-feed';
import { mediaFetch } from '@/lib/client-media';

interface MediaRailProps {
  title: string;
  category: string;
  type: 'movie' | 'tv' | 'anime';
  extraQuery?: string;
  apiPath?: string;
  /** Full query string (e.g. from lib/home-rails.ts#railQuery); overrides category. */
  query?: string;
  /**
   * Defer the fetch until the rail is near the viewport. The home screen passes
   * this for every rail below the fold so a long page does not fire a dozen
   * parallel requests on mount.
   */
  lazy?: boolean;
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
}

export function MediaRail({
  title,
  category,
  type,
  extraQuery = '',
  apiPath,
  query,
  lazy = false,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
}: MediaRailProps) {
  // An explicit apiPath (e.g. the recommendations endpoint) wins over the
  // generated browse query, which only describes a discover-shaped rail.
  const base = apiPath ?? query ?? `/api/media/browse?type=${type}&category=${category}`;

  const fetchPage = useCallback(
    async (page: number) => {
      const res = await mediaFetch(`${base}&page=${page}${extraQuery}`);
      if (!res.ok) return { items: [], hasMore: false };
      const data = await res.json();
      return { items: data.items || [], hasMore: data.hasMore ?? false };
    },
    [base, extraQuery]
  );

  const seed: MediaItem[] = [];

  // Height placeholder matching a MovieRow so lazy rails do not shift layout as
  // they hydrate.
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);

  useEffect(() => {
    if (!lazy) return;
    const el = holderRef.current;
    if (!el) return;
    // rootMargin pulls the fetch in well before the rail is on screen, so the
    // first paint of a scrolled-to row already has posters.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy]);

  const { items, hasMore, isLoadingMore, isLoadingFirst, loadMore } = usePagedFeed(
    fetchPage,
    seed,
    visible
  );

  // Not yet scrolled into view, or page 1 still in flight: reserve the row's
  // height and show a shimmer so the page never collapses then jumps. Rendering
  // MovieRow with an empty `items` list would instead paint a heading over an
  // empty track, which reads as a broken row.
  // Settled with no results: the rail genuinely has nothing (thin catalogue, or
  // every query failed). Render nothing rather than an endless shimmer.
  if (visible && items.length === 0 && !isLoadingFirst && !isLoadingMore) return null;

  if (!visible || items.length === 0) {
    return (
      <div
        ref={holderRef}
        aria-hidden
        className="px-6 md:px-16 pt-8 pb-1"
      >
        <div className="mb-4 flex items-baseline justify-between gap-6 border-b border-white/10 pb-2.5">
          <div className="h-4 w-40 animate-pulse bg-white/[0.07]" />
          <div className="h-3 w-14 animate-pulse bg-white/[0.05]" />
        </div>
        <div className="flex gap-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[210px] w-[140px] shrink-0 animate-pulse rounded-[3px] bg-white/[0.045] sm:h-[255px] sm:w-[170px] md:h-[300px] md:w-[200px]"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0 && !isLoadingFirst && !isLoadingMore) return null;

  return (
    <div aria-busy={!visible}>
      <MovieRow
        title={title}
        items={items}
        onPlay={onPlay}
        onOpenDetails={onOpenDetails}
        myListIds={myListIds}
        onToggleMyList={onToggleMyList}
        onLoadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />
      {/* No IntersectionObserver sentinel here on purpose. A rail is a
          horizontal scroller, so an observer target in normal flow sits in the
          page viewport the whole time the rail is on screen and pulls page
          after page without anyone touching it. MovieRow already asks for the
          next page when the track is scrolled near its right edge, which is the
          only moment the request is justified. */}
    </div>
  );
}

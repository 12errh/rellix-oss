'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { MovieCard } from './MovieCard';

interface MovieRowProps {
  title: string;
  items: MediaItem[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
  isContinueWatching?: boolean;
  onRemoveContinueWatching?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export function MovieRow({
  title,
  items,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
  isContinueWatching,
  onRemoveContinueWatching,
  onLoadMore,
  hasMore = true,
  isLoadingMore = false,
}: MovieRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  if (!items || items.length === 0) return null;

  const checkScroll = () => {
    if (rowRef.current) {
      setCanScrollLeft(rowRef.current.scrollLeft > 20);

      // If scrolled near the right end, trigger onLoadMore if available
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      if (scrollWidth - (scrollLeft + clientWidth) < 150 && onLoadMore && !isLoadingMore && hasMore) {
        onLoadMore();
      }
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.75;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScroll, 350);

      if (direction === 'right' && onLoadMore && !isLoadingMore && hasMore) {
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
        if (scrollWidth - (scrollLeft + clientWidth) < scrollAmount * 1.5) {
          onLoadMore();
        }
      }
    }
  };

  return (
    <section className="relative px-6 md:px-16 pt-8 pb-1 group select-none">
      {/* Row header: title, count, hairline rule. The rule is what separates
          sections now — no card shadows, no coloured chip. */}
      <div className="mb-4 flex items-baseline justify-between gap-6 border-b border-white/10 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="truncate text-[15px] font-medium tracking-[-0.01em] text-white md:text-base">
            {title}
          </h2>
          <span className="shrink-0 text-[11px] tabular-nums text-[#5f5f5f]">
            {items.length} {items.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

        {onLoadMore && hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[#8a8a8a] transition-colors hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 disabled:opacity-60"
          >
            {isLoadingMore ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span>Load more</span>
                <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </button>
        )}
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className={`hidden md:flex absolute left-4 top-[calc(50%+1rem)] -translate-y-1/2 z-20 h-20 w-9 items-center justify-center rounded-[2px] border border-white/10 bg-[#111111]/85 text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white ${
          canScrollLeft ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={() => scroll('right')}
        className="hidden md:flex absolute right-4 top-[calc(50%+1rem)] -translate-y-1/2 z-20 h-20 w-9 items-center justify-center rounded-[2px] border border-white/10 bg-[#111111]/85 text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white md:opacity-0 md:group-hover:opacity-100"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Row Items Rail */}
      <div
        ref={rowRef}
        onScroll={checkScroll}
        className="flex items-center gap-3 md:gap-4 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth py-2"
      >
        {items.map((item) => (
          <MovieCard
            key={item.id}
            item={item}
            onPlay={onPlay}
            onOpenDetails={onOpenDetails}
            isInMyList={myListIds.includes(item.id)}
            onToggleMyList={onToggleMyList}
            isContinueWatching={isContinueWatching}
            onRemoveContinueWatching={onRemoveContinueWatching}
          />
        ))}

        {/* Load More Rail Tile */}
        {onLoadMore && hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="group/tile flex h-[210px] w-[140px] shrink-0 flex-col items-center justify-center gap-3 rounded-[3px] border border-white/10 bg-transparent text-[#6f6f6f] transition-colors hover:border-white/30 hover:text-[#d4d4d4] sm:h-[255px] sm:w-[170px] md:h-[300px] md:w-[200px]"
          >
            {isLoadingMore ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#8a8a8a]" />
            ) : (
              <>
                <Plus className="h-5 w-5" strokeWidth={1.5} />
                <span className="text-[10px] font-medium uppercase tracking-[0.16em]">
                  Load more
                </span>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

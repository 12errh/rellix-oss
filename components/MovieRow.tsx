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
    <section className="relative px-6 md:px-16 py-4 group select-none">
      {/* Row Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg md:text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs font-normal text-[#888888]">
            ({items.length} {items.length === 1 ? 'title' : 'titles'})
          </span>
        </h2>

        {onLoadMore && hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="text-xs text-[#E50914] hover:text-[#ff3844] font-semibold flex items-center gap-1 transition-colors"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <span>Load More</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className={`hidden md:flex absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-28 bg-black/70 hover:bg-black/95 text-white items-center justify-center rounded-r transition-all duration-200 backdrop-blur-sm ${
          canScrollLeft ? 'opacity-80 md:opacity-0 md:group-hover:opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-7 h-7" />
      </button>

      <button
        onClick={() => scroll('right')}
        className="hidden md:flex absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-28 bg-black/70 hover:bg-black/95 text-white items-center justify-center rounded-l opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-7 h-7" />
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
            className="shrink-0 w-36 sm:w-44 md:w-52 h-[220px] sm:h-[260px] md:h-[300px] rounded-lg border-2 border-dashed border-white/20 hover:border-[#E50914] bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-3 text-[#a3a3a3] hover:text-white transition-all group/tile"
          >
            {isLoadingMore ? (
              <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-white/10 group-hover/tile:bg-[#E50914] flex items-center justify-center text-white transition-colors">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider">Load More</span>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

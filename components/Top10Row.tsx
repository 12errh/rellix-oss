'use client';

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Plus, Check, Info } from 'lucide-react';
import { MediaItem } from '@/types/movie';

interface Top10RowProps {
  title: string;
  items: MediaItem[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
}

/**
 * Ranked rail. The oversized numeral carries the ranking; the poster no longer
 * repeats it in a corner pill and the row header uses the same hairline rule as
 * every other section, so this reads as part of one page rather than a promo.
 */
export function Top10Row({
  title,
  items,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
}: Top10RowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // On a cold load the live Top 10 has not arrived yet, and on a kids profile
  // every live title can be filtered out. An empty rail should not render its
  // heading with nothing underneath it.
  if (items.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.75;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="relative px-6 md:px-16 pt-10 pb-1 group select-none">
      <div className="mb-5 flex items-baseline justify-between gap-6 border-b border-white/10 pb-2.5">
        <h2 className="truncate text-[15px] font-medium tracking-[-0.01em] text-white md:text-base">
          {title}
        </h2>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.16em] text-[#5f5f5f]">
          Updated daily
        </span>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className="hidden md:flex absolute left-4 top-[calc(50%+1.25rem)] -translate-y-1/2 z-20 h-20 w-9 items-center justify-center rounded-[2px] border border-white/10 bg-[#111111]/85 text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white md:opacity-0 md:group-hover:opacity-100"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={() => scroll('right')}
        className="hidden md:flex absolute right-4 top-[calc(50%+1.25rem)] -translate-y-1/2 z-20 h-20 w-9 items-center justify-center rounded-[2px] border border-white/10 bg-[#111111]/85 text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white md:opacity-0 md:group-hover:opacity-100"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={rowRef}
        className="flex items-end gap-2 md:gap-4 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth py-2"
      >
        {items.map((item, index) => {
          const rank = index + 1;
          const isInList = myListIds.includes(item.id);

          return (
            <div
              key={item.id}
              className="relative flex-none w-[170px] sm:w-[210px] md:w-[240px] group/card cursor-pointer select-none"
            >
              <div className="relative flex items-end h-[160px] sm:h-[190px] md:h-[220px]">
                <div className="absolute left-0 bottom-0 z-10 pointer-events-none">
                  <span className="rellix-top10-num text-[110px] sm:text-[140px] md:text-[160px] leading-none block">
                    {rank}
                  </span>
                </div>

                <div
                  onClick={() => onOpenDetails(item)}
                  className="relative z-20 ml-auto w-[65%] sm:w-[68%] h-full overflow-hidden rounded-[3px] border border-white/[0.07] bg-[#1c1c1c] transition-colors group-hover/card:border-white/25"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-[1.02]"
                    loading="lazy"
                  />

                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                  {item.isOriginal && (
                    <div className="absolute top-1.5 left-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
                      Rellix
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-2.5 opacity-90 transition-opacity duration-200 md:opacity-0 md:group-hover/card:opacity-100">
                    <p className="mb-2.5 line-clamp-1 text-xs font-medium text-white">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlay(item);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-[#e6e6e6]"
                        title="Play"
                      >
                        <Play className="w-3 h-3 fill-black text-black ml-0.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMyList(item);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-black/40 text-white transition-colors hover:bg-black/80"
                        title={isInList ? 'Remove from My List' : 'Add to My List'}
                      >
                        {isInList ? (
                          <Check className="w-3.5 h-3.5 text-[#46d369]" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetails(item);
                        }}
                        className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-black/40 text-white transition-colors hover:bg-black/80"
                        title="More Info"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

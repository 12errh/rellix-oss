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
    <section className="relative px-6 md:px-16 py-4 group select-none">
      {/* Section Header */}
      <h2 className="text-lg md:text-2xl font-bold text-white mb-4 tracking-tight flex items-center gap-2">
        <span>{title}</span>
      </h2>

      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className="hidden md:flex absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-28 bg-black/60 hover:bg-black/90 text-white items-center justify-center rounded-r opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-7 h-7" />
      </button>

      <button
        onClick={() => scroll('right')}
        className="hidden md:flex absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-28 bg-black/60 hover:bg-black/90 text-white items-center justify-center rounded-l opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-7 h-7" />
      </button>

      {/* Row Container */}
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
              className="relative flex-none w-[170px] sm:w-[210px] md:w-[240px] group/card cursor-pointer transition-transform duration-300 hover:scale-105 hover:z-30"
            >
              <div className="relative flex items-end h-[160px] sm:h-[190px] md:h-[220px]">
                {/* Giant Outlined Top 10 Number */}
                <div className="absolute left-0 bottom-0 z-10 pointer-events-none">
                  <span className="rellix-top10-num text-[110px] sm:text-[140px] md:text-[160px] leading-none block">
                    {rank}
                  </span>
                </div>

                {/* Overlapping Poster Card (Matches screenshot right alignment with number) */}
                <div
                  onClick={() => onOpenDetails(item)}
                  className="relative z-20 ml-auto w-[65%] sm:w-[68%] h-full rounded-md overflow-hidden shadow-2xl border border-white/10 group-hover/card:border-white/30 bg-[#222222] transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover/card:brightness-105 transition-all duration-300"
                    loading="lazy"
                  />

                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />

                  {/* Rank pill */}
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-black text-white border border-white/20">
                    #{rank}
                  </div>

                  {/* Rellix Original badge on poster */}
                  {item.isOriginal && (
                    <div className="absolute top-1.5 left-1.5 w-4 h-4 text-xs font-black text-[#E50914] drop-shadow-md">
                      R
                    </div>
                  )}

                  {/* Hover Quick Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5">
                    <p className="text-xs font-bold text-white line-clamp-1 mb-2">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlay(item);
                        }}
                        className="w-7 h-7 rounded-full bg-white hover:bg-[#e6e6e6] text-black flex items-center justify-center transition-transform hover:scale-110 shadow-md"
                        title="Play"
                      >
                        <Play className="w-3.5 h-3.5 fill-black text-black ml-0.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMyList(item);
                        }}
                        className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 border border-white/40 text-white flex items-center justify-center transition-transform hover:scale-110"
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
                        className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 border border-white/40 text-white flex items-center justify-center transition-transform hover:scale-110 ml-auto"
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

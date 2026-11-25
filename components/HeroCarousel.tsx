'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Info,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { useMatchScore } from '@/components/TasteProvider';

interface HeroCarouselProps {
  items: MediaItem[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
}

/**
 * Editorial hero.
 *
 * The previous version stacked a brand mark, an uppercase headline, a maturity
 * badge in the corner and a second maturity badge in the metadata line — five
 * competing signals over the same still. This one keeps a single reading path:
 * index → eyebrow → title → facts → logline → actions → rail position. Rules
 * and a muted palette carry the structure instead of shadows and glows.
 */
export function HeroCarousel({
  items,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
}: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const carouselItems = items && items.length > 0 ? items.slice(0, 8) : [];
  const currentItem = carouselItems[currentIndex] || items[0];
  const matchFor = useMatchScore();
  const heroMatch = currentItem ? matchFor(currentItem) : null;

  // Auto-play carousel rotation every 7 seconds, pausing on hover
  useEffect(() => {
    if (isHovered || carouselItems.length <= 1) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % carouselItems.length);
    }, 7000);

    return () => {
      clearInterval(timerRef.current ?? undefined);
    };
  }, [carouselItems.length, isHovered]);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + carouselItems.length) % carouselItems.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % carouselItems.length);
  };

  if (!currentItem) return null;

  const isInMyList = myListIds.includes(currentItem.id);
  const index = String(currentIndex + 1).padStart(2, '0');
  const total = String(carouselItems.length).padStart(2, '0');

  return (
    <section
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full min-h-[600px] md:min-h-[680px] lg:min-h-[740px] flex items-end overflow-hidden select-none group"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentItem.id}
          src={currentItem.backdropUrl || currentItem.posterUrl}
          alt=""
          aria-hidden
          className="w-full h-full object-cover object-[center_25%] md:object-center hero-kenburns"
        />

        {/* Scrim: heavy on the left for text contrast, fading into the page on
            the right and bottom so the first row starts on the same surface. */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/80 to-[#111111]/10 md:to-transparent z-[1]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/35 to-transparent z-[1]" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#111111]/85 to-transparent z-[1]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-6 md:px-16 pb-14 md:pb-20">
        <div key={currentItem.id} className="max-w-[44rem] hero-stagger">
          {/* Publication line: index, type, year — reads like a masthead */}
          <div className="mb-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a8a8a]">
            <span className="text-[#E50914]">Featured</span>
            <span className="h-px w-8 bg-white/20" aria-hidden />
            <span>
              {index} / {total}
            </span>
            <span className="h-px w-8 bg-white/10" aria-hidden />
            <span className="text-[#a3a3a3]">
              {currentItem.type === 'movie' ? 'Film' : 'Series'}
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-semibold leading-[0.98] tracking-[-0.035em] text-white">
            {currentItem.title}
          </h1>

          {currentItem.heroHeadline && (
            <p className="mt-3 text-sm md:text-[15px] font-normal leading-relaxed text-[#cfcfcf]">
              {currentItem.heroHeadline}
            </p>
          )}

          {/* Facts: one line, hairline separators, no chips */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] md:text-[13px] text-[#b3b3b3]">
            {heroMatch !== null && (
              <span className="font-medium text-[#46d369]">{heroMatch}% match</span>
            )}
            <span className="tabular-nums">{currentItem.releaseYear}</span>
            <span className="h-3 w-px bg-white/20" aria-hidden />
            <span>
              {currentItem.type === 'movie'
                ? currentItem.duration || '2h 10m'
                : `${currentItem.seasonsCount || 2} ${
                    (currentItem.seasonsCount || 2) === 1 ? 'season' : 'seasons'
                  }`}
            </span>
            <span className="h-3 w-px bg-white/20" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a8a]">
              {currentItem.rating}
            </span>
            {currentItem.genres?.length > 0 && (
              <>
                <span className="h-3 w-px bg-white/20" aria-hidden />
                <span className="truncate">{currentItem.genres.slice(0, 2).join(' · ')}</span>
              </>
            )}
          </div>

          <p className="mt-5 max-w-xl text-sm md:text-[15px] leading-[1.7] text-[#b8b8b8] line-clamp-3">
            {currentItem.overview}
          </p>

          {/* Actions */}
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onPlay(currentItem)}
              className="inline-flex items-center gap-2 rounded-[2px] bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#e6e6e6] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.99]"
            >
              <Play className="w-4 h-4 fill-black text-black" />
              <span>Play now</span>
            </button>

            <button
              onClick={() => onOpenDetails(currentItem)}
              className="inline-flex items-center gap-2 rounded-[2px] border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/60 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.99]"
            >
              <Info className="w-4 h-4" />
              <span>Details</span>
            </button>

            <button
              onClick={() => onToggleMyList(currentItem)}
              className="inline-flex items-center gap-2 rounded-[2px] border border-transparent px-3 py-2.5 text-sm font-medium text-[#cfcfcf] transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              title={isInMyList ? 'Remove from My List' : 'Add to My List'}
            >
              {isInMyList ? (
                <Check className="w-4 h-4 text-[#46d369]" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{isInMyList ? 'In My List' : 'My List'}</span>
            </button>
          </div>

          {/* Rail position: segments, not dots */}
          <div className="mt-9 flex items-center gap-2" role="tablist" aria-label="Featured titles">
            {carouselItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setCurrentIndex(idx)}
                role="tab"
                aria-selected={idx === currentIndex}
                aria-label={`Featured title ${idx + 1}: ${item.title}`}
                className={`h-[3px] transition-all duration-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/60 ${
                  idx === currentIndex ? 'w-9 bg-[#E50914]' : 'w-2.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
            <span className="ml-2 text-[10px] tabular-nums tracking-[0.18em] text-[#5f5f5f]">
              {index} / {total}
            </span>
          </div>
        </div>
      </div>

      {/* Arrow controls: squares, hairline, no blur or glow */}
      <button
        onClick={handlePrev}
        className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-10 w-10 items-center justify-center rounded-[2px] border border-white/15 bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:border-white/40 hover:text-white md:opacity-0 md:group-hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-label="Previous featured title"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-10 w-10 items-center justify-center rounded-[2px] border border-white/15 bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:border-white/40 hover:text-white md:opacity-0 md:group-hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-label="Next featured title"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </section>
  );
}

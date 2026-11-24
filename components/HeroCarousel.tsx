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
      if (timerRef.current) clearInterval(timerRef.current);
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

  return (
    <section
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full min-h-[580px] md:min-h-[660px] lg:min-h-[720px] flex items-center overflow-hidden px-6 md:px-16 pt-12 pb-24 select-none group"
    >
      {/* Background Backdrop Image with smooth fade transition */}
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentItem.id}
          src={currentItem.backdropUrl || currentItem.posterUrl}
          alt={currentItem.title}
          className="w-full h-full object-cover object-top md:object-center hero-kenburns"
        />

        {/* Rellix Iconic Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/85 to-transparent w-full md:w-3/4 z-1" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/30 to-transparent z-1" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#111111]/80 via-transparent to-transparent h-28 z-1" />
      </div>

      {/* Hero Content Information */}
      <div className="relative z-10 max-w-2xl space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
        {/* Rellix Brand Tag */}
        <div className="flex items-center gap-2">
          <span className="text-[#E50914] font-black text-2xl tracking-tighter">R</span>
          <span className="text-white text-xs md:text-sm font-black tracking-[0.25em] uppercase">
            {currentItem.type === 'movie' ? 'FILM' : 'SERIES'}
          </span>
          {/* The yellow NEW RELEASE badge that used to sit here was removed: it
              clashed with the red brand mark beside it and read as an ad overlay
              rather than part of the title block. `isNewRelease` is still set on
              the data and is used by the search page's Trending chips, so nothing
              upstream changed. */}
        </div>

        {/* Headline / Title */}
        <div className="space-y-1">
          {currentItem.heroHeadline && (
            <p className="text-xs md:text-sm font-bold uppercase tracking-[0.3em] text-[#cccccc]">
              {currentItem.heroHeadline}
            </p>
          )}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase text-white tracking-tight leading-none drop-shadow-md">
            {currentItem.title}
          </h1>
        </div>

        {/* Metadata info */}
        <div className="flex items-center flex-wrap gap-2 md:gap-3 text-xs md:text-sm text-[#cccccc]">
          {heroMatch !== null && (
            <>
              <span className="text-[#46d369] font-bold">{heroMatch}% Match</span>
              <span>•</span>
            </>
          )}
          <span>{currentItem.releaseYear}</span>
          <span>•</span>
          <span>
            {currentItem.type === 'movie'
              ? currentItem.duration || '2h 10m'
              : `${currentItem.seasonsCount || 2} ${
                  (currentItem.seasonsCount || 2) === 1 ? 'Season' : 'Seasons'
                }`}
          </span>
          <span className="px-1.5 py-0.2 border border-white/60 text-white rounded text-[10px] font-bold">
            {currentItem.rating}
          </span>
        </div>

        {/* Synopsis Overview */}
        <p className="text-xs sm:text-sm md:text-base text-[#e5e5e5] line-clamp-3 leading-relaxed max-w-xl drop-shadow">
          {currentItem.overview}
        </p>

        {/* CTA Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => onPlay(currentItem)}
            className="flex items-center gap-2 px-6 md:px-8 py-2.5 md:py-3 rounded bg-white hover:bg-[#e6e6e6] text-black font-bold text-sm md:text-base transition-all transform active:scale-95 shadow-xl hover:shadow-2xl"
          >
            <Play className="w-5 h-5 fill-black text-black ml-0.5" />
            <span>Play</span>
          </button>

          <button
            onClick={() => onOpenDetails(currentItem)}
            className="flex items-center gap-2 px-5 md:px-7 py-2.5 md:py-3 rounded bg-[#6d6d6e]/75 hover:bg-[#6d6d6e]/50 text-white font-semibold text-sm md:text-base backdrop-blur-md transition-all active:scale-95"
          >
            <Info className="w-5 h-5" />
            <span>More Info</span>
          </button>

          <button
            onClick={() => onToggleMyList(currentItem)}
            className="p-2.5 md:p-3 rounded-full border border-white/40 bg-black/40 text-white hover:bg-white/20 transition-all hover:scale-105"
            title={isInMyList ? 'Remove from My List' : 'Add to My List'}
          >
            {isInMyList ? (
              <Check className="w-5 h-5 text-[#46d369]" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Side Carousel Navigation Buttons */}
      <button
        onClick={handlePrev}
        className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 hidden md:flex items-center justify-center transition-all opacity-80 md:opacity-0 md:group-hover:opacity-100 hover:scale-110 shadow-xl backdrop-blur-sm"
        title="Previous title"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 hidden md:flex items-center justify-center transition-all opacity-80 md:opacity-0 md:group-hover:opacity-100 hover:scale-110 shadow-xl backdrop-blur-sm"
        title="Next title"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Maturity Badge */}
      <div className="absolute right-6 md:right-16 bottom-24 z-10 flex items-center gap-3">
        <div className="px-3 py-1 bg-black/60 border-l-2 border-white text-xs font-bold text-[#e5e5e5] tracking-wider backdrop-blur-sm">
          {currentItem.rating}
        </div>
      </div>

      {/* Bottom Carousel Dot Indicators */}
      <div className="absolute bottom-20 md:bottom-28 left-6 md:left-16 z-20 flex items-center gap-2">
        {carouselItems.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all rounded-full h-1.5 ${
              idx === currentIndex
                ? 'w-8 bg-[#E50914]'
                : 'w-2 bg-white/30 hover:bg-white/60'
            }`}
            title={`Slide ${idx + 1}: ${item.title}`}
          />
        ))}
        <span className="text-[10px] text-[#888888] font-mono ml-2">
          {currentIndex + 1} / {carouselItems.length}
        </span>
      </div>
    </section>
  );
}

'use client';

import React from 'react';
import { Play, Plus, Check, Info, X } from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { useMatchScore } from '@/components/TasteProvider';
import { formatRemaining } from '@/lib/format';

interface MovieCardProps {
  item: MediaItem;
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  isInMyList: boolean;
  onToggleMyList: (media: MediaItem) => void;
  isContinueWatching?: boolean;
  onRemoveContinueWatching?: (id: string) => void;
  variant?: 'row' | 'grid';
}

export function MovieCard({
  item,
  onPlay,
  onOpenDetails,
  isInMyList,
  onToggleMyList,
  isContinueWatching,
  onRemoveContinueWatching,
  variant = 'row',
}: MovieCardProps) {
  const progress = item.continueWatchingProgress ?? 0;
  const matchFor = useMatchScore();
  const match = matchFor(item);

  return (
    <div className={`relative group/card cursor-pointer transition-all duration-300 hover:scale-105 hover:z-30 select-none ${variant === 'grid' ? 'w-full' : 'flex-none w-[140px] sm:w-[170px] md:w-[200px]'}`}>
      <div
        onClick={() => onOpenDetails(item)}
        className="relative aspect-[2/3] w-full rounded-md overflow-hidden bg-[#222222] border border-white/5 group-hover/card:border-white/30 shadow-xl transition-all"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.posterUrl}
          alt={item.title}
          className="w-full h-full object-cover group-hover/card:brightness-105 transition-all duration-300"
          loading="lazy"
        />

        {/* N Original logo */}
        {item.isOriginal && (
          <div className="absolute top-2 left-2 text-xs font-black text-[#E50914] drop-shadow-md">
            R
          </div>
        )}

        {/* Continue Watching Progress Bar (matches screenshot row 2) */}
        {isContinueWatching && item.continueWatchingProgress != null && (
          <div className="absolute bottom-0 inset-x-0 bg-neutral-900/90 py-1 px-2 flex flex-col gap-1 z-10 border-t border-white/10 pointer-events-none">
            <div className="w-full bg-[#333333] h-1 rounded-full overflow-hidden">
              <div
                className="bg-[#E50914] h-full rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#a3a3a3]">
              <span>{item.type !== 'movie' && item.continueWatchingSeason ? `S${item.continueWatchingSeason}:E${item.continueWatchingEpisode} · Resume` : 'Resume'}</span>
              {item.remainingMinutes != null && <span>{formatRemaining(item.remainingMinutes)} left</span>}
            </div>
          </div>
        )}

        {/* Hover Action Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity duration-200 flex flex-col justify-end ${isContinueWatching && item.continueWatchingProgress != null ? 'p-2 md:p-3 pb-16' : 'p-2 md:p-3'} z-20`}>
          <p className="text-xs font-bold text-white line-clamp-1 mb-1 drop-shadow">
            {item.title}
          </p>

          <div className="flex items-center gap-1.5 text-[10px] text-[#cccccc] mb-2.5">
            {/* Hidden until the viewer has given us a real signal (likes/history).
                computeMatch returns null otherwise, and "0%" would be a lie. */}
            {match !== null && (
              <>
                <span className="text-[#46d369] font-bold">{match}%</span>
                <span>•</span>
              </>
            )}
            <span className="px-1 border border-white/40 rounded-[2px]">{item.rating}</span>
            <span>•</span>
            <span>{item.type === 'movie' ? item.duration : `${item.seasonsCount || 1}S`}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(item);
              }}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white hover:bg-[#e6e6e6] text-black flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
              title="Play Stream"
            >
              <Play className="w-3.5 h-3.5 md:w-4 md:h-4 fill-black text-black ml-0.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMyList(item);
              }}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-black/60 hover:bg-black/90 border border-white/40 text-white flex items-center justify-center transition-transform hover:scale-110"
              title={isInMyList ? 'Remove from My List' : 'Add to My List'}
            >
              {isInMyList ? (
                <Check className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#46d369]" />
              ) : (
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              )}
            </button>

            {isContinueWatching && onRemoveContinueWatching && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveContinueWatching(item.id);
                }}
                className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-black/60 hover:bg-black/90 border border-white/40 text-white flex items-center justify-center transition-transform hover:scale-110"
                title="Remove from row"
              >
                <X className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(item);
              }}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-black/60 hover:bg-black/90 border border-white/40 text-white flex items-center justify-center transition-transform hover:scale-110 ml-auto hidden min-[480px]:flex"
              title="More Info"
            >
              <Info className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

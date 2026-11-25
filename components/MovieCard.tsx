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
    <div className={`tap relative group/card cursor-pointer transition-transform duration-[260ms] ease-[var(--ease-editorial)] select-none hover:-translate-y-1 hover:z-30 ${variant === 'grid' ? 'w-full' : 'flex-none w-[140px] sm:w-[170px] md:w-[200px]'}`}>
      <div
        onClick={() => onOpenDetails(item)}
        className="relative aspect-[2/3] w-full overflow-hidden rounded-[3px] bg-[#1c1c1c] border border-white/[0.07] group-hover/card:border-white/25 transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.posterUrl}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-[1.02]"
          loading="lazy"
        />

        {/* Rellix Original mark */}
        {item.isOriginal && (
          <div className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
            Rellix
          </div>
        )}

        {/* Continue Watching progress */}
        {isContinueWatching && item.continueWatchingProgress != null && (
          <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm px-2.5 pt-1.5 pb-2 flex flex-col gap-1.5 z-10 border-t border-white/10 pointer-events-none">
            <div className="w-full bg-white/15 h-[2px] overflow-hidden">
              <div
                className="bg-[#E50914] h-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] tracking-wide text-[#a3a3a3]">
              <span>{item.type !== 'movie' && item.continueWatchingSeason ? `S${item.continueWatchingSeason}:E${item.continueWatchingEpisode} · Resume` : 'Resume'}</span>
              {item.remainingMinutes != null && <span>{formatRemaining(item.remainingMinutes)} left</span>}
            </div>
          </div>
        )}

        {/* Hover Action Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity duration-200 flex flex-col justify-end ${isContinueWatching && item.continueWatchingProgress != null ? 'p-2.5 pb-16' : 'p-2.5'} z-20`}>
          <p className="text-[11px] font-medium text-white line-clamp-1 mb-1">
            {item.title}
          </p>

          <div className="flex items-center gap-1.5 text-[10px] text-[#b3b3b3] mb-2.5">
            {/* Hidden until the viewer has given us a real signal (likes/history).
                computeMatch returns null otherwise, and "0%" would be a lie. */}
            {match !== null && (
              <>
                <span className="text-[#46d369] font-semibold">{match}%</span>
                <span className="text-white/25">·</span>
              </>
            )}
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] border border-white/25 px-1 py-px text-[#cfcfcf]">{item.rating}</span>
            <span className="text-white/25">·</span>
            <span>{item.type === 'movie' ? item.duration : `${item.seasonsCount || 1}S`}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(item);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-[#e6e6e6]"
              title="Play Stream"
            >
              <Play className="w-3.5 h-3.5 md:w-4 md:h-4 fill-black text-black ml-0.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMyList(item);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-black/40 text-white transition-colors hover:bg-black/80"
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
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-black/40 text-white transition-colors hover:bg-black/80"
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
              className="ml-auto hidden h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-black/40 text-white transition-colors hover:bg-black/80 min-[480px]:flex"
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

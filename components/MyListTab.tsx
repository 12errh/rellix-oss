'use client';

import React from 'react';
import { Plus, Play } from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { MovieCard } from './MovieCard';

interface MyListTabProps {
  items: MediaItem[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
  onBrowseExplore: () => void;
}

export function MyListTab({
  items,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
  onBrowseExplore,
}: MyListTabProps) {
  return (
    <div className="px-6 md:px-16 py-8 space-y-6 select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            My List
          </h1>
          <p className="text-xs text-[#8c8c8c] mt-1">
            {items.length} {items.length === 1 ? 'title' : 'titles'} saved to watch later
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#737373]">
            <Plus className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Your list is empty</h3>
          <p className="text-xs text-[#8c8c8c] leading-relaxed">
            Explore movies, anime, and series. Click the &quot;+&quot; icon on any title to save it to your personal watchlist.
          </p>
          <button
            onClick={onBrowseExplore}
            className="px-6 py-2.5 bg-[#E50914] hover:bg-[#b80710] text-white text-xs font-bold rounded-md transition-all shadow-lg"
          >
            Explore Movies & Shows
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
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
    </div>
  );
}

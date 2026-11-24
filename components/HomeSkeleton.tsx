'use client';

import React from 'react';

export function HomeSkeleton() {
  return (
    <div className="space-y-8 animate-pulse pb-16">
      <div className="w-full min-h-[580px] md:min-h-[660px] bg-[#1a1a1a]">
        <div className="max-w-2xl px-6 md:px-16 pt-40 space-y-4">
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-12 w-3/4 bg-white/10 rounded" />
          <div className="h-4 w-1/2 bg-white/10 rounded" />
          <div className="h-20 w-full bg-white/10 rounded" />
          <div className="flex gap-3 pt-2">
            <div className="h-10 w-28 bg-white/15 rounded" />
            <div className="h-10 w-32 bg-white/10 rounded" />
          </div>
        </div>
      </div>

      {[0, 1, 2].map((row) => (
        <div key={row} className="px-6 md:px-16 space-y-4">
          <div className="h-6 w-56 bg-white/10 rounded" />
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="shrink-0 w-[140px] sm:w-[170px] md:w-[200px] aspect-[2/3] bg-[#1f1f1f] rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

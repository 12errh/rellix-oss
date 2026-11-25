'use client';

import React from 'react';

/**
 * First-paint skeleton. It mirrors the editorial hero's baseline (text anchored
 * to the bottom, masthead above the title) so the swap to live data does not
 * move the page.
 */
export function HomeSkeleton() {
  return (
    <div className="animate-pulse pb-24">
      <div className="relative flex min-h-[600px] items-end bg-[#161616] md:min-h-[680px] lg:min-h-[740px]">
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/80 to-transparent" />
        <div className="relative w-full px-6 pb-14 md:px-16 md:pb-20">
          <div className="max-w-[44rem] space-y-5">
            <div className="h-3 w-52 bg-white/[0.07]" />
            <div className="h-12 w-3/4 bg-white/[0.08] md:h-16" />
            <div className="h-3 w-1/2 bg-white/[0.06]" />
            <div className="h-16 w-full max-w-xl bg-white/[0.05]" />
            <div className="flex gap-2.5 pt-1">
              <div className="h-10 w-32 bg-white/[0.12]" />
              <div className="h-10 w-28 border border-white/10" />
            </div>
            <div className="flex gap-3 pt-4">
              <div className="h-[3px] w-10 bg-white/20" />
              <div className="h-[3px] w-5 bg-white/10" />
              <div className="h-[3px] w-5 bg-white/10" />
            </div>
          </div>
        </div>
      </div>

      {[0, 1, 2].map((row) => (
        <div key={row} className="px-6 pt-8 pb-1 md:px-16">
          <div className="mb-4 flex items-baseline justify-between gap-6 border-b border-white/10 pb-2.5">
            <div className="h-4 w-56 bg-white/[0.08]" />
            <div className="h-3 w-16 bg-white/[0.05]" />
          </div>
          <div className="flex gap-3 overflow-hidden md:gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="aspect-[2/3] w-[140px] shrink-0 bg-white/[0.045] sm:w-[170px] md:w-[200px]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

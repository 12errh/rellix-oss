'use client';

import React, { type Ref } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadMoreSentinelProps {
  /**
   * The intersection target. Must stay mounted for auto-scroll to keep working.
   *
   * `usePagedFeed` now returns a callback ref (the target mounts conditionally,
   * so a ref object attached later would never be observed). A callback ref is
   * assignable here and to a plain `ref={...}` on a div.
   */
  sentinelRef: Ref<HTMLDivElement>;
  isLoadingMore: boolean;
  /** False once there is genuinely nothing more — the button then disappears. */
  hasMore: boolean;
  onLoadMore: () => void;
  /** Below this many titles the button is noise; the grid has barely started. */
  itemCount: number;
  minItems?: number;
  label?: string;
  /**
   * Shown once the feed is genuinely finished. Deliberately opt-in: most tabs
   * render nothing at the end, and an "end of catalogue" note in five places
   * is noise. TV shows shows it because that grid is explicitly finite.
   */
  endMessage?: string;
}

/**
 * The "Load More" control shared by every paged grid.
 *
 * This exists because the control was previously inlined in five places
 * (AnimeTab, BrowserTab, MoviesTab, TVShowsTab, SearchTab) and they drifted:
 * each gated the button on `hasMore` while the shared loader independently
 * refused to fetch past its page ceiling. The result was a button that stayed
 * on screen and did nothing when clicked.
 *
 * Two behaviours matter here:
 *
 *  1. **The button never unmounts while loading.** Previously `isLoadingMore`
 *     swapped it for a block of skeleton cards, so the row changed height
 *     under the pointer and a click landing in that window was silently
 *     dropped — the button looked present in the DOM but was not there. Now it
 *     stays exactly where it is, disabled, with a spinner. A click that
 *     arrives mid-load is visibly ignored instead of mysteriously ignored.
 *
 *  2. **It disappears only when there is truly nothing more.** `hasMore` is
 *     cleared by the loader when a page yields zero new ids, so the control's
 *     visibility and the loader's capability are the same fact — they can no
 *     longer disagree.
 *
 * A real <button> on purpose: this app is driven by a TV remote, so it has to
 * be reachable and focusable by keyboard/D-pad, not a styled <div>.
 */
export function LoadMoreSentinel({
  sentinelRef,
  isLoadingMore,
  hasMore,
  onLoadMore,
  itemCount,
  minItems = 12,
  label = 'Load More',
  endMessage,
}: LoadMoreSentinelProps) {
  const showButton = hasMore && itemCount >= minItems;

  return (
    <div ref={sentinelRef} className="py-8 flex flex-col items-center justify-center">
      {showButton ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          aria-busy={isLoadingMore}
          className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E50914] disabled:cursor-progress disabled:opacity-70 text-white rounded-full text-xs font-bold transition-all border border-white/10"
        >
          {isLoadingMore ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              <span>Loading…</span>
            </>
          ) : (
            <span>{label}</span>
          )}
        </button>
      ) : (
        !hasMore &&
        endMessage && (
          <div className="text-xs text-[#737373] text-center pt-4">{endMessage}</div>
        )
      )}
    </div>
  );
}
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MediaItem } from '@/types/movie';

interface PageResult {
  items: MediaItem[];
  hasMore: boolean;
}

/**
 * Safety ceiling on pages, mirroring the server's own cap (lib/tmdb.ts sets
 * `hasMore: page < total_pages && page < 20`).
 *
 * This used to be 6, which was lower than the server's limit. That was the bug
 * behind "Load More stops working": the hook refused to fetch past page 6 while
 * every tab rendered its button on `hasMore` alone, so after ~120 titles the
 * button was still on screen, `hasMore` was still true, and every click and
 * every scroll hit a silent early-return. A client ceiling MUST NOT be tighter
 * than the server's, or the client dead-ends on a feed that still has pages.
 */
const MAX_PAGES = 20;

/**
 * Infinite-scroll feed.
 *
 * `enabled` defers the page-1 fetch until the consumer says so. The home screen
 * uses this so only the rails near the viewport hit TMDB — previously every rail
 * fired on mount, so a long home page issued a dozen parallel requests before
 * the user had scrolled anywhere. The sentinel observer is only attached once
 * enabled, so a hidden rail also does not prefetch its next page.
 */
export function usePagedFeed(
  fetchPage: (page: number) => Promise<PageResult>,
  seed: MediaItem[] = [],
  enabled = true
) {
  const [extra, setExtra] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingFirst, setIsLoadingFirst] = useState(true);
  // The observer target is state, not a ref object, because the target is
  // mounted conditionally (rails render a shimmer until their first page
  // lands). A ref object attached after mount never re-runs the effect; a
  // callback-ref state does.
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => setSentinelEl(el), []);
  // The observer can fire again while a page is still in flight; without this
  // guard several pages are requested at once and arrive out of order.
  const inFlightRef = useRef(false);
  // Bumped whenever the fetcher identity/enabled state changes. A page-2 (or
  // later) response from the previous query must not append itself to the new
  // grid.
  const generationRef = useRef(0);

  const items = useMemo(() => {
    const combined = [...seed, ...extra];
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [seed, extra]);

  // Re/load page 1 whenever the fetcher changes (filters/sort) or the rail
  // scrolls into view. Seed items are deduped by id.
  useEffect(() => {
    if (!enabled) return;
    const generation = ++generationRef.current;
    let cancelled = false;
    // Block loadMore until the reset below has run, so the sentinel cannot
    // request page N of the previous filter against the new fetcher.
    inFlightRef.current = true;
    // Do not keep the previous filter's rows or loading state on screen while
    // the new first page is in flight: that made a filter change look like a
    // no-op, then swap the whole grid at once. The reset runs one tick later to
    // avoid a synchronous setState inside the effect (cascading renders), and
    // always before the new response can land.
    const reset = setTimeout(() => {
      if (cancelled || generation !== generationRef.current) return;
      setExtra([]);
      setPage(1);
      setHasMore(true);
      setIsLoadingFirst(true);
      setIsLoadingMore(false);
      fetchPage(1)
        .then((result) => {
          if (cancelled || generation !== generationRef.current) return;
          inFlightRef.current = false;
          setExtra(result.items);
          setPage(1);
          setHasMore(result.hasMore);
          setIsLoadingFirst(false);
        })
        .catch(() => {
          if (cancelled || generation !== generationRef.current) return;
          inFlightRef.current = false;
          setIsLoadingFirst(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(reset);
    };
  }, [fetchPage, enabled]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoadingFirst || !hasMore || !enabled || page >= MAX_PAGES) return;
    if (inFlightRef.current) return;
    const generation = generationRef.current;
    inFlightRef.current = true;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await fetchPage(nextPage);
      if (generation !== generationRef.current) return;
      // De-duplicate against what is already on screen. A popularity-sorted
      // list reorders between requests, so a page routinely contains a few ids
      // we have already rendered — that is normal and must not end the feed.
      // Only a page that yields NO new ids means there is genuinely nothing
      // more, and that (plus hasMore) is the only end-of-feed signal.
      //
      // Previously any duplicate set hasMore=false, so one overlapping page
      // silently truncated the feed at an arbitrary point.
      const seen = new Set(items.map((i) => i.id));
      const fresh = result.items.filter((i) => !seen.has(i.id));
      if (fresh.length > 0) {
        setExtra((prev) => [...prev, ...fresh]);
        setPage(nextPage);
        // Keep hasMore honest: false as soon as we stop adding anything, so the
        // Load More control disappears instead of offering a dead click.
        setHasMore(result.hasMore && nextPage < MAX_PAGES);
      } else {
        setHasMore(false);
      }
    } catch {
      if (generation === generationRef.current) setHasMore(false);
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [hasMore, isLoadingMore, isLoadingFirst, page, fetchPage, enabled, items]);

  // Keep the observer's callback pointed at the newest `loadMore`. If the
  // effect depended on `loadMore` directly it would be torn down and rebuilt on
  // every state change — and a rebuild re-reports the target's current
  // intersection immediately, which is what turned "one page when you reach the
  // end" into a chain of twenty requests without any scrolling.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    if (!enabled || !sentinelEl) return;

    // `armed` allows exactly one automatic page per approach. The observer only
    // re-fires after the target leaves the root margin, i.e. when new items
    // pushed it away and the visitor scrolled back down. A page that adds too
    // little height to move the target stays put, and the visible Load More
    // button is the fallback — no runaway requests either way.
    let armed = true;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!entry.isIntersecting) {
          armed = true;
          return;
        }
        if (!armed) return;
        armed = false;
        void loadMoreRef.current();
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [enabled, sentinelEl]);

  return { items, hasMore, isLoadingMore, isLoadingFirst, loadMore, sentinelRef };
}

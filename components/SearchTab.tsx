'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Film, Tv, Orbit, Loader2, X, Clock, Trash2 } from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { MovieCard } from './MovieCard';
import { LoadMoreSentinel } from './LoadMoreSentinel';
import { fuzzySuggestions, searchRankScore } from '@/lib/fuzzy-search';
import { mediaFetch } from '@/lib/client-media';

interface SearchTabProps {
  initialQuery?: string;
  allMedia: MediaItem[];
  profileId?: string;
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
}

const RECENT_KEY = (profileId?: string) => `rellix_recent_${profileId || 'guest'}`;

export function SearchTab({
  initialQuery = '',
  allMedia,
  profileId,
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
}: SearchTabProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<MediaItem[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  /**
   * Staged search flow — the fix for "the dropdown and the search page are
   * both searching".
   *
   * Two engines used to run together: the dropdown (suggestions) fetched per
   * keystroke AND the results grid fetched per keystroke underneath it, so the
   * page was a dropdown floating over results that kept re-rendering. Now the
   * engines are staged:
   *
   *   idle      query empty          -> browse catalogue (refreshed), chips
   *   typing    input has text       -> ONLY the suggestion dropdown; the body
   *                                     shows a quiet hint, no grid, no filters
   *   submitted Enter / "Search for …" -> the full results grid for exactly
   *                                     that query (filters, Top Match, paging)
   *
   * `resultsDone` marks that the submitted search's response has landed, so a
   * genuine zero-result search shows "No matches found" instead of falling
   * back into the browse view.
   */
  const [resultsDone, setResultsDone] = useState(false);

  // Keep the SearchTab query in sync when the navbar search box drives it
  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);
  if (initialQuery !== lastInitialQuery) {
    setLastInitialQuery(initialQuery);
    setQuery(initialQuery);
  }
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY(profileId));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  /**
   * Autocomplete dropdown ("guesses while you type").
   *
   * Independent of the main search: a faster debounce (typing feels live), a
   * lighter endpoint (no certifications, page 1 only), and click-to-open — a
   * suggestion jumps straight into the details modal instead of rerunning the
   * search. Keyboard users navigate with ArrowUp/ArrowDown; Enter selects the
   * highlighted row, Escape dismisses the dropdown.
   */
  const [suggestions, setSuggestions] = useState<MediaItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const suggestRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Focus on demand, not just on mount.
   *
   * The navbar's search button navigates here and fires this event. `autoFocus`
   * only runs when the input first mounts, so without this a click while the user
   * is already on the search tab would navigate nowhere and leave the caret
   * wherever it was.
   */
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('rellix:focus-search', focus);
    return () => window.removeEventListener('rellix:focus-search', focus);
  }, []);

  const saveRecent = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setRecentSearches((prev) => {
        const updated = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
        try {
          localStorage.setItem(RECENT_KEY(profileId), JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [profileId]
  );

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_KEY(profileId));
    } catch {}
  }, [profileId]);

  /**
   * Changing the type filter resets pagination and clears the genre chip.
   *
   * Done here rather than inside the fetch effect: doing it in the effect meant
   * a synchronous setState on every run, which cascades an extra render and —
   * worse — fought the in-flight request that was about to set the same values.
   * The genre chip is cleared because availableGenres is derived from the
   * current results, so a genre that only existed under the previous type would
   * silently match nothing.
   */
  const applyFilter = useCallback((next: 'all' | 'movie' | 'tv' | 'anime') => {
    setFilterType(next);
    setPage(1);
    setHasMore(true);
    setGenreFilter(null);
  }, []);

  /**
   * Which content types to pull when there is no query.
   *
   * This was hardcoded to `type=movie`, which is why the TV Shows and Anime
   * filters rendered "No matches found": liveResults held movies only, and
   * displayMedia prefers liveResults over the local catalogue, so filtering to
   * tv/anime matched nothing. /api/media/browse already supports type=tv and
   * type=anime — the client just never asked for them.
   *
   * "All Results" merges all three so the default view is genuinely a mix
   * rather than 20 films.
   */
  const browseTypes = useMemo<Array<'movie' | 'tv' | 'anime'>>(
    () => (filterType === 'all' ? ['movie', 'tv', 'anime'] : [filterType]),
    [filterType]
  );

  const mergeById = (groups: MediaItem[][]): MediaItem[] => {
    const seen = new Set<string>();
    const out: MediaItem[] = [];
    for (const group of groups) {
      for (const item of group) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  };

  // Debounced live fetch when the query is EMPTY: the idle browse catalogue.
  //
  // The non-empty branch that used to live here (debounced full search per
  // keystroke) is gone on purpose: under the staged flow, typing runs ONLY the
  // suggestion engine (below), and the full search fires on explicit submit via
  // runSearch(). That is what stops the dropdown and the results grid from both
  // searching at once.
  useEffect(() => {
    if (query.trim()) return;
    // Every return to the idle surface starts a fresh browse feed. Without
    // this, paging state from a previous search (or a different type filter)
    // leaked in: Load More could be hidden, or jump to a page number the new
    // feed never fetched.
    const reset = setTimeout(() => {
      setResultsDone(false);
      setSubmittedQuery('');
      setPage(1);
      setHasMore(true);
    }, 0);
    const controller2 = new AbortController();
    (async () => {
      try {
        const responses = await Promise.all(
          browseTypes.map((t) =>
            mediaFetch(`/api/media/browse?type=${t}&page=1`, { signal: controller2.signal })
          )
        );
        const payloads = await Promise.all(
          responses.map((res) => (res.ok ? res.json() : null))
        );
        if (controller2.signal.aborted) return;
        const merged = mergeById(
          payloads.map((data) => (Array.isArray(data?.items) ? data.items : []))
        );
        if (merged.length > 0) {
          setLiveResults(merged);
          setSubmittedQuery('');
          setHasMore(payloads.some((data) => Boolean(data?.hasMore)));
        }
      } catch {}
    })();
    return () => {
      clearTimeout(reset);
      controller2.abort();
    };
  }, [query, browseTypes]);

  /**
   * Live suggestions, debounced tighter than the main search so the dropdown
   * tracks keystrokes. Aborted per keystroke: only the last prefix's response
   * may land, and an out-of-order older response must not overwrite it. Hidden
   * entirely below 2 characters — one-letter dropdowns are noise.
   */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // Reset through a timer rather than synchronous setState-in-effect (the
      // cascading-render lint rule); the dropdown is willing to wait a tick.
      const clear = setTimeout(() => {
        setSuggestions([]);
        setShowSuggestions(false);
        setHighlight(-1);
      }, 0);
      return () => clearTimeout(clear);
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await mediaFetch(`/api/media/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`suggest_${res.status}`);
        const data = await res.json();
        const items: MediaItem[] = Array.isArray(data.items) ? data.items : [];
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
        setHighlight(-1);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          // learned nothing; keep quiet rather than showing stale guesses
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /** Suggestion chosen: open the title directly, dropdown gone. */
  const chooseSuggestion = useCallback(
    (item: MediaItem) => {
      setShowSuggestions(false);
      setSuggestions([]);
      saveRecent(item.title);
      onOpenDetails(item);
    },
    [saveRecent, onOpenDetails]
  );

  const searchAbortRef = useRef<AbortController | null>(null);

  /**
   * EXPLICIT full search — the "submit" half of the staged flow.
   *
   * Runs only from Enter in the input or the "Search for …" row in the
   * dropdown. Never from keystrokes: that race (dropdown re-searching above a
   * grid that is also re-searching) is exactly what the staged flow removed.
   * A new submit supersedes an in-flight one via the abort ref, and the typed
   * suggestions are invalidated so refocusing the input cannot reopen the
   * dropdown on top of the results.
   */
  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setPage(1);
    setHasMore(true);
    setGenreFilter(null);
    setResultsDone(false);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
    setSubmittedQuery(q);
    saveRecent(q);

    try {
      const res = await mediaFetch(`/api/media/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`search_${res.status}`);
      const data = await res.json();
      if (controller.signal.aborted) return;
      setLiveResults(data.results && Array.isArray(data.results) ? data.results : []);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        // Leave the previous state; with no results the grid shows its
        // "No matches found" empty state rather than a fake success.
        setLiveResults([]);
      }
    } finally {
      if (searchAbortRef.current === controller) {
        setResultsDone(true);
        setIsSearching(false);
      }
    }
  }, [query, saveRecent]);

  /**
   * Safety ceiling, mirroring the server's own cap. This was 6 — lower than
   * the server's limit — while the button rendered on `hasMore` alone. Same
   * dead-button bug as `usePagedFeed`: past page 6 the control stayed on screen
   * and every click hit this early-return.
   */
  const MAX_PAGES = 20;

  // Infinite scroll loader for search results and the idle browse grid.
  const loadMoreSearchResults = useCallback(async () => {
    if (isLoadingMore || !hasMore || isSearching) return;
    if (page >= MAX_PAGES) return;
    const idle = query.trim() === '';
    if (!idle && submittedQuery !== query.trim()) return;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      let incomingItems: MediaItem[] = [];
      let nextHasMore = false;

      if (idle) {
        // The "All Results" surface is a merge of movies, TV and anime. Paging
        // only browseTypes[0] made Load More append movies to a mixed grid and
        // silently omitted the next TV/anime pages.
        const responses = await Promise.all(
          browseTypes.map((t) =>
            mediaFetch(`/api/media/browse?type=${t}&page=${nextPage}`)
          )
        );
        const payloads = await Promise.all(
          responses.map((res) => (res.ok ? res.json() : null))
        );
        incomingItems = mergeById(
          payloads.map((data) => (Array.isArray(data?.items) ? data.items : []))
        );
        nextHasMore = payloads.some((data) => Boolean(data?.hasMore));
      } else {
        const res = await mediaFetch(
          `/api/media/search?q=${encodeURIComponent(query.trim())}&page=${nextPage}`
        );
        if (res.ok) {
          const data = await res.json();
          incomingItems = Array.isArray(data.results) ? data.results : [];
          nextHasMore = Boolean(data.hasMore);
        }
      }

      // De-dupe against what is already rendered. A page containing only ids
      // we already have is the true end-of-feed signal; a page with *some*
      // overlap is normal on popularity-sorted results and must not stop the
      // feed, which is what stopped it early and at a random point.
      const seen = new Set(liveResults.map((m) => m.id));
      const fresh = incomingItems.filter((m) => !seen.has(m.id));

      if (fresh.length > 0) {
        setLiveResults((prev) => {
          const rendered = new Set(prev.map((m) => m.id));
          return [...prev, ...incomingItems.filter((m) => !rendered.has(m.id))];
        });
        setPage(nextPage);
        // hasMore must go false the moment we stop adding anything, so the
        // button and the loader can never disagree about whether more exists.
        setHasMore(nextHasMore && nextPage < MAX_PAGES);
      } else {
        setHasMore(false);
      }
    } catch {
      // keep the current page; the control remains available for a retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, isSearching, page, query, submittedQuery, browseTypes, liveResults]);


  /**
   * Which surface is on screen. Only these two ever render the results grid:
   *   idleBrowse   — query empty: the browse catalogue (or static catalog
   *                  pre-fetch while browse is inbound)
   *   resultsActive— an explicitly submitted query whose response HAS landed
   * Everything else (typing, a superseded resultset, a search still in
   * flight) renders the quiet hint card instead — never a grid racing under
   * the suggestion dropdown.
   */
  const idleBrowse = query.trim() === '';
  const resultsActive = !idleBrowse && submittedQuery === query.trim() && resultsDone;

  // Combine live results or fallback to catalog
  const displayMedia = useMemo(() => {
    // Recomputed inside so the hook actually READS its deps (resultsDone and
    // submittedQuery) — the outer constants only gate the render, the memo
    // must react to the same flags.
    const idle = query.trim() === '';
    const active = !idle && submittedQuery === query.trim() && resultsDone;
    // Only the two grid surfaces read liveResults. Everything else falls back
    // to the static catalog for filters/counts, though it is not rendered.
    let source = idle || active ? liveResults : allMedia;

    source = source.filter((item) => {
      const matchesType = filterType === 'all' || item.type === filterType;
      if (!matchesType) return false;
      if (genreFilter && !item.genres.some((g) => g === genreFilter)) return false;

      if (!query.trim() || idle || (active && liveResults.length > 0)) return true;

      // Fuzzy title matching first (searchRankScore is typo-tolerant per token:
      // "bhoot" ranks "Bhooth Bangla"), with plain substring fallbacks for
      // the overview/genre/actor queries the title scorer is not built for.
      const q = query.toLowerCase();
      return (
        searchRankScore(item, query) > 0 ||
        item.title.toLowerCase().includes(q) ||
        item.overview.toLowerCase().includes(q) ||
        item.genres.some((g) => g.toLowerCase().includes(q)) ||
        item.cast.some((c) => c.toLowerCase().includes(q))
      );
    });

    // Rank by the shared scorer so the "Top Match" hero card is the closest
    // title, not just the first item the API returned. Score-0 items (cast- or
    // genre-only matches) keep their original relative order, so an actor
    // search preserves the API's own ordering.
    if (query.trim() && active) {
      source = source
        .map((item, i) => ({ item, i, s: searchRankScore(item, query) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((entry) => entry.item);
    }
    return source;
  }, [allMedia, liveResults, submittedQuery, query, filterType, genreFilter, resultsDone]);

  // Available genres derived from current results
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        // Nothing on screen means the current filters match nothing. Paging
        // cannot fix that, and fetching anyway is what made the skeleton loop.
        if (displayMedia.length === 0) return;
        loadMoreSearchResults();
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreSearchResults, displayMedia.length]);

  const availableGenres = useMemo(() => {
    const source = liveResults.length > 0 ? liveResults : allMedia;
    const counts = new Map<string, number>();
    source.forEach((m) => m.genres.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g);
  }, [liveResults, allMedia]);

  const topMatch = query.trim() && displayMedia.length > 0 ? displayMedia[0] : null;
  const restMatches = topMatch ? displayMedia.slice(1) : displayMedia;

  const trendingChips = useMemo(
    () => allMedia.filter((m) => m.isTrending || m.isNewRelease).slice(0, 8),
    [allMedia]
  );

  const handleSubmit = () => {
    if (query.trim()) saveRecent(query);
  };

  return (
    <div className="px-6 md:px-16 py-8 space-y-6 select-none">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Search</h1>
        <p className="text-xs text-[#8c8c8c] mt-1">Find movies, TV shows, and anime across the catalogue.</p>
      </div>

      {/* Search Input Bar */}
      <div className="max-w-3xl relative">
        <div className="relative flex items-center gap-3 bg-[#1b1b1b] border border-white/10 rounded-2xl px-4 py-4 shadow-2xl focus-within:border-[#E50914] focus-within:shadow-[0_0_0_4px_rgba(229,9,20,0.12)] transition-all">
          <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <Search className="w-4 h-4 text-[#a3a3a3]" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (showSuggestions && suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, -1));
                  return;
                }
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                  return;
                }
                if (e.key === 'Enter' && highlight >= 0) {
                  e.preventDefault();
                  chooseSuggestion(suggestions[highlight]);
                  return;
                }
              }
              if (e.key === 'Enter') {
                // The submit half of the staged flow — the ONLY way the results
                // grid (re)enters.
                e.preventDefault();
                runSearch();
              }
            }}
            onBlur={() => {
              handleSubmit();
              // Closed on blur, with just enough delay that a click on a
              // suggestion row (mousedown fires before blur) always wins.
              // Rows also preventDefault on mousedown, so focus never leaves.
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            onFocus={() => {
              if (query.trim().length >= 2 && suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Titles, people, genres..."
            autoFocus
            className="bg-transparent text-white placeholder-[#737373] text-sm md:text-lg focus:outline-none w-full"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-[#E50914] animate-spin shrink-0" />
          )}
          {query && (
            <button
              onClick={() => {
                searchAbortRef.current?.abort();
                searchAbortRef.current = null;
                setQuery('');
                setLiveResults([]);
                setGenreFilter(null);
                setPage(1);
                setHasMore(true);
                setResultsDone(false);
                setSubmittedQuery('');
                setIsSearching(false);
              }}
              className="w-7 h-7 rounded-full bg-white/10 text-[#a3a3a3] hover:text-white text-xs flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>

        {/* Autocomplete dropdown: guessed titles with posters, click to open */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#6b6b6b]">
              Suggestions · Movie / TV / Anime
            </p>
            <div ref={suggestRef} className="no-scrollbar max-h-[380px] overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  onMouseDown={(e) => {
                    // Selection is committed on mousedown so it happens before
                    // the input's blur can dismiss the dropdown underneath it.
                    e.preventDefault();
                    chooseSuggestion(s);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === highlight ? 'bg-[#E50914]/15' : 'hover:bg-white/5'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.posterUrl}
                    alt=""
                    className="h-16 w-11 shrink-0 rounded object-cover bg-[#1f1f1f]"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#8c8c8c]">
                      {s.releaseYear} • {s.type === 'anime' ? 'Anime' : s.type === 'tv' ? 'TV Show' : 'Movie'}
                      {s.genres.length > 0 ? ` • ${s.genres.slice(0, 2).join(', ')}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#E50914]/80">
                    Open
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 bg-[#0f0f0f]">
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#E50914]/10"
              >
                <Search className="h-4 w-4 shrink-0 text-[#E50914]" />
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  Search for <span className="font-bold text-[#d4d4d4]">“{query.trim()}”</span>
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Searches */}
      {recentSearches.length > 0 && !query.trim() && (
        <div className="flex items-center flex-wrap gap-2">
          <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#737373] mr-1">
            <Clock className="w-3 h-3" /> Recent
          </span>
          {recentSearches.map((r) => (
            <button
              key={r}
              onClick={() => setQuery(r)}
              className="px-3.5 py-1.5 rounded-full text-xs bg-[#1f1f1f] border border-white/10 text-[#d4d4d4] hover:border-[#E50914]/60 hover:text-white hover:bg-[#E50914]/10 transition-all"
            >
              {r}
            </button>
          ))}
          <button
            onClick={clearRecent}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-[#737373] hover:text-red-400 transition-colors"
            title="Clear search history"
          >
            <Trash2 className="w-3 h-3" /> Clear history
          </button>
        </div>
      )}

      {/* Trending Chips */}
      {!query.trim() && trendingChips.length > 0 && (
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#737373] mr-1">Trending</span>
          {trendingChips.map((m) => (
            <button
              key={m.id}
              onClick={() => setQuery(m.title)}
              className="px-3.5 py-1.5 rounded-full text-xs bg-[#E50914]/10 border border-[#E50914]/30 text-white hover:bg-[#E50914]/20 transition-all"
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      {/* Typing surface — the staged flow's third state. While the input has
          text but nothing has been submitted, show a quiet hint instead of a
          grid that would be racing the dropdown for attention. It sits OUTSIDE
          the grid-surfaces gate below: the two are mutually exclusive. */}
      {!idleBrowse && !resultsActive && (
        <div className="min-h-[200px] rounded-2xl border border-white/10 bg-[#161616]/60 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-white">
            {isSearching ? `Searching for “${query.trim()}”…` : `Search for “${query.trim()}”`}
          </p>
          <p className="mt-2 text-xs text-[#8c8c8c]">
            Press{' '}
            <kbd className="rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#d4d4d4]">
              Enter
            </kbd>{' '}
            to run the full search — or pick a suggestion above to open a title
            directly.
          </p>
        </div>
      )}

      {/* Grid surfaces: idle browse, or an explicitly submitted search. Filter
          tabs and genre chips belong to these surfaces only — while typing, the
          page must be the dropdown plus the quiet hint, nothing else. */}
      {(idleBrowse || resultsActive) && (
        <>
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
        <button
          onClick={() => applyFilter('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            filterType === 'all'
              ? 'bg-white text-black border-white'
              : 'bg-[#222222] text-[#cccccc] border-white/10 hover:border-white/30'
          }`}
        >
          All Results ({displayMedia.length})
        </button>
        <button
          onClick={() => applyFilter('movie')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            filterType === 'movie'
              ? 'bg-white text-black border-white'
              : 'bg-[#222222] text-[#cccccc] border-white/10 hover:border-white/30'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Movies</span>
        </button>
        <button
          onClick={() => applyFilter('tv')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            filterType === 'tv'
              ? 'bg-white text-black border-white'
              : 'bg-[#222222] text-[#cccccc] border-white/10 hover:border-white/30'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>TV Shows</span>
        </button>
        <button
          onClick={() => applyFilter('anime')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            filterType === 'anime'
              ? 'bg-white text-black border-white'
              : 'bg-[#222222] text-[#cccccc] border-white/10 hover:border-white/30'
          }`}
        >
          <Orbit className="w-3.5 h-3.5 text-[#E50914]" />
          <span>Anime</span>
        </button>
      </div>

      {/* Genre Chips */}
      {availableGenres.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setGenreFilter(null)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              genreFilter === null
                ? 'bg-[#E50914] text-white border-[#E50914]'
                : 'bg-[#1f1f1f] text-[#a3a3a3] border-white/10 hover:border-white/30'
            }`}
          >
            All Genres
          </button>
          {availableGenres.map((g) => (
            <button
              key={g}
              onClick={() => setGenreFilter(genreFilter === g ? null : g)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all whitespace-nowrap ${
                genreFilter === g
                  ? 'bg-[#E50914] text-white border-[#E50914]'
                  : 'bg-[#1f1f1f] text-[#a3a3a3] border-white/10 hover:border-white/30'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#8c8c8c]">
            {query
              ? `Results for "${query}"`
              : 'Explore Complete Catalogue'}{' '}
            ({displayMedia.length})
          </h3>
          {liveResults.length > 0 && (
            <span className="text-xs text-green-400 font-medium">Live TMDB results</span>
          )}
        </div>

        {/* Top Match */}
        {topMatch && query.trim() && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 p-4 bg-[#1a1a1a] border border-white/10 rounded-xl">
            <div
              onClick={() => onOpenDetails(topMatch)}
              className="relative w-32 sm:w-40 aspect-[2/3] rounded-lg overflow-hidden shrink-0 cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={topMatch.posterUrl} alt={topMatch.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#E50914]">Top Match</span>
              <h4 className="text-xl font-black text-white mt-1">{topMatch.title}</h4>
              <p className="text-xs text-[#a3a3a3] mt-1">
                {topMatch.releaseYear} • {topMatch.type === 'movie' ? topMatch.duration : `${topMatch.seasonsCount || 1} ${(topMatch.seasonsCount || 1) === 1 ? 'Season' : 'Seasons'}`} • {topMatch.rating}
              </p>
              <p className="text-sm text-[#cccccc] mt-2 line-clamp-2">{topMatch.overview}</p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => onPlay(topMatch)}
                  className="px-5 py-2 bg-white text-black text-xs font-bold rounded hover:bg-[#e6e6e6]"
                >
                  Play
                </button>
                <button
                  onClick={() => onOpenDetails(topMatch)}
                  className="px-5 py-2 bg-white/10 text-white text-xs font-bold rounded hover:bg-white/20 border border-white/10"
                >
                  Details
                </button>
              </div>
            </div>
          </div>
        )}

        {displayMedia.length === 0 ? (
          <div className="py-20 text-center text-[#737373]">
            <p className="text-base font-semibold text-white mb-1">
              {isSearching ? 'Searching streaming databases...' : 'No matches found'}
            </p>
            <p className="text-xs mb-4">Try a different title, genre, or actor.</p>
            {/* Typo tolerance: suggest closest matches from the in-app catalog */}
            {!isSearching && query.trim() && (() => {
              const suggestions = fuzzySuggestions(allMedia, query.trim(), 6);
              return suggestions.length > 0 ? (
                <div className="mt-6">
                  <p className="text-xs text-[#a3a3a3] mb-3 text-left">
                    Did you mean any of these?
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {suggestions.map((item) => (
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
                </div>
              ) : null;
            })()}
            {!isSearching && trendingChips.length > 0 && (
              <div className="flex items-center justify-center flex-wrap gap-2">
                {trendingChips.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setQuery(m.title)}
                    className="px-3 py-1 rounded-full text-xs bg-[#E50914]/10 border border-[#E50914]/30 text-white hover:bg-[#E50914]/20"
                  >
                    {m.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {restMatches.map((item) => (
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
        </>
      )}

      {/* Infinite Scroll Sentinel — inside the grid surfaces too: sentinels and
          "Load More" controls are meaningless on the typing surface, and their
          loadMore guard (submittedQuery check) already blocks stray fetches. */}
      {(idleBrowse || resultsActive) && (
        <LoadMoreSentinel
          sentinelRef={sentinelRef}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMoreSearchResults}
          itemCount={displayMedia.length}
          label="Load More"
        />
      )}
    </div>
  );
}

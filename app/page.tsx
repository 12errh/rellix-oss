'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Sidebar,
  NavTab,
} from '@/components/Sidebar';
import { TopNavbar } from '@/components/TopNavbar';
import { MobileNav } from '@/components/MobileNav';
import { HeroCarousel } from '@/components/HeroCarousel';
import { Top10Row } from '@/components/Top10Row';
import { MovieRow } from '@/components/MovieRow';
import { HomeSections } from '@/components/HomeSections';
import { HomeSkeleton } from '@/components/HomeSkeleton';
import { ProfileGateSkeleton } from '@/components/ProfileGateSkeleton';
import { WhoIsWatching } from '@/components/profiles/WhoIsWatching';
import { PinEntry } from '@/components/profiles/PinEntry';
import { Onboarding } from '@/components/Onboarding';
import { SearchTab } from '@/components/SearchTab';
import { AnimeTab } from '@/components/AnimeTab';
import { MoviesTab } from '@/components/MoviesTab';
import { TVShowsTab } from '@/components/TVShowsTab';
import { MyListTab } from '@/components/MyListTab';
import { BrowserTab } from '@/components/BrowserTab';
/**
 * The player and details modals are the two heaviest components in the bundle
 * (603 and 462 lines, plus the lib/embed-urls provider plumbing) and
 * both are conditional renders that most visits never open. Statically imported,
 * they shipped to every visitor. Code-split so they load on first open.
 *
 * ssr:false because the player reads `window` at render time (fullscreen and
 * iframe capabilities) and must not be server-rendered.
 */
const VideoPlayerModal = dynamic(
  () => import('@/components/VideoPlayerModal').then((m) => m.VideoPlayerModal),
  { ssr: false }
);
const MediaDetailsModal = dynamic(
  () => import('@/components/MediaDetailsModal').then((m) => m.MediaDetailsModal),
  { ssr: false }
);

import {
  MediaItem,
  UserProfile,
} from '@/types/movie';
import {
  TOP_10_SHOWS,
  LATEST_MOVIES,
  POPULAR_ANIME,
  ACCLAIMED_TV_SHOWS,
  ALL_MEDIA,
} from '@/lib/movies-data';
import { browserDB } from '@/lib/db';
import { setKidMode } from '@/lib/kid-safe';
import { buildTasteProfile, topGenresFrom } from '@/lib/taste';
import { TasteProvider } from '@/components/TasteProvider';
import { genreIdFor } from '@/lib/genres';
import type { HomeRail } from '@/lib/home-rails';
import { setActiveProfileMemory, getActiveProfileMemory, getActiveProfileIdSession, setActiveProfileIdSession } from '@/lib/profile-session';
import { DEFAULT_MAX_PROFILES } from '@/lib/profile-limits';
import { mediaFetch } from '@/lib/client-media';

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [pinTarget, setPinTarget] = useState<UserProfile | null>(null);

  // Modals state
  const [activeStreamMedia, setActiveStreamMedia] = useState<MediaItem | null>(null);
  const [activeStreamSeason, setActiveStreamSeason] = useState(1);
  const [activeStreamEpisode, setActiveStreamEpisode] = useState(1);
  const [selectedDetailsMedia, setSelectedDetailsMedia] = useState<MediaItem | null>(null);

  const handleStartStream = useCallback((media: MediaItem, season?: number, episode?: number) => {
    // Every card, hero slide and Continue Watching entry routes through here.
    // Explicit season/episode values come from the details modal; otherwise use
    // the saved position for this profile. Without this, cards started TV at
    // whatever season the last details-modal playback left in state.
    const nextSeason = season ?? (media.type === 'movie' ? 1 : media.continueWatchingSeason ?? 1);
    const nextEpisode = episode ?? (media.type === 'movie' ? 1 : media.continueWatchingEpisode ?? 1);
    setActiveStreamMedia(media);
    setActiveStreamSeason(nextSeason);
    setActiveStreamEpisode(nextEpisode);
  }, []);

  // Dynamic user data backed by browser database (IndexedDB + LocalStorage)
  const [myListItems, setMyListItems] = useState<MediaItem[]>([]);
  const myListIds = useMemo(() => myListItems.map((item) => item.id), [myListItems]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [rawContinueWatching, setRawContinueWatching] = useState<MediaItem[]>([]);
  // Seeded with the local catalogue rather than empty.
  //
  // These were empty until /api/media/latest resolved, and the home tab is gated
  // on that call — so a cold TMDB response meant a skeleton for the entire tab.
  // Seeding means there is always something to render, and loadHomeFeed() simply
  // upgrades these to live TMDB data when it arrives. This is the same data the
  // route already falls back to when TMDB fails, so it is not a new state the UI
  // has to handle — just one that arrives sooner.
  const [latestMovies, setLatestMovies] = useState<MediaItem[]>(LATEST_MOVIES);
  const [latestTV, setLatestTV] = useState<MediaItem[]>(ACCLAIMED_TV_SHOWS);
  const [latestAnime, setLatestAnime] = useState<MediaItem[]>(POPULAR_ANIME);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [top10Movies, setTop10Movies] = useState<MediaItem[]>([]);
  const [top10TV, setTop10TV] = useState<MediaItem[]>([]);
  const maxProfiles = DEFAULT_MAX_PROFILES;

  // Rail pagination state for Home screen

  // Load from Browser DB (IndexedDB)
  const loadProfileData = useCallback(async (profileId: string) => {
    try {
      const [list, continueItems, likes] = await Promise.all([
        browserDB.getWatchlist(profileId),
        browserDB.getContinueWatching(profileId),
        browserDB.getLikes(profileId),
      ]);
      setMyListItems(list);
      setRawContinueWatching(continueItems);
      setLikedIds(likes);
    } catch {}
  }, []);

  // Mounted flag for async work that outlives a single effect run.
  const mountedRef = React.useRef(true);
  const feedTokenRef = React.useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Home feed, fetched in parallel with the profile gate.
   *
   * Root cause of the old waterfall: this used to sit *after* getProfiles()
   * and loadProfileData(), so the chain was
   *   getProfiles -> watchlist+likes+continue (3 queries) -> /api/media/latest
   * before any home content could start. None of that is an input to this
   * fetch, so it is started up front.
   *
   * It is a useCallback rather than a closure inside the mount effect because
   * onboarding can finish after that effect has already run (and, on a fresh
   * browser, it ran without a TMDB key). Completion calls this again to upgrade
   * the seeded fallback catalogue to live data without a page reload.
   */
  const loadHomeFeed = useCallback(async () => {
    // A newer call (onboarding just saved a key, or the user reloaded the feed)
    // must win over an older in-flight one. Without a token the degraded
    // fallback from the pre-key mount call could land last and overwrite the
    // live rows.
    const token = ++feedTokenRef.current;

    const fetchLatestFeed = async (): Promise<any | null> => {
      try {
        const res = await mediaFetch('/api/media/latest');
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    // Two attempts cover the whole round-trip. The first request fires while
    // the browser is still opening IndexedDB and dialling TMDB on a cold
    // cache; the shim retries its upstream once, but cannot help when the
    // call itself fails or comes back degraded. Without this second attempt
    // the Top 10 rails sat on the static default catalog until the user
    // manually refreshed.
    let data = await fetchLatestFeed();
    if ((!data || data.degraded) && mountedRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (!mountedRef.current || token !== feedTokenRef.current) return;
      data = (await fetchLatestFeed()) ?? data;
    }
    if (!mountedRef.current || token !== feedTokenRef.current || !data) return;

    const hasData = data.movies?.length > 0 || data.tv?.length > 0 || data.anime?.length > 0;
    if (!hasData) return; // the seeds already hold the static catalog; resetting is redundant

    if (data.movies?.length > 0) setLatestMovies(data.movies);
    if (data.tv?.length > 0) setLatestTV(data.tv);
    if (data.anime?.length > 0) setLatestAnime(data.anime);

    // Promote to the Top 10 rails from a healthy response — never from a
    // degraded one, which by definition carries the same static fallback the
    // seeds already hold and would freeze the rails on the default catalog.
    // Any real count is enough (the rails render what they get); the old >=10
    // gate could silently withhold a short-but-real list.
    if (!data.degraded) {
      if (data.movies?.length > 0) setTop10Movies(data.movies.slice(0, 10));
      if (data.tv?.length > 0) setTop10TV(data.tv.slice(0, 10));
    }
  }, []);

  // Initialize DB data and fetch latest media safely after mount
  useEffect(() => {
    let isCancelled = false;

    // The gate tracks the PROFILE gate only, not the home feed.
    //
    // It used to wait for both, so the whole home tab sat behind
    // /api/media/latest — 3 parallel TMDB list calls plus 60 certification
    // lookups, which can take seconds on a cold cache. The feed is public
    // catalogue data, not user data, so there is no reason to withhold the screen
    // until it lands. The feed now starts from seeded local content and upgrades
    // in place when TMDB responds.
    let pending = 1;
    const settleOne = () => {
      pending -= 1;
      if (pending <= 0 && !isCancelled) setIsInitialLoading(false);
    };

    const initDB = async () => {
      try {
        const storedProfiles = await browserDB.getProfiles();
        if (isCancelled) return;
        setProfiles(storedProfiles);
        setProfilesLoaded(true);

        // Restoring across a reload is a convenience, not a way around the PIN.
        // A profile without a PIN drops straight back in; a PIN-locked one is
        // routed through the lock screen again, because a reload is exactly the
        // cheap bypass someone in the room would try.
        let restored: UserProfile | null = null;
        const sid = getActiveProfileIdSession();
        if (sid) {
          restored = storedProfiles.find((p) => p.id === sid) || null;
          if (!restored) setActiveProfileIdSession(null);
        }
        if (!restored && getActiveProfileMemory()) {
          restored = storedProfiles.find((p) => p.id === getActiveProfileMemory()) || null;
        }
        if (restored?.hasPin) {
          setPinTarget(restored);
        } else {
          setKidMode(Boolean(restored?.isKid));
          setCurrentProfile(restored);
          if (restored) await loadProfileData(restored.id);
        }
      } catch {
        setProfilesLoaded(true);
      } finally {
        settleOne();
      }
    };

    // Both start together: the home feed does not depend on profiles, and the
    // profile gate paints from getProfiles() well before either resolves.
    void initDB();
    void loadHomeFeed();

    return () => {
      isCancelled = true;
    };
  }, [loadProfileData, loadHomeFeed]);

  // Keyboard shortcuts: Escape closes the details dialog and "/" opens search.
  // The player owns its own Escape handler because closing it must persist
  // watch progress, not just unmount the iframe.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);

      if (e.key === 'Escape') {
        if (selectedDetailsMedia) setSelectedDetailsMedia(null);
      } else if (e.key === '/' && !typing && activeTab !== 'search') {
        e.preventDefault();
        setActiveTab('search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDetailsMedia, activeTab]);

  // --- Profile flow (Netflix-style) ---
  const enterProfile = async (profile: UserProfile) => {
    // Set before any catalogue request can run: the shell mounts on the next
    // render, and every rail/tab it mounts reads through `mediaFetch`.
    setKidMode(profile.isKid);
    setCurrentProfile(profile);
    setActiveProfileMemory(profile.id);
    setActiveProfileIdSession(profile.id);

    // Dismiss the PIN screen BEFORE loading, not after.
    //
    // The render gate is `if (pinTarget) return <PinEntry />`, so awaiting here
    // held the PIN pad on screen for the whole of loadProfileData even though
    // the PIN had already been accepted. The user typed a correct PIN and the
    // screen simply sat there. Watchlist / likes / continue-watching now hydrate
    // behind the home screen instead of in front of it.
    setPinTarget(null);

    await loadProfileData(profile.id);
    // Re-read the home feed under this profile's kid flag. Without this, a feed
    // fetched while a kids profile was active would stay filtered after
    // switching to an adult profile (and the reverse would leave an adult
    // Top 10 on a kids profile until a reload).
    void loadHomeFeed();
  };

  const handleSelectProfile = async (profile: UserProfile) => {
    if (profile.id === currentProfile?.id) return;
    if (profile.hasPin) {
      setPinTarget(profile);
      return;
    }
    await enterProfile(profile);
  };

  const refreshProfiles = async () => {
    const storedProfiles = await browserDB.getProfiles();
    setProfiles(storedProfiles);
    if (currentProfile) {
      const still = storedProfiles.find((p) => p.id === currentProfile.id);
      if (!still) {
        setKidMode(false);
        setCurrentProfile(null);
        setActiveProfileMemory(null);
        setActiveProfileIdSession(null);
      }
      else {
        setKidMode(still.isKid);
        setCurrentProfile(still);
      }
    }
  };

  /**
   * Onboarding finished: the first profile exists and the app can open it.
   *
   * No reload. The shell mounts only now, so every rail below is created after
   * the key was stored; the only thing that ran earlier was the home feed, and
   * that is re-fetched here to replace the bundled fallback rows with live TMDB
   * data. A reload would also re-lock a profile the visitor just gave a PIN to,
   * which reads as a bug on the very first screen.
   */
  const handleOnboardingComplete = async (profile: UserProfile) => {
    setProfiles((prev) => (prev.some((p) => p.id === profile.id) ? prev : [...prev, profile]));
    await enterProfile(profile);
  };

  // --- Actions (watchlist/likes/continue-watching) ---
  const handleToggleMyList = async (media: MediaItem) => {
    if (!currentProfile) return;
    const updated = await browserDB.toggleWatchlist(currentProfile.id, media);
    setMyListItems(updated);
  };

  const handleToggleLike = async (media: MediaItem) => {
    if (!currentProfile) return;
    const updated = await browserDB.toggleLike(currentProfile.id, media.id);
    setLikedIds(updated);
  };

  const handleProgressUpdate = async (
    media: MediaItem,
    progressPercent: number,
    seasonNumber?: number,
    episodeNumber?: number,
    runtimeMinutes?: number
  ) => {
    if (!currentProfile) return;
    const updated = await browserDB.updateContinueWatching(
      currentProfile.id,
      media,
      progressPercent,
      seasonNumber,
      episodeNumber,
      runtimeMinutes
    );
    setRawContinueWatching(updated);
  };

  const handleRemoveContinueWatching = async (id: string) => {
    if (!currentProfile) return;
    const updated = await browserDB.removeContinueWatching(currentProfile.id, id);
    setRawContinueWatching(updated);
  };

  // Combined media items across all sources
  const combinedMediaRaw = useMemo(() => {
    return [
      ...latestMovies,
      ...latestTV,
      ...latestAnime,
      ...ALL_MEDIA,
    ].reduce<MediaItem[]>((acc, item) => {
      if (!acc.some((m) => m.id === item.id || (m.tmdbId && m.tmdbId === item.tmdbId))) {
        acc.push(item);
      }
      return acc;
    }, []);
  }, [latestMovies, latestTV, latestAnime]);

  // Kids profiles only see family-safe titles
  const kidsSafe = useCallback(
    (items: MediaItem[]) =>
      currentProfile?.isKid ? items.filter((m) => m.rating === 'ALL' || m.rating === '7+') : items,
    [currentProfile?.isKid]
  );

  const combinedMedia = useMemo(() => kidsSafe(combinedMediaRaw), [kidsSafe, combinedMediaRaw]);

  const tasteProfile = useMemo(
    () => buildTasteProfile(combinedMedia, likedIds, rawContinueWatching),
    [combinedMedia, likedIds, rawContinueWatching]
  );

  const visibleMovies = useMemo(() => kidsSafe(latestMovies), [kidsSafe, latestMovies]);
  const visibleTV = useMemo(() => kidsSafe(latestTV), [kidsSafe, latestTV]);
  const visibleAnime = useMemo(() => kidsSafe(latestAnime), [kidsSafe, latestAnime]);
  const continueWatchingItems = useMemo(() => kidsSafe(rawContinueWatching), [kidsSafe, rawContinueWatching]);

  // Top 10 is ranked content, not a filtered browse: a kids profile must not
  // see the adult titles that happen to be popular today, and renumbering the
  // survivors 1..n is the honest way to show a shorter list. The fallbacks are
  // the seeded catalogue (movies for the movie row — it used to fall back to
  // TOP_10_SHOWS, which put series in a movies rail) and are filtered too.
  const visibleTop10Movies = useMemo(() => kidsSafe(top10Movies), [kidsSafe, top10Movies]);
  const visibleTop10TV = useMemo(() => kidsSafe(top10TV), [kidsSafe, top10TV]);
  const fallbackTop10Movies = useMemo(
    () => kidsSafe(LATEST_MOVIES.slice(0, 10)),
    [kidsSafe]
  );
  const fallbackTop10Shows = useMemo(() => kidsSafe(TOP_10_SHOWS), [kidsSafe]);

  // Featured Carousel items for Hero Section: blends Beauty in Black with all latest movies
  const heroCarouselItems = useMemo(() => {
    const pool = [...visibleMovies, ...visibleAnime];
    const unique: MediaItem[] = [];
    const seen = new Set<string>();
    for (const item of pool) {
      if (!seen.has(item.title.toLowerCase())) {
        seen.add(item.title.toLowerCase());
        unique.push(item);
      }
      if (unique.length >= 8) break;
    }
    return unique;
  }, [visibleMovies, visibleAnime]);

  // Resolve each saved snapshot against the live catalogue when possible, but
  // keep the stored copy when the title is no longer in the current feed.
  // kidsSafe is applied again because a saved item can predate a kids flag
  // change on this profile.
  const myListMedia = useMemo(
    () =>
      kidsSafe(
        myListItems.map(
          (saved) => combinedMedia.find((item) => item.id === saved.id) ?? saved
        )
      ),
    [combinedMedia, kidsSafe, myListItems]
  );
  const trendingOnly = combinedMedia.filter((m) => m.isTrending);

  // Seeds for the "Because You Watched" rails, newest watch first.
  // getContinueWatching already orders by updated_at DESC, so this is
  // "most recently watched" rather than "whatever happened to be first".
  // Only titles with a TMDB id can seed TMDB's /recommendations endpoint.
  const becauseYouWatched = useMemo(
    () =>
      rawContinueWatching
        .filter((m) => Boolean(m.tmdbId))
        .filter((m) => (m.continueWatchingProgress ?? 0) > 0)
        .filter((m) => !(currentProfile?.isKid && m.rating !== 'ALL' && m.rating !== '7+'))
        .slice(0, 3),
    [rawContinueWatching, currentProfile?.isKid]
  );

  // Weighted taste profile, derived in render so match badges and adaptive
  // rails react to a profile switch or a new like immediately.
  const topTasteGenres = useMemo(
    () => topGenresFrom(tasteProfile, 2),
    [tasteProfile]
  );

  // Adaptive rails for the top of the home stack. Cold start (no likes, no
  // watch history) yields an empty list and the curated sections take over —
  // a personalised home with nothing to personalise from would just be empty.
  //
  // Derived during render (buildTasteProfile is pure) rather than read from the
  // module-level taste state, because that state is only refreshed by an effect
  // and would not re-run this memo when the viewer's likes arrive.
  const adaptiveRails = useMemo<HomeRail[]>(() => {
    const rails: HomeRail[] = [];

    // 1) "Because You Watched …" — capped at 2. Three recommendation calls for a
    //    single row of history is poor value; two is enough to feel personalised.
    for (const seed of becauseYouWatched.slice(0, 2)) {
      rails.push({
        id: `rec-${seed.id}`,
        title: `Because You Watched ${seed.title}`,
        section: 'for-you',
        type: seed.type === 'movie' ? 'movie' : 'tv',
        apiPath: `/api/media/recommendations?id=${seed.tmdbId}&type=${seed.type}`,
      });
    }

    // 2) "Because you like <genre>" — the strongest genre in this viewer's taste
    //    profile, turned back into TMDB genre ids for a discover query.
    const genreName = topTasteGenres[0];
    if (genreName) {
      const movieId = genreIdFor(genreName, 'movie');
      if (movieId !== null) {
        rails.push({
          id: `taste-movie-${movieId}`,
          title: `Because you like ${genreName}`,
          section: 'for-you',
          type: 'movie',
          genreId: movieId,
          sort: 'top_rated',
          direct: true,
        });
      }
      const tvId = genreIdFor(genreName, 'tv');
      if (tvId !== null) {
        rails.push({
          id: `taste-tv-${tvId}`,
          title: `More ${genreName} you might like`,
          section: 'for-you',
          type: 'tv',
          genreId: tvId,
          sort: 'top_rated',
          direct: true,
        });
      }
    }

    return rails;
  }, [becauseYouWatched, topTasteGenres]);

  // Recommendations for modal: only items sharing at least one genre,
  // ranked by how many genres overlap. No same-type fallback.
  const moreLikeThis = selectedDetailsMedia
    ? combinedMedia
        .filter(
          (m) =>
            m.id !== selectedDetailsMedia.id &&
            m.genres.some((g) => selectedDetailsMedia.genres.includes(g))
        )
        .sort(
          (a, b) =>
            b.genres.filter((g) => selectedDetailsMedia.genres.includes(g)).length -
            a.genres.filter((g) => selectedDetailsMedia.genres.includes(g)).length
        )
    : [];

  if (!profilesLoaded) {
    return <ProfileGateSkeleton />;
  }

  // A browser with no profiles has never been set up. Collect the API key and
  // the first profile together instead of showing an empty picker whose only
  // affordance is an "Add Profile" tile behind a separate key modal.
  if (profiles.length === 0) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (pinTarget) {
    return <PinEntry profile={pinTarget} onSuccess={() => enterProfile(pinTarget)} onBack={() => setPinTarget(null)} />;
  }

  if (!currentProfile) {
    return (
      <WhoIsWatching
        profiles={profiles}
        maxProfiles={maxProfiles}
        onSelect={handleSelectProfile}
        onProfilesChanged={refreshProfiles}
      />
    );
  }

  return (
    <TasteProvider profile={tasteProfile}>
    <div className="min-h-screen bg-[#111111] text-white flex flex-col font-sans selection:bg-[#E50914] selection:text-white relative">
      {/* Left Vertical TV / Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:ml-20 flex flex-col min-h-screen relative overflow-x-hidden">
        {/* Top Navbar */}
        <TopNavbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentProfile={currentProfile}
          profiles={profiles}
          onSelectProfile={handleSelectProfile}
          onSwitchProfile={() => {
            setKidMode(false);
            setCurrentProfile(null);
            setActiveProfileMemory(null);
            setActiveProfileIdSession(null);
          }}
        />

        {/* Tab Views */}
        <main className="flex-1">
          {activeTab === 'home' && (
            <div className="space-y-2 pb-16">
              {isInitialLoading && <HomeSkeleton />}
              {!isInitialLoading && <>
              {/* Top Hero Carousel with All Latest Movies */}
              <HeroCarousel
                items={heroCarouselItems}
                onPlay={handleStartStream}
                onOpenDetails={(media) => setSelectedDetailsMedia(media)}
                myListIds={myListIds}
                onToggleMyList={handleToggleMyList}
              />

              {/* Row 1: Continue Watching for User */}
              {continueWatchingItems.length > 0 && (
              <div className="-mt-16 md:-mt-24 relative z-20">
                <MovieRow
                  title="Continue Watching"
                  items={continueWatchingItems}
                  onPlay={handleStartStream}
                  onOpenDetails={(media) => setSelectedDetailsMedia(media)}
                  myListIds={myListIds}
                  onToggleMyList={handleToggleMyList}
                  isContinueWatching={true}
                  onRemoveContinueWatching={handleRemoveContinueWatching}
                />

              </div>
              )}

              {/* Top 10 Movies Today */}
              <div className="relative z-20 pt-4 md:pt-6">
                <Top10Row
                  title="Top 10 Movies Today"
                  items={visibleTop10Movies.length > 0 ? visibleTop10Movies : fallbackTop10Movies}
                  onPlay={handleStartStream}
                  onOpenDetails={(media) => setSelectedDetailsMedia(media)}
                  myListIds={myListIds}
                  onToggleMyList={handleToggleMyList}
                />
              </div>

              {/* Top 10 TV Today */}
              <div className="relative z-20">
                <Top10Row
                  title="Top 10 TV Shows Today"
                  items={visibleTop10TV.length > 0 ? visibleTop10TV : fallbackTop10Shows}
                  onPlay={handleStartStream}
                  onOpenDetails={(media) => setSelectedDetailsMedia(media)}
                  myListIds={myListIds}
                  onToggleMyList={handleToggleMyList}
                />
              </div>

              <HomeSections
                adaptive={adaptiveRails}
                onPlay={handleStartStream}
                onOpenDetails={(m) => setSelectedDetailsMedia(m)}
                myListIds={myListIds}
                onToggleMyList={handleToggleMyList}
              />

              </>}
            </div>
          )}

          {activeTab === 'search' && (
            <SearchTab
              key={currentProfile.id}
              allMedia={combinedMedia}
              profileId={currentProfile.id}
              onPlay={handleStartStream}
              onOpenDetails={(media) => setSelectedDetailsMedia(media)}
              myListIds={myListIds}
              onToggleMyList={handleToggleMyList}
            />
          )}

          {activeTab === 'trending' && (
            <BrowserTab
              onPlay={handleStartStream}
              onOpenDetails={(media) => setSelectedDetailsMedia(media)}
              myListIds={myListIds}
              onToggleMyList={handleToggleMyList}
              isKid={Boolean(currentProfile.isKid)}
            />
          )}

          {activeTab === 'tv' && (
            <TVShowsTab
              top10Shows={visibleTop10TV.length > 0 ? visibleTop10TV : fallbackTop10Shows}
              onPlay={handleStartStream}
              onOpenDetails={(media) => setSelectedDetailsMedia(media)}
              myListIds={myListIds}
              onToggleMyList={handleToggleMyList}
            />
          )}

          {activeTab === 'movies' && (
            <MoviesTab
              top10Movies={visibleTop10Movies.length > 0 ? visibleTop10Movies : fallbackTop10Movies}
              onPlay={handleStartStream}
              onOpenDetails={(media) => setSelectedDetailsMedia(media)}
              myListIds={myListIds}
              onToggleMyList={handleToggleMyList}
            />
          )}

          {activeTab === 'anime' && (
            <AnimeTab
              animeList={visibleAnime}
              onPlay={handleStartStream}
              onOpenDetails={(media) => setSelectedDetailsMedia(media)}
              myListIds={myListIds}
              onToggleMyList={handleToggleMyList}
              isKid={Boolean(currentProfile.isKid)}
            />
          )}

          {activeTab === 'mylist' && (
            <MyListTab
              items={myListMedia}
              onPlay={handleStartStream}
              onOpenDetails={(media) => setSelectedDetailsMedia(media)}
              myListIds={myListIds}
              onToggleMyList={handleToggleMyList}
              onBrowseExplore={() => setActiveTab('home')}
            />
          )}
        </main>

        {/* Rellix Footer */}
        <footer className="mt-auto px-6 md:px-16 py-12 pb-24 md:pb-12 border-t border-white/5 text-xs text-[#737373] space-y-4">
          <p>
            Rellix • Everything is stored in this browser • Metadata from TMDB •
            Playback runs in the provider&apos;s own embed.
          </p>
          <p className="text-[11px] text-[#555555]">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </footer>
      </div>

      <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Streaming Player Modal */}
      {activeStreamMedia && (
        <VideoPlayerModal
          key={activeStreamMedia.id}
          media={activeStreamMedia}
          initialSeason={activeStreamSeason}
          initialEpisode={activeStreamEpisode}
          onClose={() => setActiveStreamMedia(null)}
          onProgressUpdate={handleProgressUpdate}
        />
      )}

      {/* Media Details Popup Dialog */}
      {selectedDetailsMedia && (
        <MediaDetailsModal
          key={selectedDetailsMedia.id}
          media={selectedDetailsMedia}
          onClose={() => setSelectedDetailsMedia(null)}
          onPlay={(media, season, episode) => {
            setSelectedDetailsMedia(null);
            handleStartStream(media, season, episode);
          }}
          isInMyList={myListIds.includes(selectedDetailsMedia.id)}
          onToggleMyList={handleToggleMyList}
          isLiked={likedIds.includes(selectedDetailsMedia.id)}
          onToggleLike={handleToggleLike}
          moreLikeThis={moreLikeThis}
          onSelectMedia={(item) => setSelectedDetailsMedia(item)}
        />
      )}

    </div>
    </TasteProvider>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Tv,
  SkipForward,
  RotateCcw,
  ExternalLink,
  Server,
  ChevronDown,
} from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { parseDurationToMinutes } from '@/lib/format';
import {
  StreamServer,
  STREAM_SOURCES,
  streamSourceLabel,
  buildEmbedUrl,
  isSafeEmbedUrl,
} from '@/lib/embed-urls';
import { mediaFetch } from '@/lib/client-media';
import { getDefaultServer, setDefaultServer, getCustomEmbedUrl, setCustomEmbedUrl } from '@/lib/prefs';

/**
 * Origins allowed to post playback-progress messages. Derived from the same
 * providers `lib/embed-urls.ts` builds URLs for — keep the two in step.
 *
 * There is no server-side URL validation any more: the browser loads the URL,
 * so `isSafeEmbedUrl` only rejects non-http(s) schemes and the iframe sandbox is
 * the real control.
 */
const EMBED_PROVIDER_ORIGINS = [
  'https://nxsha.space',
  'https://vidsrc.pm',
  'https://moviesapi.to',
];

interface VideoPlayerModalProps {
  media: MediaItem | null;
  onClose: () => void;
  onProgressUpdate: (media: MediaItem, progressPercent: number, season?: number, episode?: number, runtimeMinutes?: number) => void;
  initialSeason?: number;
  initialEpisode?: number;
}

export function VideoPlayerModal({
  media,
  onClose,
  onProgressUpdate,
  initialSeason = 1,
  initialEpisode = 1,
}: VideoPlayerModalProps) {
  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const [selectedEpisode, setSelectedEpisode] = useState(initialEpisode);
  const [serverMode, setServerMode] = useState<StreamServer>(() => getDefaultServer());
  const [customUrl, setCustomUrl] = useState(() => getCustomEmbedUrl());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const openedAtRef = React.useRef<number | null>(null);
  const lastProgressRef = React.useRef<number>(media?.continueWatchingProgress || 0);
  const closeHandlerRef = React.useRef<() => void>(() => {});
  const [fetched, setFetched] = useState<{ season: number; episodes: any[] } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isLoadingEpisodes = Boolean(
    media && media.type !== 'movie' && media.tmdbId && (!fetched || fetched.season !== selectedSeason)
  );


  useEffect(() => {

    openedAtRef.current = Date.now();
  }, []);

  // Remember the viewer's preferred source across sessions.
  useEffect(() => {
    setDefaultServer(serverMode);
  }, [serverMode]);

  // Keep isFullscreen in sync with native fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        try { (screen.orientation as any)?.unlock?.(); } catch {}
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    if (isFullscreen || document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch {}
      try { (screen.orientation as any)?.unlock?.(); } catch {}
      setIsFullscreen(false);
      return;
    }
    try {
      await containerRef.current?.requestFullscreen();
    } catch {
      // iPhone Chrome/Safari: element fullscreen unsupported — fall back to CSS fullscreen
      setIsFullscreen(true);
    }
    if (isCoarse) {
      try { await (screen.orientation as any)?.lock?.('landscape'); } catch {}
    }
  };

  const getRuntimeMinutes = React.useCallback((seasonNum: number, epNum: number): number | undefined => {
    const episodes =
      fetched && fetched.season === seasonNum
        ? fetched.episodes
        : media?.seasons?.find((s) => s.seasonNumber === seasonNum)?.episodes || [];
    const ep = episodes.find((e: any) => e.episodeNumber === epNum);
    return parseDurationToMinutes(ep?.duration) ?? parseDurationToMinutes(media?.duration);
  }, [fetched, media]);

  /**
   * Build the embed URL locally.
   *
   * The hosted build asked `/api/play/authorize` so an expired subscription
   * never received a playable URL. That gate does not exist here: there is no
   * account, so there is nothing to authorise. `buildEmbedUrl` is a pure
   * function and the browser is the only consumer.
   */
  const streamUrl = React.useMemo(() => {
    if (!media) return '';
    if (serverMode === 'custom') {
      const trimmed = customUrl.trim();
      return trimmed && isSafeEmbedUrl(trimmed) ? trimmed : '';
    }
    return buildEmbedUrl({
      server: serverMode,
      media,
      season: selectedSeason,
      episode: selectedEpisode,
    });
  }, [media, serverMode, selectedSeason, selectedEpisode, customUrl]);

  // Best-effort progress: listen for embed postMessage events, else estimate
  // watched fraction from real elapsed wall-clock time on close.
  //
  // The origin check is not decoration. Without it ANY frame on the page can
  // drive onProgressUpdate and write arbitrary progress_percent / season /
  // episode into continue_watching — and the Custom URL source lets a
  // subscriber point that at any origin at all. The allowed origins are the
  // built-in providers plus whatever the custom URL resolves to; if the custom
  // URL is not http(s) we accept nothing rather than everything.
  useEffect(() => {
    if (!media) return;

    const allowed = new Set<string>();
    try {
      if (streamUrl) allowed.add(new URL(streamUrl).origin);
    } catch {
      /* non-absolute custom URL; fall through to the provider defaults */
    }
    for (const host of EMBED_PROVIDER_ORIGINS) allowed.add(host);

    const onMessage = (event: MessageEvent) => {
      if (event.origin && !allowed.has(event.origin)) return;
      try {
        const data: any = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const current = data?.currentTime ?? data?.position ?? data?.playedSeconds;
        const total = data?.duration ?? data?.totalDuration;
        if (typeof current === 'number' && typeof total === 'number' && total > 0) {
          const pct = Math.min(98, Math.max(1, Math.round((current / total) * 100)));
          lastProgressRef.current = pct;
          onProgressUpdate(media, pct, selectedSeason, selectedEpisode, getRuntimeMinutes(selectedSeason, selectedEpisode));
        }
      } catch {
        // not a progress message
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [media, onProgressUpdate, selectedSeason, selectedEpisode, getRuntimeMinutes, streamUrl]);

  // Fetch real episode list when season changes
  useEffect(() => {
    if (!media || media.type === 'movie' || !media.tmdbId) return;
    const controller = new AbortController();
    mediaFetch(`/api/media/details?type=${media.type}&id=${media.tmdbId}&season=${selectedSeason}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
        setFetched({ season: selectedSeason, episodes });
      })
      .catch(() => setFetched({ season: selectedSeason, episodes: [] }));
    return () => controller.abort();
  }, [media, selectedSeason]);

  const customUrlInvalid =
    serverMode === 'custom' &&
    Boolean(customUrl.trim()) &&
    !isSafeEmbedUrl(customUrl.trim());

  const estimateAndSaveProgress = () => {
    if (!media) return;
    if (lastProgressRef.current > 0) {
      onProgressUpdate(media, lastProgressRef.current, selectedSeason, selectedEpisode, getRuntimeMinutes(selectedSeason, selectedEpisode));
      return;
    }
    const elapsedSec = openedAtRef.current ? (Date.now() - openedAtRef.current) / 1000 : 0;
    const assumedSec = (getRuntimeMinutes(selectedSeason, selectedEpisode) ?? 45) * 60;
    // A glance is not progress. Rounding before clamping used to save a 2% row
    // for opening the player for a second, which then polluted Continue
    // Watching and the taste profile. Below 1% there is nothing worth saving.
    const pct = Math.min(
      95,
      Math.max(media.continueWatchingProgress ?? 0, Math.round((elapsedSec / assumedSec) * 100))
    );
    if (pct < 1) return;
    onProgressUpdate(media, pct, selectedSeason, selectedEpisode, getRuntimeMinutes(selectedSeason, selectedEpisode));
  };

  const handleClose = () => {
    estimateAndSaveProgress();
    onClose();
  };

  // Escape belongs to the player while it is open. Closing with an unmount
  // directly (the old parent-level shortcut) skipped the progress estimate.
  useEffect(() => {
    closeHandlerRef.current = handleClose;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeHandlerRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!media) return null;

  const handleNextEpisode = () => {
    const nextEp = selectedEpisode + 1;
    setSelectedEpisode(nextEp);
    setIframeKey((k) => k + 1);
    lastProgressRef.current = 5;
     
    openedAtRef.current = Date.now();
    onProgressUpdate(media, 5, selectedSeason, nextEp, getRuntimeMinutes(selectedSeason, nextEp));
  };

  const handleSelectEp = (seasonNum: number, epNum: number) => {
    setSelectedSeason(seasonNum);
    setSelectedEpisode(epNum);
    setIframeKey((k) => k + 1);
    setShowEpisodeDrawer(false);
    lastProgressRef.current = 5;
    // eslint-disable-next-line react-hooks/purity
    openedAtRef.current = Date.now();
    onProgressUpdate(media, 5, seasonNum, epNum, getRuntimeMinutes(seasonNum, epNum));
  };

  const totalSeasons = media.seasonsCount || 2;
  const currentSeasonObj = media.seasons?.find((s) => s.seasonNumber === selectedSeason);
  const localEpisodes = currentSeasonObj?.episodes || [];
  const allEpisodes = fetched && fetched.season === selectedSeason ? fetched.episodes : localEpisodes;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[90] bg-black flex flex-col select-none overflow-hidden animate-in fade-in duration-300 ${
        isFullscreen ? 'p-0' : ''
      }`}
    >
      {/* Top Header Bar (hidden while fullscreen so the video area expands) */}
      {!isFullscreen && (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 md:px-8 py-2 md:py-3 bg-gradient-to-b from-black/95 via-black/80 to-transparent z-20 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs md:text-sm font-semibold transition-all group backdrop-blur-md"
            title="Return to Rellix Browse"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">Back to Browse</span>
          </button>

          <div>
            <h1 className="text-xs md:text-sm lg:text-base font-bold text-white flex items-center gap-2">
              <span className="text-[#E50914] font-black">R</span>
              <span className="truncate max-w-[150px] sm:max-w-[180px] md:max-w-[320px]">{media.title}</span>
              {media.type !== 'movie' && (
                <span className="hidden sm:inline text-xs text-[#a3a3a3] font-normal whitespace-nowrap">
                  (S{selectedSeason}:E{selectedEpisode})
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* Server & Control actions */}
        <div className="flex items-center flex-wrap gap-1.5 md:gap-3 [&>*]:shrink-0">
          {/* Server Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowServerMenu(!showServerMenu)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded bg-[#1e1e1e] hover:bg-[#282828] text-xs font-medium text-white border border-white/10 transition-colors"
              title="Select Stream Server"
            >
              <Server className="w-3.5 h-3.5 text-[#E50914]" />
              <span className="hidden sm:inline">
                {streamSourceLabel(serverMode)}
              </span>
            </button>

            {showServerMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#181818] border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in">
                <div className="px-3 py-1 text-[10px] font-bold text-[#737373] uppercase tracking-wider border-b border-white/5">
                  Streaming Source
                </div>

                {/* Driven by STREAM_SOURCES so the picker cannot list a source the
                    server would reject (or miss one it would accept). Labels come
                    from STREAM_SOURCE_LABELS — descriptive names, not provider
                    branding. */}
                {STREAM_SOURCES.filter((s) => s !== 'custom').map((s, i) => (
                  <button
                    key={s}
                    onClick={() => {
                      setServerMode(s);
                      setShowServerMenu(false);
                      setIframeKey((k) => k + 1);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-white/10 ${
                      serverMode === s ? 'text-white font-bold bg-white/5' : 'text-[#a3a3a3]'
                    }`}
                  >
                    <span>
                      {i + 1}. {streamSourceLabel(s)}
                    </span>
                    {serverMode === s && <span className="w-2 h-2 rounded-full bg-green-500" />}
                  </button>
                ))}

                <button
                  onClick={() => {
                    setServerMode('custom');
                    setShowServerMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-white/10 ${
                    serverMode === 'custom' ? 'text-white font-bold bg-white/5' : 'text-[#a3a3a3]'
                  }`}
                >
                  <span>{streamSourceLabel('custom')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Episode Drawer Trigger for TV / Anime */}
          {media.type !== 'movie' && (
            <button
              onClick={() => setShowEpisodeDrawer(!showEpisodeDrawer)}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded bg-[#1e1e1e] hover:bg-[#282828] text-white border border-white/10 transition-colors"
            >
              <Tv className="w-3.5 h-3.5 text-[#E50914]" />
              <span className="hidden sm:inline">Episodes</span>
            </button>
          )}

          {/* Next Episode Button */}
          {media.type !== 'movie' && (
            <button
              onClick={handleNextEpisode}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded bg-[#1e1e1e] hover:bg-[#282828] text-white border border-white/10 transition-colors"
              title="Next episode"
            >
              <SkipForward className="w-3.5 h-3.5 text-white" />
              <span className="hidden md:inline">Next</span>
            </button>
          )}

          {/* Reload Stream */}
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="p-1.5 rounded bg-[#1e1e1e] hover:bg-[#282828] text-white transition-colors"
            title="Reload video player stream"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Popout external link */}
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded bg-[#1e1e1e] hover:bg-[#282828] text-white transition-colors"
            title="Open streaming embed in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 md:p-1.5 rounded bg-[#E50914] md:bg-[#1e1e1e] hover:bg-[#ff3844] md:hover:bg-[#282828] text-white transition-colors shadow-lg"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>
      )}

      {/* Floating restore/minimize while fullscreen */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-40 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 transition-colors"
          title="Exit fullscreen"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      )}

      {/* Custom URL Input Bar if custom mode is enabled */}
      {serverMode === 'custom' && (
        <div className="px-6 py-2 bg-[#1a1a1a] border-b border-white/10 flex items-center gap-3 text-xs">
          <span className="text-[#a3a3a3]">Custom Embed URL:</span>
          <input
            type="text"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://example.com/embed/movie/603"
            className="flex-1 bg-black/60 border border-white/20 rounded px-3 py-1 text-white font-mono text-xs focus:outline-none focus:border-[#E50914]"
          />
          <button
            onClick={() => {
              setCustomEmbedUrl(customUrl);
              setIframeKey((k) => k + 1);
            }}
            className="px-3 py-1 bg-[#E50914] text-white rounded font-semibold hover:bg-[#b80710]"
          >
            Load
          </button>
        </div>
      )}

      {/* Main Iframe Player Container */}
      <div className="relative flex-1 w-full h-full bg-black flex items-center justify-center">
        {serverMode === 'custom' && !customUrl.trim() && (
          <div className="max-w-md text-center space-y-2 px-6">
            <h2 className="text-base font-bold text-white">Custom source</h2>
            <p className="text-sm text-[#a3a3a3]">
              Paste an embed URL above and press Load. It must start with http:// or https://.
            </p>
          </div>
        )}
        {customUrlInvalid && (
          <p className="text-sm text-[#ff6b6b]">
            That URL is not a valid http(s) address.
          </p>
        )}
        {serverMode !== 'custom' && !streamUrl && (
          <p className="text-sm text-[#ff6b6b]">
            Could not build a stream URL for this title.
          </p>
        )}
        {streamUrl && (
        <iframe
          key={iframeKey}
          src={streamUrl}
          title={`Streaming ${media.title}`}
          // Sandbox tokens:
          //   allow-scripts        the player needs it
          //   allow-same-origin    REQUIRED — see below
          //   allow-presentation   fullscreen
          //   allow-modals         some players open a quality picker
          //   (absent)             popups, top-level navigation, form submission,
          //                        downloads and pointer-lock are all blocked
          //
          // allow-same-origin IS NOT OPTIONAL. It was removed once and it broke
          // the primary source immediately: nxsha.space is a Next.js app, and in
          // an opaque origin `localStorage`/`document.cookie` throw and
          // same-origin fetches fail, so React never hydrates and the player
          // renders "could not load". Any SPA embed needs a real origin.
          //
          // `allow-scripts` + `allow-same-origin` together are only dangerous
          // when the framed document is SAME-ORIGIN WITH THE EMBEDDER, because
          // the escape (`frameElement.removeAttribute('sandbox')`) needs
          // frameElement access, which returns null cross-origin. Every built-in
          // provider is on its own domain, so there is no escape path here.
          //
          // The one residual case is a Custom URL pointing back at this app's
          // own origin. That requires a user to deliberately frame our app
          // inside our app, and the worst outcome is that they can unsandbox
          // their own frame.
          sandbox="allow-scripts allow-same-origin allow-presentation allow-modals"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="w-full h-full border-0 object-contain"
        />
        )}

      {/* previously had a floating Source status pill; removed */}
      </div>

      {/* Episode Drawer overlay for TV shows and Anime */}
      {showEpisodeDrawer && media.type !== 'movie' && (
        <aside className="absolute right-0 top-14 bottom-0 w-[85vw] max-w-sm md:w-96 bg-[#141414]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-30 flex flex-col p-4 overflow-hidden animate-in slide-in-from-right duration-200 no-scrollbar">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
            <h3 className="font-bold text-sm text-white">Select Episode</h3>
            <button
              onClick={() => setShowEpisodeDrawer(false)}
              className="text-[#888888] hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>

          {/* Season Switcher */}
          {totalSeasons > 1 && (
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[#888888] uppercase block mb-1">
                Season
              </label>
              <select
                value={selectedSeason}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setSelectedSeason(s);
                  setSelectedEpisode(1);
                  setIframeKey((k) => k + 1);
                }}
                className="w-full bg-[#222222] border border-white/20 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => (
                  <option key={sNum} value={sNum}>
                    Season {sNum}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 no-scrollbar">
            {isLoadingEpisodes && (
              <div className="space-y-3 animate-pulse">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 p-2.5">
                    <div className="w-24 h-14 bg-[#242424] rounded shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-2/3 bg-[#242424] rounded" />
                      <div className="h-2 w-full bg-[#1f1f1f] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isLoadingEpisodes && allEpisodes.length === 0 && (
              <p className="text-xs text-[#737373] text-center py-6">
                Episode data unavailable for this season.
              </p>
            )}
            {allEpisodes.map((ep) => {
              const isCurrent = ep.episodeNumber === selectedEpisode;
              return (
                <div
                  key={ep.id}
                  onClick={() => handleSelectEp(selectedSeason, ep.episodeNumber)}
                  className={`flex gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                    isCurrent
                      ? 'bg-white/10 border-[#E50914]'
                      : 'hover:bg-white/5 border-transparent'
                  }`}
                >
                  <div className="relative w-24 h-14 rounded overflow-hidden bg-black/60 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ep.stillUrl || media.backdropUrl}
                      alt={ep.title}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 text-[9px] bg-black/80 text-white px-1 rounded">
                      {ep.duration}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-bold truncate ${
                        isCurrent ? 'text-[#E50914]' : 'text-white'
                      }`}
                    >
                      {ep.episodeNumber}. {ep.title}
                    </p>
                    <p className="text-[11px] text-[#888888] line-clamp-2 mt-0.5">
                      {ep.overview}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
}

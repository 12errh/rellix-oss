'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Plus,
  Check,
  ThumbsUp,
  Share2,
} from 'lucide-react';
import { MediaItem } from '@/types/movie';
import { useMatchScore } from '@/components/TasteProvider';
import { mediaFetch } from '@/lib/client-media';
import { getDefaultServer } from '@/lib/prefs';
import { streamSourceLabel } from '@/lib/embed-urls';

interface MediaDetailsModalProps {
  media: MediaItem | null;
  onClose: () => void;
  onPlay: (media: MediaItem, season?: number, episode?: number) => void;
  isInMyList: boolean;
  onToggleMyList: (media: MediaItem) => void;
  moreLikeThis: MediaItem[];
  onSelectMedia?: (media: MediaItem) => void;
  isLiked?: boolean;
  onToggleLike?: (media: MediaItem) => void;
}

export function MediaDetailsModal({
  media,
  onClose,
  onPlay,
  isInMyList,
  onToggleMyList,
  moreLikeThis,
  onSelectMedia,
  isLiked = false,
  onToggleLike,
}: MediaDetailsModalProps) {
  const matchFor = useMatchScore();
  const [selectedSeason, setSelectedSeason] = useState(media?.continueWatchingSeason ?? 1);
  const [selectedEpisode, setSelectedEpisode] = useState(media?.continueWatchingEpisode ?? 1);
  const [copiedShare, setCopiedShare] = useState(false);
  const [liveDetails, setLiveDetails] = useState<Partial<MediaItem> | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [fetchedEpisodes, setFetchedEpisodes] = useState<{ season: number; episodes: any[] } | null>(null);
  const [recsState, setRecsState] = useState<{ key: string; items: MediaItem[] } | null>(null);
  const isLoadingEpisodes = Boolean(
    media && media.type !== 'movie' && media.tmdbId && (!fetchedEpisodes || fetchedEpisodes.season !== selectedSeason)
  );

  // Fetch live enriched details from API
  useEffect(() => {
    if (!media) return;
    const controller = new AbortController();

    const fetchDetails = async () => {
      try {
        const id = media.tmdbId || media.id;
        const res = await mediaFetch(`/api/media/details?type=${media.type}&id=${id}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.title) {
            setLiveDetails(data);
          }
        }
      } catch {
        // keep static details
      }
    };

    fetchDetails();
    return () => controller.abort();
  }, [media]);

  // Fetch real episodes for selected season
  useEffect(() => {
    if (!media || media.type === 'movie' || !media.tmdbId) return;
    const controller = new AbortController();
    mediaFetch(`/api/media/details?type=${media.type}&id=${media.tmdbId}&season=${selectedSeason}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setFetchedEpisodes({ season: selectedSeason, episodes: Array.isArray(data?.episodes) ? data.episodes : [] }))
      .catch(() => setFetchedEpisodes({ season: selectedSeason, episodes: [] }));
    return () => controller.abort();
  }, [media, selectedSeason]);

  // Live recommendations from TMDB, merged with the local genre matches below.
  // Seeded titles without a TMDB id keep the old local-only behaviour. Result
  // state is keyed by title so switching media never shows the previous list.
  useEffect(() => {
    if (!media?.tmdbId) return;
    const controller = new AbortController();
    const key = `${media.type}:${media.tmdbId}`;

    mediaFetch(
      `/api/media/recommendations?id=${media.tmdbId}&type=${media.type}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: MediaItem[] } | null) => {
        if (controller.signal.aborted) return;
        setRecsState({ key, items: Array.isArray(data?.items) ? data.items : [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecsState({ key, items: [] });
      });

    return () => controller.abort();
  }, [media]);

  if (!media) return null;

  const currentMedia: MediaItem = {
    ...media,
    ...(liveDetails || {}),
  };
  const currentMatch = matchFor(currentMedia);

  const totalSeasons = currentMedia.seasonsCount || currentMedia.seasons?.length || 2;
  const currentSeason =
    currentMedia.seasons?.find((s) => s.seasonNumber === selectedSeason) ||
    currentMedia.seasons?.[0];

  const episodesList =
    fetchedEpisodes && fetchedEpisodes.season === selectedSeason
      ? fetchedEpisodes.episodes
      : currentSeason?.episodes && currentSeason.episodes.length > 0
        ? currentSeason.episodes
        : [];

  const recKey = media.tmdbId ? `${media.type}:${media.tmdbId}` : '';
  const recItems = recsState && recsState.key === recKey ? recsState.items : [];
  const recsLoading = Boolean(recKey) && recsState?.key !== recKey;

  const similarTitles: MediaItem[] = (() => {
    const seen = new Set<string>(media ? [media.id] : []);
    if (media?.tmdbId) seen.add(`tmdb:${media.tmdbId}`);
    const merged: MediaItem[] = [];
    for (const item of [...recItems, ...moreLikeThis]) {
      const key = item.tmdbId ? `tmdb:${item.tmdbId}` : item.id;
      if (seen.has(key) || seen.has(item.id)) continue;
      seen.add(key);
      seen.add(item.id);
      merged.push(item);
      if (merged.length >= 14) break;
    }
    return merged;
  })();

  const handleShare = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/85 p-0 backdrop-blur-sm sm:p-6">
      <div
        className="relative my-0 w-full max-w-5xl overflow-hidden border border-white/[0.08] bg-[#0d0d0d] text-white sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center border border-white/25 bg-black/60 text-white backdrop-blur transition-colors hover:border-white/70"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Backdrop */}
        <div className="relative aspect-[16/9] max-h-[480px] w-full overflow-hidden bg-[#141414]">
          {showTrailer && currentMedia.youtubeTrailerId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${currentMedia.youtubeTrailerId}?autoplay=1&mute=0`}
              title="Trailer"
              // Same strict token set as the stream player. `youtubeTrailerId`
              // comes from TMDB and is interpolated into a URL, so the frame is
              // sandboxed rather than trusted.
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentMedia.backdropUrl || currentMedia.posterUrl}
                alt={currentMedia.title}
                className="h-full w-full object-cover object-top"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/25 to-[#0d0d0d]/45" />
            </>
          )}

          {/* Title block */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 sm:px-8 sm:pb-7">
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10px] uppercase tracking-[0.22em] text-[#a0a0a0]">
              <span className="text-[#E50914]">
                {currentMedia.type === 'movie' ? 'Film' : 'Series'}
              </span>
              {currentMedia.releaseYear ? <span>{currentMedia.releaseYear}</span> : null}
              <span>
                {currentMedia.type === 'movie'
                  ? currentMedia.duration || 'Feature'
                  : `${totalSeasons} ${totalSeasons === 1 ? 'Season' : 'Seasons'}`}
              </span>
              <span className="border border-white/30 px-1.5 py-0.5 text-[9px] tracking-[0.14em] text-white">
                {currentMedia.rating}
              </span>
              {currentMatch !== null && (
                <span className="text-[#46d369]">{currentMatch}% Match</span>
              )}
            </p>

            <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-3xl md:text-[2.6rem]">
              {currentMedia.title}
            </h2>

            <p className="mt-2 max-w-xl truncate text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              {currentMedia.genres?.length ? currentMedia.genres.join(' · ') : 'Rellix'}
              <span className="mx-2 text-white/20">/</span>
              {streamSourceLabel(getDefaultServer())}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onPlay(currentMedia, selectedSeason, selectedEpisode)}
                className="flex items-center gap-2 rounded-[2px] bg-white px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#e2e2e2]"
              >
                <Play className="h-3.5 w-3.5 fill-black text-black" />
                <span>Play</span>
              </button>

              {currentMedia.youtubeTrailerId && (
                <button
                  onClick={() => setShowTrailer(!showTrailer)}
                  className="rounded-[2px] border border-white/30 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white transition-colors hover:border-white/70"
                >
                  {showTrailer ? 'Close trailer' : 'Trailer'}
                </button>
              )}

              <button
                onClick={() => onToggleMyList(currentMedia)}
                aria-label={isInMyList ? 'Remove from My List' : 'Add to My List'}
                className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-white/20 bg-black/40 text-white transition-colors hover:border-white/60"
              >
                {isInMyList ? (
                  <Check className="h-4 w-4 text-[#46d369]" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>

              <button
                onClick={() => onToggleLike?.(currentMedia)}
                aria-label="Rate this title"
                className={`flex h-9 w-9 items-center justify-center rounded-[2px] border transition-colors ${
                  isLiked
                    ? 'border-[#E50914] bg-[#E50914] text-white'
                    : 'border-white/20 bg-black/40 text-white hover:border-white/60'
                }`}
              >
                <ThumbsUp className="h-4 w-4" />
              </button>

              <button
                onClick={handleShare}
                aria-label="Share link"
                className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-white/20 bg-black/40 text-white transition-colors hover:border-white/60"
              >
                <Share2 className="h-4 w-4" />
              </button>

              {copiedShare && (
                <span className="text-[10px] uppercase tracking-[0.16em] text-[#46d369]">
                  Link copied
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="space-y-8 px-5 py-7 sm:px-8">
          {/* Metadata & Synopsis Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <p className="text-sm leading-relaxed text-[#d6d6d6] sm:text-[15px]">
                {currentMedia.overview}
              </p>
            </div>

            {/* Cast & Genres Column */}
            <dl className="space-y-2.5 border-l border-white/[0.08] pl-4 text-[11px] leading-relaxed">
              <div>
                <dt className="uppercase tracking-[0.16em] text-[#6f6f6f]">Cast</dt>
                <dd className="mt-0.5 text-[#c8c8c8]">
                  {currentMedia.cast?.length ? currentMedia.cast.slice(0, 4).join(', ') : '—'}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.16em] text-[#6f6f6f]">Genres</dt>
                <dd className="mt-0.5 text-[#c8c8c8]">
                  {currentMedia.genres?.length ? currentMedia.genres.join(', ') : '—'}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.16em] text-[#6f6f6f]">Source</dt>
                <dd className="mt-0.5 text-[#c8c8c8]">
                  {streamSourceLabel(getDefaultServer())}
                </dd>
              </div>
            </dl>
          </div>

          {/* Episodes List (if TV Show or Anime) */}
          {currentMedia.type !== 'movie' && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-2">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a8a8a]">
                  Episodes
                </h3>
                {totalSeasons > 1 && (
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      setSelectedSeason(Number(e.target.value));
                      setSelectedEpisode(1);
                    }}
                    aria-label="Season"
                    className="border border-white/[0.16] bg-transparent px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#c8c8c8] focus:outline-none"
                  >
                    {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => (
                      <option key={sNum} value={sNum} className="bg-[#151515]">
                        Season {sNum}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="max-h-[420px] divide-y divide-white/[0.06] overflow-y-auto pr-1 no-scrollbar">
                {isLoadingEpisodes && (
                  <div className="divide-y divide-white/[0.06]">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-4 px-1 py-3">
                        <div className="h-2 w-4 rounded-sm bg-[#1d1d1d]" />
                        <div className="aspect-video w-32 shrink-0 rounded-[2px] bg-[#1d1d1d]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-2.5 w-1/3 rounded-sm bg-[#1f1f1f]" />
                          <div className="h-2 w-full rounded-sm bg-[#1a1a1a]" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!isLoadingEpisodes && episodesList.length === 0 && (
                  <p className="py-4 text-[11px] text-[#6f6f6f]">Episode data unavailable.</p>
                )}
                {episodesList.map((ep) => (
                  <div
                    key={ep.id}
                    onClick={() => onPlay(currentMedia, selectedSeason, ep.episodeNumber)}
                    className="group flex cursor-pointer flex-col items-start gap-3 px-1 py-3 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center"
                  >
                    <span className="w-5 shrink-0 text-[10px] font-medium tabular-nums text-[#5f5f5f] group-hover:text-white">
                      {ep.episodeNumber}
                    </span>
                    <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-[2px] border border-white/[0.06] bg-[#1a1a1a]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ep.stillUrl || currentMedia.backdropUrl}
                        alt={ep.title}
                        className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/35 transition-colors group-hover:bg-black/10">
                        <Play className="h-5 w-5 fill-white text-white opacity-80" />
                      </div>
                      <span className="absolute bottom-1 right-1 bg-black/80 px-1 text-[9px] text-white">
                        {ep.duration}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h4 className="truncate text-[12px] font-medium text-white">
                          {ep.title}
                        </h4>
                        <span className="hidden shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#6f6f6f] sm:inline">
                          {ep.duration}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-[#8a8a8a]">
                        {ep.overview}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* More Like This — TMDB recommendations first, local genre matches
              fill the rest, rendered as a scrollable rail. */}
          {(recsLoading || similarTitles.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-2">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a8a8a]">
                  More like this
                </h3>
                <span className="text-[10px] text-[#5f5f5f]">
                  {recsLoading && similarTitles.length === 0
                    ? 'Loading'
                    : `${similarTitles.length} titles`}
                </span>
              </div>

              <div className="flex snap-x gap-3 overflow-x-auto pb-1 no-scrollbar">
                {recsLoading && similarTitles.length === 0
                  ? [0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-[150px] shrink-0 sm:w-[168px]">
                        <div className="aspect-video rounded-[3px] border border-white/[0.06] bg-[#161616]" />
                        <div className="mt-2 h-2.5 w-3/4 rounded-sm bg-[#161616]" />
                        <div className="mt-1.5 h-2 w-1/2 rounded-sm bg-[#131313]" />
                      </div>
                    ))
                  : similarTitles.map((item) => {
                      const itemMatch = matchFor(item);
                      return (
                        <button
                          key={`${item.id}-${item.tmdbId ?? ''}`}
                          type="button"
                          onClick={() => {
                            if (onSelectMedia) {
                              onSelectMedia(item);
                            } else {
                              onClose();
                              onPlay(item, 1, 1);
                            }
                          }}
                          className="group w-[150px] shrink-0 snap-start text-left sm:w-[168px]"
                        >
                          <div className="relative aspect-video overflow-hidden rounded-[3px] border border-white/[0.07] bg-[#1a1a1a]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.backdropUrl || item.posterUrl}
                              alt={item.title}
                              className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                            />
                            {itemMatch !== null && (
                              <span className="absolute right-1.5 top-1.5 bg-black/75 px-1 py-0.5 text-[9px] font-medium text-[#c8c8c8]">
                                {itemMatch}%
                              </span>
                            )}
                          </div>
                          <p className="mt-2 truncate text-[11px] font-medium text-white">
                            {item.title}
                          </p>
                          <p className="mt-0.5 truncate text-[9px] uppercase tracking-[0.14em] text-[#6f6f6f]">
                            {item.releaseYear} · {item.rating}
                          </p>
                        </button>
                      );
                    })}
              </div>
            </div>
          )}

          {/* About Section — real TMDB facts only. Previously this printed the
              same hardcoded "Audio / Subtitles / Maturity" copy for every
              title, which TMDB cannot actually tell us (it has no subtitle
              availability data) and which is never true for most films. */}
          <div className="border-t border-white/[0.08] pt-5">
            <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a8a8a]">
              About {currentMedia.title}
            </h4>

            {currentMedia.tagline && (
              <p className="mt-2 text-[13px] italic leading-relaxed text-[#a8a8a8]">
                &ldquo;{currentMedia.tagline}&rdquo;
              </p>
            )}

            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-[11px] leading-relaxed sm:grid-cols-2">
              {currentMedia.originalLanguage && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 uppercase tracking-[0.14em] text-[#6f6f6f]">
                    Original language
                  </dt>
                  <dd className="text-[#c8c8c8]">{currentMedia.originalLanguage}</dd>
                </div>
              )}

              {currentMedia.spokenLanguages && currentMedia.spokenLanguages.length > 0 && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 uppercase tracking-[0.14em] text-[#6f6f6f]">
                    Spoken
                  </dt>
                  <dd className="text-[#c8c8c8]">{currentMedia.spokenLanguages.join(', ')}</dd>
                </div>
              )}

              {currentMedia.releaseDate && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 uppercase tracking-[0.14em] text-[#6f6f6f]">
                    Released
                  </dt>
                  <dd className="text-[#c8c8c8]">
                    {new Date(currentMedia.releaseDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </dd>
                </div>
              )}

              {currentMedia.status && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 uppercase tracking-[0.14em] text-[#6f6f6f]">Status</dt>
                  <dd className="text-[#c8c8c8] capitalize">
                    {currentMedia.status.replace(/_/g, ' ')}
                  </dd>
                </div>
              )}

              {currentMedia.duration && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 uppercase tracking-[0.14em] text-[#6f6f6f]">
                    Runtime
                  </dt>
                  <dd className="text-[#c8c8c8]">{currentMedia.duration}</dd>
                </div>
              )}

              {/* Derived from this title's actual certification, not a fixed string. */}
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 uppercase tracking-[0.14em] text-[#6f6f6f]">
                  Maturity
                </dt>
                <dd className="text-[#c8c8c8]">
                  {currentMedia.rating === 'ALL'
                    ? 'Suitable for all ages.'
                    : `Rated ${currentMedia.rating} and above.`}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

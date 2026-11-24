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

  const handleShare = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-white/10 my-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-[#181818]/80 hover:bg-[#282828] text-white flex items-center justify-center border border-white/20 transition-all hover:scale-110"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Backdrop Banner */}
        <div className="relative aspect-[16/9] max-h-[440px] w-full overflow-hidden">
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
              className="w-full h-full border-0"
            />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentMedia.backdropUrl || currentMedia.posterUrl}
                alt={currentMedia.title}
                className="w-full h-full object-cover object-center"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/30 to-transparent" />
              <div className="absolute inset-0 rellix-hero-gradient opacity-70" />
            </>
          )}

          {/* Banner Details */}
          <div className="absolute bottom-6 left-6 md:left-10 z-10 max-w-xl space-y-3">
            {currentMedia.isOriginal && (
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#E50914]">
                <span className="text-xl font-black">R</span>
                <span className="text-white">
                  {currentMedia.type === 'movie' ? 'FILM' : 'SERIES'}
                </span>
              </div>
            )}

            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white drop-shadow-lg">
              {currentMedia.title}
            </h2>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => onPlay(currentMedia, selectedSeason, selectedEpisode)}
                className="flex items-center gap-2 px-6 py-2 rounded bg-white hover:bg-[#e6e6e6] text-black font-bold text-sm md:text-base transition-all transform active:scale-95 shadow-lg"
              >
                <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                <span>Play Stream</span>
              </button>

              {currentMedia.youtubeTrailerId && (
                <button
                  onClick={() => setShowTrailer(!showTrailer)}
                  className="px-4 py-2 rounded bg-[#333333] hover:bg-[#444444] text-white font-semibold text-xs transition-all border border-white/20"
                >
                  {showTrailer ? 'Close Trailer' : 'Watch Trailer'}
                </button>
              )}

              <button
                onClick={() => onToggleMyList(currentMedia)}
                className="w-10 h-10 rounded-full border border-white/40 bg-black/40 hover:bg-black/80 flex items-center justify-center text-white transition-all hover:scale-105"
                title={isInMyList ? 'Remove from My List' : 'Add to My List'}
              >
                {isInMyList ? (
                  <Check className="w-5 h-5 text-[#46d369]" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={() => onToggleLike?.(currentMedia)}
                className={`w-10 h-10 rounded-full border border-white/40 flex items-center justify-center transition-all hover:scale-105 ${
                  isLiked
                    ? 'bg-[#E50914] text-white border-[#E50914]'
                    : 'bg-black/40 text-white hover:bg-black/80'
                }`}
                title="Rate this title"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>

              <button
                onClick={handleShare}
                className="w-10 h-10 rounded-full border border-white/40 bg-black/40 hover:bg-black/80 flex items-center justify-center text-white transition-all hover:scale-105"
                title="Share link"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {copiedShare && (
                <span className="text-xs text-green-400 font-semibold animate-pulse">
                  Link copied!
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Modal Body */}
        <div className="p-6 md:p-10 space-y-8">
          {/* Metadata & Synopsis Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center flex-wrap gap-2 text-xs md:text-sm text-[#a3a3a3] font-medium">
                {currentMatch !== null && (
                  <span className="text-[#46d369] font-bold text-sm">{currentMatch}% Match</span>
                )}
                <span>{currentMedia.releaseYear}</span>
                <span>
                  {currentMedia.type === 'movie'
                    ? currentMedia.duration || '2h 10m'
                    : `${totalSeasons} ${totalSeasons === 1 ? 'Season' : 'Seasons'}`}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold border border-white/60 text-white rounded-sm">
                  {currentMedia.rating}
                </span>
              </div>

              <p className="text-sm md:text-base text-[#e5e5e5] leading-relaxed">
                {currentMedia.overview}
              </p>
            </div>

            {/* Cast & Genres Column */}
            <div className="space-y-3 text-xs md:text-sm text-[#737373]">
              <div>
                <span className="text-[#a3a3a3]">Cast: </span>
                <span className="text-white">
                  {currentMedia.cast?.slice(0, 4).join(', ')}
                </span>
              </div>
              <div>
                <span className="text-[#a3a3a3]">Genres: </span>
                <span className="text-white">{currentMedia.genres?.join(', ')}</span>
              </div>
              <div>
                <span className="text-[#a3a3a3]">Stream Provider: </span>
                <span className="text-white font-mono text-xs">
                  {streamSourceLabel(getDefaultServer())}
                </span>
              </div>
            </div>
          </div>

          {/* Episodes List (if TV Show or Anime) */}
          {currentMedia.type !== 'movie' && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Episodes</h3>
                {totalSeasons > 1 && (
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      setSelectedSeason(Number(e.target.value));
                      setSelectedEpisode(1);
                    }}
                    className="bg-[#2a2a2a] text-xs font-semibold text-white px-3 py-1.5 rounded border border-white/20 focus:outline-none"
                  >
                    {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => (
                      <option key={sNum} value={sNum}>
                        Season {sNum}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="divide-y divide-white/10 max-h-[420px] overflow-y-auto pr-1 no-scrollbar">
                {isLoadingEpisodes && (
                  <div className="divide-y divide-white/10 animate-pulse">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-4 py-4 px-2">
                        <div className="w-6 h-4 bg-[#242424] rounded" />
                        <div className="w-36 aspect-video bg-[#242424] rounded shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-1/3 bg-[#242424] rounded" />
                          <div className="h-2 w-full bg-[#1f1f1f] rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!isLoadingEpisodes && episodesList.length === 0 && (
                  <p className="text-xs text-[#737373] py-4">Episode data unavailable.</p>
                )}
                {episodesList.map((ep) => (
                  <div
                    key={ep.id}
                    onClick={() => onPlay(currentMedia, selectedSeason, ep.episodeNumber)}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-4 hover:bg-white/5 px-2 rounded-lg cursor-pointer transition-colors group"
                  >
                    <span className="text-base font-bold text-[#737373] w-6 shrink-0 group-hover:text-white">
                      {ep.episodeNumber}
                    </span>
                    <div className="relative w-36 aspect-video rounded overflow-hidden bg-[#242424] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ep.stillUrl || currentMedia.backdropUrl}
                        alt={ep.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 flex items-center justify-center">
                        <Play className="w-6 h-6 fill-white text-white drop-shadow-md opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      </div>
                      <span className="absolute bottom-1 right-1 text-[10px] bg-black/80 px-1 rounded text-white">
                        {ep.duration}
                      </span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-white group-hover:text-[#E50914] transition-colors">
                          {ep.title}
                        </h4>
                        <span className="text-xs text-[#a3a3a3] hidden sm:inline">
                          {ep.duration}
                        </span>
                      </div>
                      <p className="text-xs text-[#a3a3a3] leading-relaxed line-clamp-2">
                        {ep.overview}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* More Like This Grid */}
          {moreLikeThis.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="text-lg font-bold text-white">More Like This</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
                {moreLikeThis.slice(0, 6).map((item) => {
                  const itemMatch = matchFor(item);
                  return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onSelectMedia) {
                        onSelectMedia(item);
                      } else {
                        onClose();
                        onPlay(item, 1, 1);
                      }
                    }}
                    className="bg-[#242424] rounded-lg overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform group border border-white/5"
                  >
                    <div className="relative aspect-video w-full overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.backdropUrl || item.posterUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      {itemMatch !== null && (
                        <div className="absolute top-2 right-2 text-xs font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
                          {itemMatch}% Match
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="font-bold text-xs text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-[#a3a3a3] line-clamp-2">{item.overview}</p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* About Section — real TMDB facts only. Previously this printed the
              same hardcoded "Audio / Subtitles / Maturity" copy for every
              title, which TMDB cannot actually tell us (it has no subtitle
              availability data) and which is never true for most films. */}
          <div className="space-y-2 pt-4 border-t border-white/10 text-xs text-[#737373]">
            <h4 className="font-bold text-sm text-white mb-2">About {currentMedia.title}</h4>

            {currentMedia.tagline && (
              <p className="italic text-[#a3a3a3]">&ldquo;{currentMedia.tagline}&rdquo;</p>
            )}

            {currentMedia.originalLanguage && (
              <p>
                <span className="text-[#a3a3a3]">Original language: </span>
                {currentMedia.originalLanguage}
              </p>
            )}

            {currentMedia.spokenLanguages && currentMedia.spokenLanguages.length > 0 && (
              <p>
                <span className="text-[#a3a3a3]">Spoken languages: </span>
                {currentMedia.spokenLanguages.join(', ')}
              </p>
            )}

            {currentMedia.releaseDate && (
              <p>
                <span className="text-[#a3a3a3]">Released: </span>
                {new Date(currentMedia.releaseDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}

            {currentMedia.status && (
              <p>
                <span className="text-[#a3a3a3]">Status: </span>
                {currentMedia.status.replace(/_/g, ' ')}
              </p>
            )}

            {currentMedia.duration && (
              <p>
                <span className="text-[#a3a3a3]">Runtime: </span>
                {currentMedia.duration}
              </p>
            )}

            {/* Derived from this title's actual certification, not a fixed string. */}
            <p>
              <span className="text-[#a3a3a3]">Maturity rating: </span>
              {currentMedia.rating === 'ALL'
                ? 'Suitable for all ages.'
                : `Rated ${currentMedia.rating} and above.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

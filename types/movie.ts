export type MediaType = 'movie' | 'tv' | 'anime';

export interface Episode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  duration: string;
  overview: string;
  stillUrl: string;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  episodes: Episode[];
}

export interface MediaItem {
  id: string;
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  type: MediaType;
  tagline?: string;
  creatorOrDirector?: string;
  isOriginal?: boolean;
  heroHeadline?: string; // e.g. "TYLER PERRY'S"
  releaseYear: number;
  seasonsCount?: number;
  duration?: string; // for movies e.g. "2h 15m"
  rating: 'ALL' | '7+' | '13+' | '16+' | '18+';
  matchScore: number; // e.g. 98%
  overview: string;
  backdropUrl: string;
  posterUrl: string;
  genres: string[];
  cast: string[];
  countryOfOrigin?: string;
  // Real TMDB facts. Populated by getDetails() only — TMDB list endpoints do
  // not return them, so these are absent on rail/browse items.
  originalLanguage?: string;
  spokenLanguages?: string[];
  releaseDate?: string;
  status?: string;
  top10Rank?: number; // 1 to 10
  top10Category?: string; // "TV Shows in Nigeria Today"
  isTrending?: boolean;
  isNewRelease?: boolean;
  seasons?: Season[];
  continueWatchingProgress?: number; // 0 to 100%
  remainingMinutes?: number;
  continueWatchingSeason?: number;
  continueWatchingEpisode?: number;
  streamUrl?: string;
  youtubeTrailerId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarUrl: string;
  isKid: boolean;
  /**
   * Whether a PIN is set. The digest never leaves this browser: it is a salted
   * PBKDF2 hash stored in IndexedDB and compared locally. Treat it as a UX lock
   * (it keeps other people in the room out of a profile), not as a security
   * boundary — anyone with devtools can read the store.
   */
  hasPin?: boolean;
  /**
   * How many digits this profile's PIN has: 4 or 6, chosen when the PIN was set.
   * The lock screen needs this to know how many digits to render BEFORE the user
   * types anything. 0 means no PIN is set.
   */
  pinLength?: number;
}

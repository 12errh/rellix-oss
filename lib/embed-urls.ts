import { MediaItem } from '@/types/movie';

/**
 * Stream source identifiers.
 *
 * These values select a provider. Keep them stable — they are stored in each
 * viewer's preferences, so renaming one silently resets their choice.
 *
 * What users SEE is `STREAM_SOURCE_LABELS` below, which uses descriptive names
 * instead of the providers' own branding. Users don't know or care that
 * "nxsha" is a provider; they want to know which one is the default and which
 * are alternates.
 *
 * Two sources were removed after browser testing in 2026-10:
 *   nxsha_watch — the direct-play variant. Sandbox testing showed the embed and
 *     watch paths return the same catalog, so it was redundant rather than a
 *     distinct fallback.
 *   filmu       — refused to run inside the iframe sandbox (no player rendered).
 */
export type StreamServer = 'nxsha_embed' | 'moviesapi' | 'vidsrcpm' | 'custom';

export const DEFAULT_SERVER: StreamServer = 'nxsha_embed';

/** Ordered as they appear in the source picker. */
export const STREAM_SOURCES: StreamServer[] = [
  'nxsha_embed',
  'vidsrcpm',
  'moviesapi',
  'custom',
];

/**
 * Display names. "Primary" / "Backup N" describe what each source is for, which
 * is the only thing a viewer can act on.
 */
export const STREAM_SOURCE_LABELS: Record<StreamServer, string> = {
  nxsha_embed: 'Primary',
  vidsrcpm: 'Backup 1',
  moviesapi: 'Backup 2',
  custom: 'Custom URL',
};

export function streamSourceLabel(server: StreamServer): string {
  return STREAM_SOURCE_LABELS[server] ?? server;
}

/**
 * Only absolute http(s) URLs are ever allowed into an iframe src.
 *
 * This is a gadget check, not an SSRF guard — the browser is the only thing that
 * loads the URL, so there is no internal network to protect. It exists to reject
 * `javascript:`, `data:` and `blob:` values that would otherwise run in this
 * origin's context if the sandbox were ever loosened.
 */
export function isSafeEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildEmbedUrl(opts: {
  server: StreamServer;
  media: Pick<MediaItem, 'type' | 'title'> & { tmdbId?: number };
  season: number;
  episode: number;
  customUrl?: string;
}): string {
  const { server, media, season, episode, customUrl } = opts;

  // Custom URLs are not tied to a TMDB id and remain usable for local titles.
  if (server === 'custom' && customUrl?.trim()) {
    return customUrl.trim();
  }

  // Never substitute another title's id: a missing id must produce the
  // player's explicit error, not a different film or show.
  if (!media.tmdbId) return '';
  const tmdb = media.tmdbId;

  if (server === 'vidsrcpm') {
    if (media.type === 'movie') return `https://vidsrc.pm/embed/movie/${tmdb}`;
    return `https://vidsrc.pm/embed/tv/${tmdb}/${season}/${episode}`;
  }

  if (server === 'moviesapi') {
    if (media.type === 'movie') return `https://moviesapi.to/movie/${tmdb}`;
    return `https://moviesapi.to/tv/${tmdb}/${season}/${episode}`;
  }

  // nxsha_embed, and the fallback for an unrecognised source. Must branch on
  // media type like the others — falling through to the movie path here is what
  // made anime resolve to /movie/{id} when the explicit branch was removed.
  if (media.type === 'movie') return `https://nxsha.space/embed/movie/${tmdb}`;
  return `https://nxsha.space/embed/tv/${tmdb}/${season}/${episode}`;
}

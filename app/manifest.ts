import type { MetadataRoute } from 'next';

/**
 * Static export: a metadata route is fetched at build time, so it has to be
 * declared static explicitly. Without this, `next build` refuses to collect
 * the page data (output: 'export' has no server to render it on demand).
 */
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rellix',
    short_name: 'Rellix',
    description: 'Watch movies, TV shows, and anime with embed playback',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#111111',
    theme_color: '#111111',
    icons: [
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['entertainment'],
  };
}

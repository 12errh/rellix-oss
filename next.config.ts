import type { NextConfig } from 'next';

/**
 * Static export.
 *
 * This build has no server: `next build` emits plain HTML/CSS/JS into `out/`,
 * which can be served by GitHub Pages, Netlify, Cloudflare Pages, nginx, or any
 * static host.
 *
 * That rules out everything server-shaped — route handlers, middleware,
 * `headers()`, rewrites and ISR. Security headers therefore ship as
 * `public/_headers` (Netlify / Cloudflare Pages) with an nginx equivalent in the
 * README, because a static host has to be told about them out of band.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  output: 'export',
  // Emit `about/index.html` rather than `about.html`, which is what most static
  // hosts expect and what keeps `/settings/` links working.
  trailingSlash: true,

  images: {
    // No Next image optimiser exists without a server. The app already renders
    // posters as plain <img> tags straight from TMDB's CDN, so this only affects
    // any future next/image use.
    unoptimized: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  webpack: (config, { dev }) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;

# Rellix — Agent Context

> **Scope: web app only.** There is no backend, no desktop shell and no auth. This tree is
> a static Next.js export whose only network dependency is TMDB.

## What this is

**Rellix** is a Netflix-style **metadata browser and embed launcher** for movies, TV shows
and anime. Metadata comes from TMDB; playback is delegated to third-party iframe providers.
Everything else — profiles, PINs, My List, likes, watch progress, cached catalogue data —
lives in the visitor's browser.

It is **not** a streaming service: the app hosts, proxies and transcodes nothing.

## Stack

- Next.js 15 App Router, React 19, TypeScript strict, Tailwind 4
- `output: 'export'` — `npm run build` emits static files into `out/`
- No server runtime: no route handlers, middleware, `headers()`, rewrites, or ISR
- IndexedDB + localStorage for all state
- TMDB v3 called directly from the browser (TMDB sends `access-control-allow-origin: *`)

## Commands

```bash
npm run dev        # dev server
npm run build      # static export → out/
npm run preview    # serve out/ locally
npm run lint       # eslint (expected: 0 errors, 8 no-img-element warnings)
npm run typecheck  # tsc --noEmit
```

If the dev server 500s with `MODULE_NOT_FOUND` in `.next/server`, delete `.next/` and
rebuild.

## Environment

```
NEXT_PUBLIC_TMDB_API_KEY=...   # optional build-time default; PUBLIC, inlined in the bundle
```

Without it, the app prompts each visitor for a TMDB v3 key and stores it in localStorage
(`lib/tmdb-key.ts`). There is no server to hide a key behind.

## Data model (browser only)

```
profiles (IndexedDB)  id, name, avatarUrl, isKid, pinHash, pinSalt, pinLength, createdAt
watchlist             key = `${profileId}:${mediaId}`, media snapshot, addedAt
continue_watching     same key, progressPercent, season/episode, remainingMinutes, updatedAt
likes                 same key, addedAt
localStorage          rellix_tmdb_key, rellix_default_server, rellix_custom_embed_url,
                      PIN guard/lock keys, rellix_app_settings
sessionStorage        rellix_active_profile_id (plus an in-memory copy)
```

`lib/db.ts` is the only writer. It falls back to in-memory Maps when IndexedDB is
unavailable (private mode) so the UI still works for the session.

## How the catalogue layer works

The UI was written against seven read-only `/api/media/*` routes (`latest`, `browse`,
`search`, `suggest`, `discover`, `details`, `recommendations`). Those routes are gone, but
their **URL contract survived**:

- `lib/client-tmdb.ts` — the browser port of the old server TMDB logic: mapping, rating
  buckets, anime classification, fuzzy-search rescue, discover filters.
- `lib/client-media.ts` — `mediaFetch(input, init)`. Parses the same query strings and
  returns a real `Response` with the same JSON shapes and status codes. Components call
  `mediaFetch` instead of `fetch`; abort signals surface as `AbortError`, and upstream
  failures return `502 { error: 'upstream_failed' }`.
- `lib/kid-safe.ts` — session kid-mode flag and the list filter `client-media` applies to
  every catalogue payload.

Keep the `/api/media/*` shapes stable unless you also change every caller. They are an
internal shim now, not HTTP endpoints.

TMDB traffic is bounded in three layers:

- `lib/tmdb-cache.ts` — IndexedDB TTL cache (1h lists, 30d certifications) plus a memory
  layer. Cache keys include a fingerprint of the active TMDB key, so replacing a visitor's
  key cannot serve responses cached under the old one.
- In-flight promise maps — identical concurrent list/cert requests share one call.
- A process-wide semaphore (`CERT_MAX_CONCURRENT = 10`) for certification hydration.
  The per-rail worker pool alone is not a real limit; keep the semaphore if you touch it.

Rails are lazy: an `IntersectionObserver` only decides when the page-1 fetch runs, and no
rail pages itself. A rail advances only when its horizontal track reaches the right edge or
the user asks for more. Grids page through `usePagedFeed` on scroll or the Load More button.

`hooks/use-paged-feed.ts` refetches page 1 whenever `fetchPage`'s **identity** changes, so
every `useCallback` dependency array is load-bearing. `MAX_PAGES = 20` must stay at least as
large as the page cap in `lib/client-tmdb.ts` (also 20).

## Invariants — do not regress

1. **Static export constraints.** No `headers()`, middleware, rewrites, route handlers,
   dynamic metadata routes without `export const dynamic = 'force-static'`. Adding a server
   feature means the project is no longer static.
2. **Security headers live out of band.** `public/_headers` (Netlify / Cloudflare Pages) and
   the nginx snippet in the README. `connect-src` must include `https://api.themoviedb.org`;
   `frame-src` is `https:` because Custom URL accepts any public http(s) host.
3. **The TMDB key is public.** `NEXT_PUBLIC_TMDB_API_KEY` is inlined into the JS bundle.
   Never put a secret there. Per-visitor keys live in localStorage and go only to TMDB.
4. **The PIN is a UX lock, not a security boundary.** Salted PBKDF2 when WebCrypto exists;
   salted FNV fallback on insecure origins; escalating local lockout (30s after 5 wrong
   attempts, doubling to 5 minutes). Never describe it as encryption or data protection. A
   PIN-locked profile re-locks on reload (`app/page.tsx`); do not restore it straight into
   the shell. Changing/removing a PIN and deleting a PIN-locked profile require the current
   PIN in `lib/db.ts`, because Settings is reachable without unlocking the profile.
5. **Deleting the last profile is refused** by `browserDB.deleteProfile`. An app with no
   profile has no way back in. The Add/Edit modals surface the refusal.
6. **Embed URLs are built client-side** by `lib/embed-urls.ts` (`buildEmbedUrl`). The
   `StreamServer` values are stored in each viewer's preferences, so renaming one silently
   resets their source choice. Users see `STREAM_SOURCE_LABELS`, not internal keys.
7. **Custom URLs are scheme-checked** with `isSafeEmbedUrl` (http/https only) before they
   reach an iframe `src`. This is a gadget check, not SSRF: the browser loads the URL.
   Without a valid URL the player renders an explicit message and no iframe.
8. **Iframe sandbox is fixed** at `allow-scripts allow-same-origin allow-presentation
   allow-modals`. `allow-same-origin` is required — removing it breaks React-based embeds.
   The sandbox stops popups/top-navigation; it does **not** stop in-frame ads. Do not
   describe it as an ad blocker.
9. **Progress messages are origin-checked.** The player only accepts `postMessage` progress
   from the built-in provider origins or the current Custom URL's origin. Without the check
   any framed page could write arbitrary progress.
10. **Watch progress is best-effort**: real elapsed time ÷ assumed runtime when the embed
    sends no progress messages.
11. **Notification ids / timestamps:** no notification system exists in this build. Do not
    reintroduce `Date.now()` in any read-state key if one is added.
12. **Service worker is network-first** (`public/sw.js`). A redeploy must win over the
    cached shell; the cache only answers when the network fails. `sw.js` must stay
    `no-cache`.
13. **Kids profiles are filtered at the catalogue boundary.** `lib/kid-safe.ts` holds the
    session flag and `lib/client-media.ts` applies `filterKidPayload` to every list payload
    before returning it. Tabs also send `rating=7+` to TMDB discover. Do not bypass
    `mediaFetch` for catalogue lists, or a kids profile will leak adult titles.

## Architecture notes

- `app/page.tsx` — single client page; owns `activeTab`, profile state, watchlist/likes/
  continue-watching, modal state, `isInitialLoading`, `maxProfiles`. `lib/profile-session.ts`
  keeps the active profile id in memory for client-side navigation and in sessionStorage
  for reloads; a new tab starts at the picker. Render gates in order:
  `!profilesLoaded` → no profiles (`Onboarding`) → `pinTarget` → `!currentProfile` → app
  shell.
- `app/settings/page.tsx` — Profiles / Playback / TMDB / Storage / About, all local.
- Kid filtering is a catalogue-boundary rule (`lib/kid-safe.ts` + `filterKidPayload` in
  `lib/client-media.ts`), so rails, tabs, search and suggestions cannot forget to opt in.
  Rating facets that imply adult ranges are hidden for kids profiles. More Like This still
  lives in `app/page.tsx`.
- `% Match` shown to users is `computeMatch()` from `lib/taste.ts` with the profile passed
  from `components/TasteProvider.tsx`; it is never TMDB's raw value, and there is no
  module-global taste state.
- No `next/image`: posters are raw `<img>` tags from TMDB's CDN (hence the eight
  `no-img-element` warnings; they are expected and cost no Vercel bandwidth because there
  is no Vercel).
- `lib/home-rails.ts` builds home rails from a registry; `MediaRail` accepts either a full
  query string or `apiPath` (`recommendations`, `trending_now`).

## Known intentional behaviours

- A profile without a PIN resumes after reload; a PIN-locked one shows the lock screen.
- Clearing site data deletes everything. Settings → Storage offers a JSON export and a
  factory reset.
- The offline fallback catalogue (`lib/movies-data.ts`) keeps the shell populated when TMDB
  fails; `latest` marks that payload `degraded: true` and the home feed retries once.
- Provider availability changes in weeks. There is no server-side test harness any more;
  verify a source by opening a known title and watching for "Sandbox is not allowed" /
  "Please Disable Sandbox" text in the frame.

## Legal

The default embed sources are third-party sites that may host unlicensed material. That is
a deployment risk, not a code bug. Keep the README warning, and prefer neutral/Custom
sources for any public deployment.

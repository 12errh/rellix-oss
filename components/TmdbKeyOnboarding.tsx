'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getTmdbKey, validateTmdbKey, setTmdbKey, onTmdbKeyChange } from '@/lib/tmdb-key';
import { browserDB } from '@/lib/db';

/**
 * TMDB key gate.
 *
 * This build has no server and therefore no bundled credential, so the app
 * cannot show a single poster until it has a key.
 *
 * First run is handled by <Onboarding>, which asks for the key and the first
 * profile together. This modal only exists for the other case: a browser that
 * already has profiles but no usable key (for example, the key was removed in
 * Settings). It deliberately stays out of the way on the Settings page, which
 * has its own TMDB tab.
 *
 * It lives in the root layout, so it has to re-check on both events that can
 * change the answer: the pathname (leaving Settings) and the key itself (the
 * Remove key button). Checking only on mount left a browser with a removed key
 * on the fallback catalogue until a manual reload.
 *
 * The key is stored in this browser's localStorage and sent only to
 * api.themoviedb.org.
 */
export default function TmdbKeyOnboarding() {
  const [needsKey, setNeedsKey] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (getTmdbKey()) {
        if (!cancelled) setNeedsKey(false);
        return;
      }
      // Settings has its own key field; a modal on top of it would be noise.
      if (pathname?.startsWith('/settings')) {
        if (!cancelled) setNeedsKey(false);
        return;
      }
      const profiles = await browserDB.getProfiles().catch(() => []);
      if (!cancelled) setNeedsKey(profiles.length > 0);
    };

    void check();
    const unsubscribe = onTmdbKeyChange(() => void check());

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pathname]);

  if (!needsKey) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    const verdict = await validateTmdbKey(key);
    if (!verdict.ok) {
      setError(verdict.error ?? 'Could not validate that key.');
      setBusy(false);
      return;
    }

    setTmdbKey(key);
    // A full reload is deliberate: every mounted rail, tab and cached query was
    // created without a key and would otherwise stay empty until remounted.
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-2">Add your TMDB API key</h2>
        <p className="text-xs text-[#a3a3a3] leading-relaxed mb-4">
          Rellix needs a free TMDB API key to load real posters, ratings, seasons,
          search results, and every rail. The key is stored only in this browser
          and is sent directly to The Movie Database.
        </p>
        <ol className="text-xs text-[#d4d4d4] space-y-1 mb-4 list-decimal list-inside">
          <li>
            Open{' '}
            <a
              href="https://www.themoviedb.org/login?signup=1"
              target="_blank"
              rel="noreferrer"
              className="text-[#E50914] underline"
            >
              TMDB
            </a>{' '}
            and create a free account.
          </li>
          <li>
            Go to Settings → API → copy the <em>API Key (v3 auth)</em>.
          </li>
          <li>Paste it below and click Save.</li>
        </ol>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && key.trim() && !busy) void save();
          }}
          placeholder="e.g. abc1234..."
          autoFocus
          className="w-full rounded-md bg-[#1f1f1f] border border-white/10 px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#E50914] mb-3"
        />
        {error && <p className="text-xs text-[#E50914] mb-3">{error}</p>}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void save()}
            disabled={busy || !key.trim()}
            className="rounded-full bg-[#E50914] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-[#b8070f]"
          >
            {busy ? 'Validating...' : 'Save & reload'}
          </button>
          <button
            onClick={() => setNeedsKey(false)}
            className="rounded-full px-4 py-2 text-xs text-[#a3a3a3] hover:text-white"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}

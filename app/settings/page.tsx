'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  User,
  Play,
  KeyRound,
  Database,
  Info,
  ChevronLeft,
  Trash2,
  Download,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react';
import { UserProfile } from '@/types/movie';
import {
  browserDB,
  clearEverything,
  clearHistory,
  clearWatchlist,
  exportData,
} from '@/lib/db';
import { DEFAULT_MAX_PROFILES } from '@/lib/profile-limits';
import {
  getDefaultServer,
  setDefaultServer,
  getCustomEmbedUrl,
  setCustomEmbedUrl,
} from '@/lib/prefs';
import {
  STREAM_SOURCES,
  STREAM_SOURCE_LABELS,
  isSafeEmbedUrl,
  type StreamServer,
} from '@/lib/embed-urls';
import {
  getTmdbKey,
  setTmdbKey,
  clearTmdbKey,
  validateTmdbKey,
  isUsingBuildTimeKey,
} from '@/lib/tmdb-key';
import { clearTmdbCache } from '@/lib/tmdb-cache';
import { EditProfileModal } from '@/components/profiles/EditProfileModal';

type Tab = 'profiles' | 'playback' | 'tmdb' | 'storage' | 'about';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profiles', label: 'Profiles', icon: <User className="h-4 w-4" /> },
  { id: 'playback', label: 'Playback', icon: <Play className="h-4 w-4" /> },
  { id: 'tmdb', label: 'TMDB', icon: <KeyRound className="h-4 w-4" /> },
  { id: 'storage', label: 'Storage', icon: <Database className="h-4 w-4" /> },
  { id: 'about', label: 'About', icon: <Info className="h-4 w-4" /> },
];

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E50914]/15 text-[#E50914]">
          {icon}
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
      </header>
      {children}
    </section>
  );
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70';

const primaryButton =
  'rounded-xl bg-[#E50914] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#f6121d] disabled:opacity-50';

const dangerButton =
  'rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-bold text-[#ff6b6b] transition hover:bg-red-500/20 disabled:opacity-50';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'profiles';
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'playback' || t === 'tmdb' || t === 'storage' || t === 'about'
      ? t
      : 'profiles';
  });

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserProfile | null>(null);

  const [server, setServer] = useState<StreamServer>(() => getDefaultServer());
  const [customUrl, setCustomUrl] = useState(() => getCustomEmbedUrl());
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);

  const [keyInput, setKeyInput] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [buildKey, setBuildKey] = useState(false);

  const [counts, setCounts] = useState({ watchlist: 0, likes: 0, history: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const stored = await browserDB.getProfiles();
    setProfiles(stored);

    let watchlist = 0;
    let likes = 0;
    let history = 0;
    for (const p of stored) {
      const [w, l, h] = await Promise.all([
        browserDB.getWatchlist(p.id),
        browserDB.getLikes(p.id),
        browserDB.getContinueWatching(p.id),
      ]);
      watchlist += w.length;
      likes += l.length;
      history += h.length;
    }
    setCounts({ watchlist, likes, history });
    setLoading(false);
  }, []);

  useEffect(() => {
    // Read after mount: IndexedDB is not available during the static export.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Read after mount: localStorage is not available during the static export.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasKey(Boolean(getTmdbKey()));
    setBuildKey(isUsingBuildTimeKey());
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    setNotice(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState({}, '', url);
    } catch {}
  };

  const saveKey = async () => {
    setKeyMessage(null);
    setKeyBusy(true);
    const verdict = await validateTmdbKey(keyInput);
    setKeyBusy(false);
    if (!verdict.ok) {
      setKeyMessage({ ok: false, text: verdict.error ?? 'Could not validate that key.' });
      return;
    }
    setTmdbKey(keyInput);
    await clearTmdbCache();
    setHasKey(true);
    setBuildKey(false);
    setKeyInput('');
    setKeyMessage({
      ok: true,
      text: 'Key saved and cached catalogue cleared. Rellix will use the new key for all requests.',
    });
  };

  const removeKey = async () => {
    clearTmdbKey();
    await clearTmdbCache();
    setHasKey(Boolean(getTmdbKey()));
    setBuildKey(isUsingBuildTimeKey());
    setKeyMessage({ ok: true, text: 'Key removed from this browser.' });
  };

  const downloadBackup = async () => {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rellix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    // Firefox ignores a click on a detached anchor, and revoking the object URL
    // in the same tick can kill the download in Chrome. Attach, click, then
    // release on the next tick.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const wipeHistory = async () => {
    setBusy('history');
    await Promise.all(profiles.map((p) => clearHistory(p.id)));
    await refresh();
    setBusy(null);
    setNotice('Watch history cleared on every profile.');
  };

  const wipeList = async () => {
    setBusy('watchlist');
    await Promise.all(profiles.map((p) => clearWatchlist(p.id)));
    await refresh();
    setBusy(null);
    setNotice('My List cleared on every profile.');
  };

  const reloadCatalogue = async () => {
    setBusy('cache');
    await clearTmdbCache();
    setBusy(null);
    setNotice('Cached TMDB data cleared. The next page load fetches fresh data.');
  };

  const factoryReset = async () => {
    if (
      !window.confirm(
        'Delete every profile, list, like, progress record, device setting, TMDB key and cached response stored in this browser? This cannot be undone.'
      )
    ) {
      return;
    }
    setBusy('all');
    await clearEverything();
    await clearTmdbCache();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <main className="min-h-screen max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 animate-pulse">
        <div className="h-8 w-40 rounded-lg bg-white/10" />
        {[0, 1, 2].map((i) => (
          <section key={i} className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <div className="h-4 w-28 rounded bg-white/10" />
            <div className="h-12 rounded-xl bg-white/5" />
          </section>
        ))}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-white sm:px-6 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <Link href="/" className="flex items-center gap-1 text-sm text-[#a3a3a3] transition hover:text-white">
            <ChevronLeft className="h-4 w-4" /> Back to Rellix
          </Link>
        </header>

        <nav className="grid grid-cols-5 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1.5 sm:flex sm:justify-center sm:gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`flex flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1 py-2 text-[10px] font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
                tab === t.id
                  ? 'bg-[#E50914] text-white shadow-[0_6px_24px_-8px_rgba(229,9,20,0.6)]'
                  : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {notice && (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {notice}
          </p>
        )}

        {tab === 'profiles' && (
          <Section icon={<User className="h-4 w-4" />} title="Profiles">
            <p className="mb-4 text-sm text-[#a3a3a3]">
              {profiles.length} of {DEFAULT_MAX_PROFILES} profiles. Each one keeps its
              own My List, likes and watch progress in this browser.
            </p>

            <div className="divide-y divide-white/5">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <img src={p.avatarUrl} alt="" className="h-10 w-10 rounded-lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-[11px] text-[#737373]">
                        {p.isKid ? 'Kids profile' : 'Profile'}
                        {p.hasPin ? ` · ${p.pinLength ?? 4}-digit PIN` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing(p)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#a3a3a3] transition hover:bg-white/5 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              ))}
            </div>

            <Link
              href="/"
              className="mt-4 inline-block text-sm text-[#E50914] hover:underline"
            >
              Open the profile picker to add or switch profiles
            </Link>
          </Section>
        )}

        {tab === 'playback' && (
          <Section icon={<Play className="h-4 w-4" />} title="Playback">
            <p className="mb-3 text-sm text-[#a3a3a3]">Default streaming source.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STREAM_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setServer(s);
                    setDefaultServer(s);
                  }}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    server === s
                      ? 'border-[#E50914] bg-[#E50914]/15 text-white'
                      : 'border-white/10 bg-black/40 text-[#a3a3a3] hover:text-white'
                  }`}
                >
                  {STREAM_SOURCE_LABELS[s]}
                  {server === s && <Check className="ml-2 inline h-3.5 w-3.5 text-[#E50914]" />}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-xs font-bold uppercase text-[#888]" htmlFor="custom-url">
                Custom embed URL
              </label>
              <input
                id="custom-url"
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  setCustomUrlError(null);
                }}
                onBlur={() => {
                  const next = customUrl.trim();
                  // Same check the player applies before it touches the iframe
                  // src. Saving a `javascript:` value here would not execute —
                  // the player refuses it — but storing something the player
                  // will reject is a trap, so refuse it at the source.
                  if (next && !isSafeEmbedUrl(next)) {
                    setCustomUrlError('Enter a full http:// or https:// URL.');
                    return;
                  }
                  setCustomEmbedUrl(next);
                }}
                placeholder="https://example.com/embed/movie/603"
                className={inputClass}
              />
              {customUrlError && (
                <p className="text-[11px] text-[#ff8a8a]">{customUrlError}</p>
              )}
              <p className="text-[11px] text-[#6f6f6f]">
                Used only when the Custom URL source is selected in the player. Must
                start with http:// or https://. Rellix does not provide or endorse any
                custom source.
              </p>
            </div>

            <p className="mt-5 text-[11px] text-[#6f6f6f]">
              Playback always happens in the provider&apos;s own iframe. Every source,
              including a Custom URL, is loaded in the same sandbox; that stops popups
              and top-level navigation, but not ads served inside the frame.
            </p>
          </Section>
        )}

        {tab === 'tmdb' && (
          <Section icon={<KeyRound className="h-4 w-4" />} title="TMDB API key">
            <p className="mb-4 text-sm text-[#a3a3a3]">
              Metadata comes from TMDB, which needs a free API key. The key is stored
              in this browser and sent only to api.themoviedb.org.
            </p>

            <p className="mb-4 text-sm">
              Status:{' '}
              {hasKey ? (
                <span className="font-semibold text-emerald-400">
                  {buildKey ? 'Using the key built into this deployment' : 'Key saved in this browser'}
                </span>
              ) : (
                <span className="font-semibold text-[#E50914]">No key</span>
              )}
            </p>

            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste a TMDB v3 API key"
              autoComplete="off"
              className={inputClass}
            />

            {keyMessage && (
              <p
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  keyMessage.ok
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/20 bg-red-500/10 text-[#ff8a8a]'
                }`}
              >
                {keyMessage.text}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => void saveKey()}
                disabled={keyBusy || !keyInput.trim()}
                className={primaryButton}
              >
                {keyBusy ? 'Validating…' : 'Validate & save'}
              </button>
              {hasKey && !buildKey && (
                <button onClick={removeKey} className={dangerButton}>
                  Remove key
                </button>
              )}
            </div>

            <p className="mt-4 text-[11px] text-[#6f6f6f]">
              Get a key at themoviedb.org → Settings → API. This product uses the TMDB
              API but is not endorsed or certified by TMDB.
            </p>
          </Section>
        )}

        {tab === 'storage' && (
          <Section icon={<Database className="h-4 w-4" />} title="Storage">
            <div className="mb-5 grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'My List', value: counts.watchlist },
                { label: 'Likes', value: counts.likes },
                { label: 'In progress', value: counts.history },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-black/40 px-3 py-4">
                  <p className="text-2xl font-bold text-white">{item.value}</p>
                  <p className="text-[11px] uppercase tracking-wider text-[#737373]">{item.label}</p>
                </div>
              ))}
            </div>

            <p className="mb-4 text-sm text-[#a3a3a3]">
              Everything lives in this browser. Nothing is uploaded, and there is no
              account to restore from — export a backup if you care about this data.
            </p>

            <div className="flex flex-wrap gap-3">
              <button onClick={() => void downloadBackup()} className={primaryButton}>
                <Download className="mr-2 inline h-4 w-4" /> Export backup
              </button>
              <button
                onClick={() => void reloadCatalogue()}
                disabled={busy !== null}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {busy === 'cache' ? 'Clearing…' : 'Clear cached catalogue'}
              </button>
            </div>

            <div className="mt-5 space-y-3 border-t border-white/5 pt-5">
              <button
                onClick={() => void wipeHistory()}
                disabled={busy !== null}
                className={dangerButton}
              >
                {busy === 'history' ? 'Clearing…' : 'Clear watch history'}
              </button>
              <button
                onClick={() => void wipeList()}
                disabled={busy !== null}
                className={`${dangerButton} ml-0 sm:ml-3`}
              >
                {busy === 'watchlist' ? 'Clearing…' : 'Clear My List'}
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <p className="mb-2 text-sm font-bold text-[#ff6b6b]">Delete everything</p>
              <p className="mb-3 text-xs text-[#a3a3a3]">
                Removes every profile, My List entry, like, progress record,
                device setting, the TMDB key and all cached metadata from this
                browser. There is no account to restore from.
              </p>
              <button onClick={() => void factoryReset()} disabled={busy !== null} className={dangerButton}>
                {busy === 'all' ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 inline h-4 w-4" /> Delete all local data
                  </>
                )}
              </button>
            </div>
          </Section>
        )}

        {tab === 'about' && (
          <Section icon={<Info className="h-4 w-4" />} title="About Rellix">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[#737373]">Version</dt>
                <dd className="font-semibold">1.0.0</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[#737373]">Build</dt>
                <dd className="font-semibold">Static — no backend</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[#737373]">Metadata</dt>
                <dd className="font-semibold">TMDB</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[#737373]">Storage</dt>
                <dd className="font-semibold">IndexedDB in this browser</dd>
              </div>
            </dl>

            <p className="mt-5 text-xs leading-relaxed text-[#a3a3a3]">
              Rellix is a metadata browser and embed launcher. It does not host,
              upload or proxy any video. Playback is performed by third-party
              providers in their own iframes, and availability is outside this
              project&apos;s control.
            </p>

            <p className="mt-3 text-xs leading-relaxed text-[#a3a3a3]">
              Profile PINs are a convenience lock stored in this browser. They are
              not encryption and do not protect data from anyone with access to this
              device.
            </p>

            <p className="mt-3 text-[11px] text-[#555555]">
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </Section>
        )}
      </div>

      {editing && (
        <EditProfileModal
          profile={editing}
          onClose={() => setEditing(null)}
          onChanged={() => {
            void refresh();
          }}
        />
      )}
    </main>
  );
}

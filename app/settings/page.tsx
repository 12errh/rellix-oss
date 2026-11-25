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
    <section className="border-t border-white/[0.08] pt-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="text-[#E50914]">{icon}</span>
        <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a8a8a]">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

const inputClass =
  'w-full rounded-[2px] border border-white/[0.14] bg-[#141414] px-3.5 py-3 text-[13px] text-white placeholder-[#5f5f5f] outline-none transition-colors focus:border-white/40';

const primaryButton =
  'rounded-[2px] bg-white px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#e2e2e2] disabled:opacity-40';

const secondaryButton =
  'rounded-[2px] border border-white/[0.16] px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#c8c8c8] transition-colors hover:border-white/40 hover:text-white disabled:opacity-40';

const dangerButton =
  'rounded-[2px] border border-[#E50914]/40 bg-[#E50914]/10 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#ff8a8a] transition-colors hover:bg-[#E50914]/20 disabled:opacity-40';

const microLabel = 'text-[9px] font-medium uppercase tracking-[0.2em] text-[#6f6f6f]';

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
      <main className="min-h-screen bg-[#0d0d0d] px-5 py-10 text-white sm:px-10 sm:py-14">
        <div className="mx-auto max-w-4xl">
          <div className="h-2.5 w-16 bg-[#161616]" />
          <div className="mt-3 h-7 w-40 bg-[#191919]" />
          <div className="mt-8 flex gap-6 border-b border-white/[0.08] pb-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-14 bg-[#161616]" />
            ))}
          </div>
          <div className="mt-8 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3 border-t border-white/[0.06] pt-6">
                <div className="h-2.5 w-24 bg-[#161616]" />
                <div className="h-16 bg-[#121212]" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] px-5 py-10 text-white sm:px-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-end justify-between gap-4 pb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#E50914]">System</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Settings
            </h1>
          </div>
          <Link
            href="/"
            className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] transition-colors hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Rellix
          </Link>
        </header>

        <nav className="no-scrollbar flex gap-6 overflow-x-auto border-b border-white/[0.08]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                tab === t.id
                  ? 'border-[#E50914] text-white'
                  : 'border-transparent text-[#6f6f6f] hover:text-[#c8c8c8]'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {notice && (
          <p className="mt-5 border-l-2 border-[#46d369] bg-white/[0.03] px-3.5 py-2.5 text-[12px] text-[#c8c8c8]">
            {notice}
          </p>
        )}

        {tab === 'profiles' && (
          <div className="mt-7">
            <Section icon={<User className="h-4 w-4" />} title="Profiles">
              <p className="mb-4 text-[12px] leading-relaxed text-[#8a8a8a]">
                {profiles.length} of {DEFAULT_MAX_PROFILES} profiles. Each one keeps its
                own My List, likes and watch progress in this browser.
              </p>

              <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-9 w-9 rounded-[2px] border border-white/[0.08] object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{p.name}</p>
                        <p className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[#6f6f6f]">
                          {p.isKid ? 'Kids profile' : 'Profile'}
                          {p.hasPin ? ` · ${p.pinLength ?? 4}-digit PIN` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(p)}
                      className="flex items-center gap-1.5 border border-white/[0.14] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[#c8c8c8] transition-colors hover:border-white/40 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>
                ))}
              </div>

              <Link
                href="/"
                className="mt-4 inline-block text-[10px] uppercase tracking-[0.16em] text-[#E50914] transition-colors hover:text-white"
              >
                Open the profile picker to add or switch profiles
              </Link>
            </Section>
          </div>
        )}

        {tab === 'playback' && (
          <div className="mt-7">
            <Section icon={<Play className="h-4 w-4" />} title="Playback">
              <p className="mb-3 text-[12px] text-[#8a8a8a]">Default streaming source.</p>
              <div className="grid gap-px border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
                {STREAM_SOURCES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setServer(s);
                      setDefaultServer(s);
                    }}
                    className={`flex items-center justify-between bg-[#0d0d0d] px-4 py-3 text-left transition-colors ${
                      server === s
                        ? 'text-white'
                        : 'text-[#8a8a8a] hover:bg-[#121212] hover:text-[#c8c8c8]'
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-[0.14em]">
                      {STREAM_SOURCE_LABELS[s]}
                    </span>
                    {server === s && <Check className="h-3.5 w-3.5 text-[#E50914]" />}
                  </button>
                ))}
              </div>

              <div className="mt-6 max-w-xl space-y-2">
                <label className={microLabel} htmlFor="custom-url">
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
                <p className="text-[11px] leading-relaxed text-[#6f6f6f]">
                  Used only when the Custom URL source is selected in the player. Must
                  start with http:// or https://. Rellix does not provide or endorse any
                  custom source.
                </p>
              </div>

              <p className="mt-6 border-l border-white/[0.1] pl-3 text-[11px] leading-relaxed text-[#6f6f6f]">
                Playback always happens in the provider&apos;s own iframe. Every source,
                including a Custom URL, is loaded in the same sandbox; that stops popups
                and top-level navigation, but not ads served inside the frame.
              </p>
            </Section>
          </div>
        )}

        {tab === 'tmdb' && (
          <div className="mt-7">
            <Section icon={<KeyRound className="h-4 w-4" />} title="TMDB API key">
              <p className="mb-5 max-w-xl text-[12px] leading-relaxed text-[#8a8a8a]">
                Metadata comes from TMDB, which needs a free API key. The key is stored
                in this browser and sent only to api.themoviedb.org.
              </p>

              <div className="mb-5 flex items-baseline gap-3 border-y border-white/[0.06] py-2.5">
                <span className={microLabel}>Status</span>
                <span className="text-[12px]">
                  {hasKey ? (
                    <span className="text-[#46d369]">
                      {buildKey
                        ? 'Using the key built into this deployment'
                        : 'Key saved in this browser'}
                    </span>
                  ) : (
                    <span className="text-[#E50914]">No key</span>
                  )}
                </span>
              </div>

              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste a TMDB v3 API key"
                autoComplete="off"
                className={inputClass}
              />

              {keyMessage && (
                <p
                  className={`mt-3 border-l-2 px-3.5 py-2.5 text-[12px] ${
                    keyMessage.ok
                      ? 'border-[#46d369] bg-white/[0.03] text-[#c8c8c8]'
                      : 'border-[#E50914] bg-[#E50914]/[0.06] text-[#ff8a8a]'
                  }`}
                >
                  {keyMessage.text}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2.5">
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

              <p className="mt-5 text-[11px] leading-relaxed text-[#6f6f6f]">
                Get a key at themoviedb.org → Settings → API. This product uses the
                TMDB API but is not endorsed or certified by TMDB.
              </p>
            </Section>
          </div>
        )}

        {tab === 'storage' && (
          <div className="mt-7">
            <Section icon={<Database className="h-4 w-4" />} title="Storage">
              <div className="mb-6 grid grid-cols-3 gap-px border border-white/[0.08] bg-white/[0.08]">
                {[
                  { label: 'My List', value: counts.watchlist },
                  { label: 'Likes', value: counts.likes },
                  { label: 'In progress', value: counts.history },
                ].map((item) => (
                  <div key={item.label} className="bg-[#0d0d0d] px-3 py-4">
                    <p className="text-2xl font-semibold tabular-nums text-white">
                      {item.value}
                    </p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#6f6f6f]">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mb-5 max-w-xl text-[12px] leading-relaxed text-[#8a8a8a]">
                Everything lives in this browser. Nothing is uploaded, and there is no
                account to restore from — export a backup if you care about this data.
              </p>

              <div className="flex flex-wrap gap-2.5">
                <button onClick={() => void downloadBackup()} className={primaryButton}>
                  <Download className="mr-2 inline h-3.5 w-3.5" /> Export backup
                </button>
                <button
                  onClick={() => void reloadCatalogue()}
                  disabled={busy !== null}
                  className={secondaryButton}
                >
                  {busy === 'cache' ? 'Clearing…' : 'Clear cached catalogue'}
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5 border-t border-white/[0.06] pt-5">
                <button
                  onClick={() => void wipeHistory()}
                  disabled={busy !== null}
                  className={secondaryButton}
                >
                  {busy === 'history' ? 'Clearing…' : 'Clear watch history'}
                </button>
                <button
                  onClick={() => void wipeList()}
                  disabled={busy !== null}
                  className={secondaryButton}
                >
                  {busy === 'watchlist' ? 'Clearing…' : 'Clear My List'}
                </button>
              </div>

              <div className="mt-8 border-l-2 border-[#E50914]/60 pl-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#ff8a8a]">
                  Delete everything
                </p>
                <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-[#8a8a8a]">
                  Removes every profile, My List entry, like, progress record, device
                  setting, the TMDB key and all cached metadata from this browser. There
                  is no account to restore from.
                </p>
                <button
                  onClick={() => void factoryReset()}
                  disabled={busy !== null}
                  className={`${dangerButton} mt-3`}
                >
                  {busy === 'all' ? (
                    <>
                      <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 inline h-3.5 w-3.5" /> Delete all local data
                    </>
                  )}
                </button>
              </div>
            </Section>
          </div>
        )}

        {tab === 'about' && (
          <div className="mt-7">
            <Section icon={<Info className="h-4 w-4" />} title="About Rellix">
              <dl className="grid border-y border-white/[0.06] sm:grid-cols-2">
                {[
                  ['Version', '1.0.0'],
                  ['Build', 'Static — no backend'],
                  ['Metadata', 'TMDB'],
                  ['Storage', 'IndexedDB in this browser'],
                ].map(([label, value], i) => (
                  <div
                    key={label}
                    className={`flex items-baseline justify-between gap-4 py-2.5 ${
                      i < 2 ? 'sm:border-b sm:border-white/[0.06]' : ''
                    } sm:odd:border-r sm:odd:pr-5 sm:even:pl-5`}
                  >
                    <dt className={microLabel}>{label}</dt>
                    <dd className="text-right text-[12px] text-[#e5e5e5]">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-6 max-w-xl text-[11px] leading-relaxed text-[#8a8a8a]">
                Rellix is a metadata browser and embed launcher. It does not host,
                upload or proxy any video. Playback is performed by third-party
                providers in their own iframes, and availability is outside this
                project&apos;s control.
              </p>

              <p className="mt-3 max-w-xl text-[11px] leading-relaxed text-[#8a8a8a]">
                Profile PINs are a convenience lock stored in this browser. They are
                not encryption and do not protect data from anyone with access to this
                device.
              </p>

              <p className="mt-5 text-[10px] uppercase tracking-[0.14em] text-[#5f5f5f]">
                This product uses the TMDB API but is not endorsed or certified by TMDB.
              </p>
            </Section>
          </div>
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

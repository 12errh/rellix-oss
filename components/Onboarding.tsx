'use client';

import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AVATARS } from '@/lib/avatars';
import { browserDB, ProfileLimitError } from '@/lib/db';
import { getTmdbKey, setTmdbKey, validateTmdbKey } from '@/lib/tmdb-key';
import { UserProfile } from '@/types/movie';
import { Backdrop } from './profiles/Backdrop';
import { PinLengthPicker, type PinLength } from './profiles/PinLengthPicker';

type Step = 'welcome' | 'key' | 'profile';

interface Props {
  /** Called with the profile that was just created. The page enters it. */
  onComplete: (profile: UserProfile) => void | Promise<void>;
}

/**
 * First-run onboarding.
 *
 * Runs once, when the browser holds no profiles. It collects the two things the
 * app cannot guess — a TMDB key and the first profile — instead of dropping the
 * visitor onto an empty "Who's watching?" screen and making them discover both
 * separately.
 *
 * Both inputs are optional in the right way: the key can be skipped (the app
 * still boots on the bundled fallback catalogue and Settings has a TMDB tab),
 * while the profile cannot be skipped because every piece of local state is
 * keyed by profile id.
 */
export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = React.useState<Step>('welcome');
  // Captured on first render. Onboarding mounts only after the page's client
  // gate opens (profilesLoaded), so localStorage is available here — and the
  // step count must not change halfway through because a key was saved in a
  // later step.
  const [needsKey] = React.useState(
    () => typeof window !== 'undefined' && !getTmdbKey()
  );

  const [key, setKey] = React.useState('');
  const [keyError, setKeyError] = React.useState<string | null>(null);
  const [keyBusy, setKeyBusy] = React.useState(false);

  const [name, setName] = React.useState('');
  const [avatar, setAvatar] = React.useState(AVATARS[0]);
  const [isKid, setIsKid] = React.useState(false);
  const [usePin, setUsePin] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [pinLength, setPinLength] = React.useState<PinLength>(4);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const totalSteps = needsKey ? 3 : 2;
  const stepNumber = step === 'welcome' ? 1 : step === 'key' ? 2 : totalSteps;

  const start = () => {
    setError(null);
    setStep(getTmdbKey() ? 'profile' : 'key');
  };

  const choosePinLength = (n: PinLength) => {
    setPinLength(n);
    setPin('');
  };

  const submitKey = async (skip = false) => {
    setKeyError(null);
    if (skip) {
      setStep('profile');
      return;
    }
    if (!key.trim()) {
      setKeyError('Paste your TMDB API key first, or skip this step.');
      return;
    }

    setKeyBusy(true);
    const verdict = await validateTmdbKey(key);
    setKeyBusy(false);
    if (!verdict.ok) {
      setKeyError(verdict.error ?? 'Could not validate that key.');
      return;
    }

    setTmdbKey(key);
    setStep('profile');
  };

  const createProfile = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give the profile a name.');
      return;
    }
    if (usePin && pin.length !== pinLength) {
      setError(`PIN must be exactly ${pinLength} digits.`);
      return;
    }

    setCreating(true);
    try {
      const created = await browserDB.addProfile({
        id: '',
        name: name.trim(),
        avatarUrl: avatar,
        isKid,
        pin: usePin ? pin : null,
      });
      if (!created) throw new Error('Could not save the profile.');
      await onComplete(created);
    } catch (e) {
      setCreating(false);
      setError(
        e instanceof ProfileLimitError
          ? 'The profile limit has been reached.'
          : e instanceof Error
            ? e.message
            : 'Could not create the profile.'
      );
    }
  };

  return (
    <Backdrop>
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-512.png" alt="" className="h-10 w-10 rounded-lg" />
          <span className="text-2xl font-black tracking-[0.2em] text-[#E50914]">RELLIX</span>
        </div>

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/[0.08] bg-[#141414]/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-2" aria-hidden>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i + 1 === stepNumber
                      ? 'w-6 bg-[#E50914]'
                      : i + 1 < stepNumber
                        ? 'w-1.5 bg-[#E50914]/60'
                        : 'w-1.5 bg-white/15'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737373]">
              Step {stepNumber} of {totalSteps}
            </span>
          </div>

          <div className="p-6 sm:p-7">
            {step === 'welcome' && (
              <div className="space-y-5">
                <div>
                  <h1 id="onboarding-title" className="text-2xl font-bold text-white">
                    Welcome to Rellix
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-[#a3a3a3]">
                    A streaming-style browser for movies, TV shows and anime. Two
                    minutes of setup, then everything runs from this browser.
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-[#d4d4d4]">
                  <li className="flex gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#E50914]" aria-hidden />
                    <span>
                      Real posters, ratings, seasons and search results, pulled live
                      from TMDB.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#E50914]" aria-hidden />
                    <span>
                      Up to five profiles, each with its own My List, likes and watch
                      progress.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#E50914]" aria-hidden />
                    <span>
                      No account and no uploads. Everything stays in this browser, and
                      clearing site data removes it.
                    </span>
                  </li>
                </ul>

                <button
                  onClick={start}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E50914] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#f6121d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E50914]"
                >
                  Get started <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <p className="text-center text-[11px] text-[#6f6f6f]">
                  You can change every choice later in Settings.
                </p>
              </div>
            )}

            {step === 'key' && (
              <div className="space-y-5">
                <div>
                  <h1 id="onboarding-title" className="flex items-center gap-2 text-2xl font-bold text-white">
                    <KeyRound className="h-5 w-5 text-[#E50914]" aria-hidden /> Connect TMDB
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-[#a3a3a3]">
                    Rellix needs a free TMDB API key for real posters, ratings and
                    episode lists. It is stored in this browser and sent only to The
                    Movie Database.
                  </p>
                </div>

                <ol className="space-y-2 rounded-xl border border-white/[0.06] bg-black/30 p-4 text-xs leading-relaxed text-[#b5b5b5]">
                  <li>
                    <span className="font-bold text-white">1.</span> Open{' '}
                    <a
                      href="https://www.themoviedb.org/login?signup=1"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#E50914] underline"
                    >
                      themoviedb.org
                    </a>{' '}
                    and create a free account.
                  </li>
                  <li>
                    <span className="font-bold text-white">2.</span> Go to Settings →
                    API and copy the <em>API Key (v3 auth)</em>.
                  </li>
                  <li>
                    <span className="font-bold text-white">3.</span> Paste it below.
                    Rellix validates it before saving.
                  </li>
                </ol>

                <div>
                  <label
                    htmlFor="onboarding-key"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]"
                  >
                    TMDB v3 API key
                  </label>
                  <input
                    id="onboarding-key"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !keyBusy) void submitKey();
                    }}
                    placeholder="e.g. 8f14e45fceea167a5a36dedd4bea2543"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 font-mono text-sm text-white placeholder-[#555] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
                  />
                  {keyError && (
                    <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-[#ff8a8a]">
                      {keyError}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => void submitKey()}
                  disabled={keyBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E50914] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#f6121d] disabled:opacity-60"
                >
                  {keyBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Validating…
                    </>
                  ) : (
                    <>
                      Validate &amp; continue <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    onClick={() => setStep('welcome')}
                    className="flex items-center gap-1.5 text-[#8a8a8a] transition hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
                  </button>
                  <button
                    onClick={() => void submitKey(true)}
                    className="text-[#8a8a8a] underline transition hover:text-white"
                  >
                    Add it later in Settings
                  </button>
                </div>
              </div>
            )}

            {step === 'profile' && (
              <div className="space-y-5">
                <div>
                  <h1 id="onboarding-title" className="text-2xl font-bold text-white">
                    Create your profile
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-[#a3a3a3]">
                    This is who the app opens as. You can add up to four more from the
                    profile picker.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded-2xl ring-2 ring-[#E50914]/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="grid grid-cols-8 gap-2" role="group" aria-label="Avatar">
                    {AVATARS.map((a, i) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAvatar(a)}
                        aria-label={`Avatar ${i + 1}`}
                        aria-pressed={avatar === a}
                        className={`aspect-square overflow-hidden rounded-lg border-2 transition ${
                          avatar === a
                            ? 'border-[#E50914]'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="onboarding-name"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]"
                  >
                    Profile name
                  </label>
                  <input
                    id="onboarding-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !creating) void createProfile();
                    }}
                    placeholder="Your name"
                    autoFocus
                    maxLength={32}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                  <div>
                    <p className="text-sm text-white">Kids profile</p>
                    <p className="text-[11px] text-[#737373]">Family-safe catalogue only</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={isKid}
                    onClick={() => setIsKid((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${isKid ? 'bg-[#E50914]' : 'bg-white/15'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isKid ? 'left-[1.4rem]' : 'left-0.5'}`}
                    />
                    <span className="sr-only">Kids profile</span>
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Require a PIN</p>
                      <p className="text-[11px] text-[#737373]">
                        A local lock for this profile
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={usePin}
                      onClick={() => {
                        setUsePin((v) => !v);
                        setPin('');
                      }}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition ${usePin ? 'bg-[#E50914]' : 'bg-white/15'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${usePin ? 'left-[1.4rem]' : 'left-0.5'}`}
                      />
                      <span className="sr-only">Require a PIN</span>
                    </button>
                  </div>

                  {usePin && (
                    <div className="mt-3 space-y-2.5 border-t border-white/[0.06] pt-3">
                      <PinLengthPicker
                        value={pinLength}
                        onChange={choosePinLength}
                        disabled={creating}
                      />
                      <input
                        value={pin}
                        onChange={(e) =>
                          setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))
                        }
                        placeholder={`${pinLength}-digit PIN`}
                        aria-label="Profile PIN"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={pinLength}
                        className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
                      />
                      <p className="text-[11px] leading-relaxed text-[#6f6f6f]">
                        Asking for a PIN does not encrypt anything. Anyone with access
                        to this browser&apos;s storage can bypass it.
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-[#ff8a8a]">
                    {error}
                  </p>
                )}

                <button
                  onClick={() => void createProfile()}
                  disabled={creating}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E50914] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#f6121d] disabled:opacity-60"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Creating…
                    </>
                  ) : (
                    <>
                      Start watching <Check className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>

                <button
                  onClick={() => setStep(needsKey ? 'key' : 'welcome')}
                  className="flex w-full items-center justify-center gap-1.5 text-xs text-[#8a8a8a] transition hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 max-w-sm text-center text-[11px] leading-relaxed text-[#5f5f5f]">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </Backdrop>
  );
}

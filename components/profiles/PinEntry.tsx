'use client';

import React from 'react';
import { UserProfile } from '@/types/movie';
import { verifyPin } from '@/lib/db';
import { PinDigits } from './PinLengthPicker';
import { Backdrop } from './Backdrop';

interface Props {
  profile: UserProfile;
  onSuccess: () => void;
  onBack: () => void;
}

/**
 * Profile lock screen.
 *
 * The lockout is local by necessity: there is no server to rate-limit against.
 * `verifyPin` keeps an escalating guard in localStorage — 30s after 5 wrong
 * PINs, doubling to a 5-minute ceiling — so the pad cannot be brute-forced by
 * hand. It is still a UX lock, not a security boundary: someone with devtools
 * can read this browser's storage directly.
 *
 * `lockedUntil` is mirrored to localStorage purely so a page reload does not
 * hide the countdown.
 */
export function PinEntry({ profile, onSuccess, onBack }: Props) {
  // The length is stored on the profile row when the PIN is set, so the screen
  // knows how many digits to render before the user types anything.
  const length = profile.pinLength === 6 ? 6 : 4;

  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState(false);
  const [lockUntil, setLockUntil] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [busy, setBusy] = React.useState(false);

  const lockoutHydrated = React.useRef(false);

  // Mirror the server's lockout across reloads. Read-only with respect to
  // security: this never grants access, it only keeps the countdown visible.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`rellix_pin_lock_${profile.id}`);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved?.lockUntil === 'number' && saved.lockUntil > Date.now()) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLockUntil(saved.lockUntil);
        } else if (saved?.lockUntil) {
          localStorage.removeItem(`rellix_pin_lock_${profile.id}`);
        }
      }
    } catch {}
    lockoutHydrated.current = true;
  }, [profile.id]);

  React.useEffect(() => {
    if (!lockoutHydrated.current) return;
    try {
      if (lockUntil && lockUntil > Date.now()) {
        localStorage.setItem(`rellix_pin_lock_${profile.id}`, JSON.stringify({ lockUntil }));
      } else {
        localStorage.removeItem(`rellix_pin_lock_${profile.id}`);
      }
    } catch {}
  }, [lockUntil, profile.id]);

  React.useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockUntil]);

  const locked = lockUntil !== null && now < lockUntil;
  const lockRemaining = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lockUntil && now >= lockUntil) setLockUntil(null);
  }, [now, lockUntil]);

  // Allow typing the PIN with a physical/on-screen keyboard, not just the mouse.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || busy) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < length ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, busy, length]);

  React.useEffect(() => {
    if (pin.length !== length) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);

    // No `cancelled` flag and no cleanup on purpose.
    //
    // An earlier version had both, plus `busy` in this effect's dependency list.
    // That deadlocks: setBusy(true) re-runs the effect, the cleanup marks the
    // in-flight request cancelled, the new run early-returns on `busy`, and the
    // real response is discarded — leaving busy stuck true and the pad dead.
    //
    // This matches the original shape (no cleanup), so a re-run caused by an
    // unstable onSuccess prop just fires another verify rather than cancelling
    // the one that matters. A duplicate verify is harmless; a discarded one is
    // not. After a wrong PIN we clear `pin`, and after a right one we navigate
    // away, so re-runs settle immediately.
    verifyPin(profile.id, pin).then((res) => {
      setBusy(false);

      if (res.ok) {
        try { localStorage.removeItem(`rellix_pin_lock_${profile.id}`); } catch {}
        onSuccess();
        return;
      }

      if (res.locked) {
        setLockUntil(Date.now() + res.retryAfter * 1000);
        setPin('');
        return;
      }

      setError(true);
      setPin('');
      setTimeout(() => setError(false), 1200);
    });
  }, [pin, profile, onSuccess, length]);

  return (
    <Backdrop>
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-white">
        <img src={profile.avatarUrl} alt="" className="w-16 h-16 rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)]" />
        <div className="space-y-1 text-center">
          <h2 className="text-xl font-bold">Enter PIN for {profile.name}</h2>
          <p className="text-xs text-[#8e8e8e]">{length}-digit profile lock</p>
        </div>

        <PinDigits length={length} filled={pin.length} error={error} />

        <p
          className={`h-5 text-sm ${
            error ? 'text-[#ff6b6b]' : busy ? 'text-[#a3a3a3]' : 'text-transparent'
          }`}
        >
          {busy && !error ? 'Checking…' : 'Wrong PIN'}
        </p>

        {locked && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            Too many wrong attempts — try again in {lockRemaining}s
          </p>
        )}

        <div className={`grid grid-cols-3 gap-3 ${locked ? 'opacity-40 pointer-events-none' : ''}`}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              disabled={locked}
              onClick={() => setPin((p) => (p.length < length ? p + d : p))}
              className="w-16 h-16 rounded-full border border-white/10 bg-white/[0.06] text-xl font-semibold backdrop-blur transition hover:bg-white/15 active:scale-95"
            >
              {d}
            </button>
          ))}
          <button onClick={onBack} className="w-16 h-16 rounded-full text-sm text-[#a3a3a3] hover:text-white">
            Back
          </button>
          <button
            disabled={locked}
            onClick={() => setPin((p) => (p.length < length ? p + '0' : p))}
            className="w-16 h-16 rounded-full border border-white/10 bg-white/[0.06] text-xl font-semibold backdrop-blur transition hover:bg-white/15 active:scale-95"
          >
            0
          </button>
          <button
            disabled={locked}
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="w-16 h-16 rounded-full text-sm text-[#a3a3a3] hover:text-white"
          >
            ⌫
          </button>
        </div>

        <button onClick={onBack} className="text-xs text-[#8e8e8e] hover:text-white transition">
          Use a different profile
        </button>
      </div>
    </Backdrop>
  );
}
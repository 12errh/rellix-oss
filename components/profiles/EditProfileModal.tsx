'use client';

import React from 'react';
import { UserProfile } from '@/types/movie';
import { AVATARS } from '@/lib/avatars';
import { browserDB, ProfileGateError } from '@/lib/db';
import { PinLengthPicker, type PinLength } from './PinLengthPicker';

interface Props {
  profile: UserProfile;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Profile editor.
 *
 * The save paths are deliberately split:
 *
 *   Save (name / avatar / kid flag)  -> immediate
 *   Set the first PIN                -> immediate (there is nothing to prove)
 *   Change or remove an existing PIN -> current PIN required
 *   Delete                           -> behind a confirm step
 *
 * The current-PIN requirement matters because Settings is reachable without
 * unlocking a profile: without it, anyone in the room could re-key or strip
 * somebody else's lock in three clicks. The check runs in the store
 * (`setProfilePin` / `clearProfilePin`) and shares the lock screen's escalating
 * lockout, so it is not an unlimited-guess side door.
 *
 * There is still no account password, so nothing here is a security boundary.
 * The PIN is a local UX lock stored in this browser (see lib/db.ts); deleting
 * the last profile is refused by the store, because an app with no profile has
 * no way back in.
 */
export function EditProfileModal({ profile, onClose, onChanged }: Props) {
  const [name, setName] = React.useState(profile.name);
  const [isKid, setIsKid] = React.useState(profile.isKid);
  const [avatar, setAvatar] = React.useState(profile.avatarUrl || AVATARS[0]);

  const [newPin, setNewPin] = React.useState('');
  const [currentPin, setCurrentPin] = React.useState('');
  const [pinLength, setPinLength] = React.useState<PinLength>(
    profile.pinLength === 6 ? 6 : 4
  );

  // The stored length, not the length picked for the replacement. The current
  // PIN was created with the old length and must be typed at that length.
  const currentPinLength: PinLength = profile.pinLength === 6 ? 6 : 4;

  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [pinBusy, setPinBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const choosePinLength = (n: PinLength) => {
    setPinLength(n);
    setNewPin('');
  };

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Name is required');
    setSaving(true);
    try {
      await browserDB.updateProfile({
        ...profile,
        name: name.trim(),
        isKid,
        avatarUrl: avatar,
      });
      setSaving(false);
      onChanged();
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not save changes');
    }
  };

  /** Turn a store refusal into something a person can act on. */
  const pinError = (e: unknown, fallback = 'Could not save the PIN.'): string => {
    if (e instanceof ProfileGateError) {
      if (e.code === 'wrong_pin') return 'That PIN is not correct.';
      if (e.code === 'pin_locked') {
        return `Too many wrong attempts. Try again in ${e.retryAfter || 30}s.`;
      }
      if (e.code === 'bad_pin_length') return 'PIN must be 4 or 6 digits.';
      if (e.code === 'last_profile') {
        return 'You need at least one profile, so this one cannot be deleted.';
      }
    }
    return e instanceof Error ? e.message : fallback;
  };

  const savePin = async () => {
    setError('');
    if (profile.hasPin && currentPin.length !== currentPinLength) {
      setError(`Enter your current ${currentPinLength}-digit PIN first.`);
      return;
    }
    if (newPin.length !== pinLength) {
      setError(`PIN must be exactly ${pinLength} digits`);
      return;
    }
    setPinBusy(true);
    try {
      await browserDB.setProfilePin(profile.id, newPin, currentPin);
      setPinBusy(false);
      setNewPin('');
      setCurrentPin('');
      onChanged();
      onClose();
    } catch (e) {
      setPinBusy(false);
      setError(pinError(e));
    }
  };

  const removePin = async () => {
    setError('');
    if (profile.hasPin && currentPin.length !== currentPinLength) {
      setError(`Enter your current ${currentPinLength}-digit PIN to remove the lock.`);
      return;
    }
    setPinBusy(true);
    try {
      await browserDB.clearProfilePin(profile.id, currentPin);
      setPinBusy(false);
      setCurrentPin('');
      onChanged();
      onClose();
    } catch (e) {
      setPinBusy(false);
      setError(pinError(e));
    }
  };

  const deleteProfile = async () => {
    setError('');
    if (profile.hasPin && currentPin.length !== currentPinLength) {
      setError(`Enter your current ${currentPinLength}-digit PIN to delete this profile.`);
      return;
    }
    setPinBusy(true);
    try {
      await browserDB.deleteProfile(profile.id, currentPin);
      setPinBusy(false);
      onChanged();
      onClose();
    } catch (e) {
      setPinBusy(false);
      // Keep the confirmation open on a wrong PIN so it can be retyped; the
      // last-profile refusal has no recovery, so return to the editor.
      if (e instanceof ProfileGateError && e.code === 'last_profile') setConfirmDelete(false);
      setError(pinError(e, 'Could not delete this profile.'));
    }
  };

  if (confirmDelete) {
    return (
      <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-red-500/20 bg-[#161616]/95 p-6 shadow-2xl">
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">Delete &ldquo;{profile.name}&rdquo;?</h2>
            <p className="mt-2 text-xs text-[#8e8e8e]">
              This removes the profile and everything saved under it — My List,
              likes and watch progress. It cannot be undone.
            </p>
          </div>

          {profile.hasPin && (
            <>
              <label
                htmlFor="delete-current-pin"
                className="block text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]"
              >
                Current PIN
              </label>
              <input
                id="delete-current-pin"
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, currentPinLength))
                }
                placeholder={`Current ${currentPinLength}-digit PIN`}
                inputMode="numeric"
                autoComplete="off"
                maxLength={currentPinLength}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
              />
            </>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-[#ff8a8a]">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => void deleteProfile()}
              disabled={pinBusy}
              className="flex-1 rounded-xl bg-[#E50914] py-3 text-sm font-bold text-white transition hover:bg-[#f6121d] disabled:opacity-50"
            >
              {pinBusy ? 'Deleting…' : 'Delete profile'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/[0.08] bg-[#161616]/95 p-5 shadow-2xl backdrop-blur-xl sm:p-7 max-h-[90vh] overflow-y-auto">
        <h2 className="text-center text-xl font-bold text-white">Edit Profile</h2>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Profile name"
          className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
        />

        <div>
          <p className="text-xs font-bold text-[#888] uppercase mb-2">Avatar</p>
          <div className="grid grid-cols-4 gap-2.5">
            {AVATARS.map((a, i) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                aria-label={`Avatar ${i + 1}`}
                aria-pressed={avatar === a}
                className={`aspect-square w-full rounded-xl overflow-hidden border-2 transition ${avatar === a ? 'border-[#E50914] scale-105' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                <img src={a} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
          <span className="text-sm text-white">Kids profile (family-safe content only)</span>
          <button
            type="button"
            aria-pressed={isKid}
            aria-label="Kids profile"
            onClick={() => setIsKid(!isKid)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${isKid ? 'bg-[#E50914]' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isKid ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="space-y-2.5 border-t border-white/[0.06] pt-5">
          <p className="text-xs font-bold text-[#888] uppercase">
            Profile PIN{' '}
            {profile.hasPin && (
              <span className="text-[#E50914]">· {currentPinLength} digits</span>
            )}
          </p>

          {profile.hasPin && (
            <>
              <label
                htmlFor="current-pin"
                className="block text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]"
              >
                Current PIN
              </label>
              <input
                id="current-pin"
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, currentPinLength))
                }
                placeholder={`Current ${currentPinLength}-digit PIN`}
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={currentPinLength}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
              />
            </>
          )}

          <PinLengthPicker value={pinLength} onChange={choosePinLength} disabled={pinBusy} />

          <input
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
            placeholder={
              profile.hasPin ? `New ${pinLength}-digit PIN` : `Set a ${pinLength}-digit PIN`
            }
            aria-label={profile.hasPin ? 'New PIN' : 'PIN'}
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={pinLength}
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
          />

          <button
            onClick={() => void savePin()}
            disabled={newPin.length !== pinLength || pinBusy}
            className="w-full rounded-xl border border-[#E50914]/40 bg-[#E50914]/10 py-2.5 text-sm font-bold text-[#E50914] transition hover:bg-[#E50914]/20 disabled:opacity-40"
          >
            {profile.hasPin ? 'Change PIN' : 'Set PIN'}
          </button>

          {profile.hasPin && (
            <button
              onClick={() => void removePin()}
              disabled={pinBusy}
              className="text-xs text-[#a3a3a3] underline hover:text-white disabled:opacity-50"
            >
              Remove PIN lock
            </button>
          )}

          <p className="text-[11px] text-[#6f6f6f]">
            {profile.hasPin
              ? 'Changing or removing this PIN requires the current one. '
              : ''}
            The PIN keeps other people using this browser out of a profile. It does not
            encrypt anything, and anyone with access to this browser&apos;s storage can
            bypass it.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-[#ff8a8a]">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex-1 rounded-xl bg-[#E50914] py-3 text-sm font-bold text-white transition hover:bg-[#f6121d] hover:shadow-[0_8px_30px_-6px_rgba(229,9,20,0.5)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save details'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Cancel
          </button>
        </div>

        <button
          onClick={() => setConfirmDelete(true)}
          className="w-full text-xs text-[#ff6b6b] hover:underline"
        >
          Delete this profile
        </button>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { UserProfile } from '@/types/movie';
import { AVATARS } from '@/lib/avatars';
import { browserDB, ProfileLimitError } from '@/lib/db';
import { PinLengthPicker, type PinLength } from './PinLengthPicker';

interface Props {
  maxProfiles: number;
  onClose: () => void;
  onCreated: (p: UserProfile) => void;
}

export function AddProfileModal({ maxProfiles, onClose, onCreated }: Props) {
  const [name, setName] = React.useState('');
  const [isKid, setIsKid] = React.useState(false);
  const [avatar, setAvatar] = React.useState(AVATARS[0]);
  const [usePin, setUsePin] = React.useState(false);
  const [pinLength, setPinLength] = React.useState<PinLength>(4);
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Changing the length invalidates anything already typed, since the digits
  // typed under the other length are almost certainly not what they want.
  const choosePinLength = (n: PinLength) => {
    setPinLength(n);
    setPin('');
  };

  const toggleUsePin = () => {
    setUsePin(!usePin);
    setPin('');
  };

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Name is required');
    if (usePin && pin.length !== pinLength) {
      return setError(`PIN must be exactly ${pinLength} digits`);
    }
    setSaving(true);
    let created: UserProfile | null = null;
    try {
      // There is no account and no server: the PIN is hashed here and stored in
      // this browser. See the header of lib/db.ts for what it does and does not
      // protect.
      created = await browserDB.addProfile({
        id: '',
        name: name.trim(),
        avatarUrl: avatar,
        isKid,
        pin: usePin ? pin : null,
      });
    } catch (e) {
      setSaving(false);
      setError(
        e instanceof ProfileLimitError
          ? `Profile limit reached (${e.limit}). Delete a profile to make room.`
          : 'Could not create profile'
      );
      return;
    }
    setSaving(false);
    if (!created) return setError('Could not create profile');
    onCreated(created);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/[0.08] bg-[#161616]/95 p-5 shadow-2xl backdrop-blur-xl sm:p-7 max-h-[90vh] overflow-y-auto">
        <h2 className="text-center text-xl font-bold text-white">Add Profile</h2>
        <p className="-mt-3 text-center text-[11px] text-[#6f6f6f]">
          Up to {maxProfiles} profile{maxProfiles === 1 ? '' : 's'}
        </p>

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

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
          <span className="text-sm text-white">Require a PIN to open this profile</span>
          <button
            type="button"
            aria-pressed={usePin}
            aria-label="Require a PIN"
            onClick={toggleUsePin}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${usePin ? 'bg-[#E50914]' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${usePin ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </div>

        {usePin && (
          <>
            <PinLengthPicker value={pinLength} onChange={choosePinLength} disabled={saving} />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
              placeholder={`${pinLength}-digit PIN`}
              aria-label="Profile PIN"
              inputMode="numeric"
              autoComplete="off"
              maxLength={pinLength}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-white placeholder-[#666] outline-none transition focus:border-[#E50914]/60 focus:bg-black/70"
            />
            <p className="-mt-2 text-[11px] text-[#6f6f6f]">
              This PIN is stored in this browser as a convenience lock. It is not
              encryption and can be bypassed by anyone with access to this device.
            </p>
          </>
        )}

        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-[#ff8a8a]">{error}</p>}

        <div className="flex gap-3">
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-xl bg-[#E50914] py-3 text-sm font-bold text-white transition hover:bg-[#f6121d] hover:shadow-[0_8px_30px_-6px_rgba(229,9,20,0.5)] disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

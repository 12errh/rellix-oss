'use client';

import React from 'react';
import { Lock, Pencil, Plus } from 'lucide-react';
import { UserProfile } from '@/types/movie';
import { Backdrop } from './Backdrop';
import { AddProfileModal } from './AddProfileModal';
import { EditProfileModal } from './EditProfileModal';

interface Props {
  profiles: UserProfile[];
  maxProfiles: number;
  onSelect: (p: UserProfile) => void;
  onProfilesChanged: () => void;
}

// Netflix-style "Who's watching?" grid: avatars + add tile + manage mode.
export function WhoIsWatching({ profiles, maxProfiles, onSelect, onProfilesChanged }: Props) {
  const [manage, setManage] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<UserProfile | null>(null);

  const atLimit = profiles.length >= maxProfiles;
  const slotsLeft = Math.max(0, maxProfiles - profiles.length);

  return (
    <Backdrop>
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 md:gap-12 px-4 py-10">
        <h1 className="text-center text-3xl md:text-5xl font-bold tracking-tight text-white">Who&apos;s watching?</h1>
        <p className="-mt-6 text-center text-xs text-[#6f6f6f] md:mt-0">
          {atLimit ? (
            <span className="text-[#f5a623]">
              All {maxProfiles} profile{maxProfiles === 1 ? '' : 's'} in use
            </span>
          ) : (
            <>
              {profiles.length} of {maxProfiles} · {slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left
            </>
          )}
        </p>

        <div className="flex w-full max-w-4xl flex-wrap justify-center gap-6 md:gap-10">
          {profiles.map((p, i) => (
            <button
              key={p.id}
              onClick={() => (manage ? setEditing(p) : onSelect(p))}
              className="group flex flex-col items-center gap-3 transition-transform duration-200 hover:-translate-y-1"
              style={{ animation: 'rellix-fade-up 0.35s ease both', animationDelay: `${i * 60}ms` }}
            >
              <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)] ring-0 group-hover:ring-2 group-hover:ring-[#E50914] transition-all duration-200">
                <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                {p.isKid && (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#46d369]">
                    Kids
                  </span>
                )}
                {p.hasPin && (
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 p-1 text-[#d4d4d4]">
                    <Lock className="h-2.5 w-2.5" />
                  </span>
                )}
                {manage && (
                  <span className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center">
                    <Pencil className="w-8 h-8 text-white" />
                  </span>
                )}
              </div>
              <span className="text-sm md:text-base text-[#a3a3a3] group-hover:text-white transition-colors">{p.name}</span>
            </button>
          ))}

          {!atLimit && (
            <button onClick={() => setAdding(true)} className="group flex flex-col items-center gap-3 transition-transform duration-200 hover:-translate-y-1">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.04] flex items-center justify-center transition-colors group-hover:border-[#E50914]/50 group-hover:bg-white/[0.08]">
                <Plus className="w-10 h-10 text-[#a3a3a3] group-hover:text-white transition-colors" />
              </div>
              <span className="text-sm md:text-base text-[#a3a3a3] group-hover:text-white transition-colors">Add Profile</span>
            </button>
          )}
        </div>

        <button
          onClick={() => setManage((m) => !m)}
          className="rounded-full border border-white/25 px-8 py-2.5 text-xs font-semibold tracking-[0.2em] text-white transition hover:bg-white hover:text-black"
        >
          {manage ? 'DONE' : 'MANAGE PROFILES'}
        </button>

        {adding && (
          <AddProfileModal
            maxProfiles={maxProfiles}
            onClose={() => setAdding(false)}
            onCreated={() => onProfilesChanged()}
          />
        )}
        {editing && (
          <EditProfileModal
            profile={editing}
            onClose={() => setEditing(null)}
            onChanged={() => onProfilesChanged()}
          />
        )}
      </div>
    </Backdrop>
  );
}

'use client';

import React, { useState } from 'react';
import { Search, UserCheck, Settings } from 'lucide-react';
import { UserProfile } from '@/types/movie';
import { NavTab } from './Sidebar';

interface TopNavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  currentProfile: UserProfile;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchProfile: () => void;
}

export function TopNavbar({
  activeTab,
  onSelectTab,
  currentProfile,
  profiles,
  onSelectProfile,
  onSwitchProfile,
}: TopNavbarProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const menuItem =
    'flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[#cccccc] hover:bg-white/5 hover:text-white transition-colors';

  return (
    <div className="sticky top-0 z-30 w-full">
      <header className="flex items-center justify-between w-full h-16 px-4 md:px-12 bg-gradient-to-b from-[#111111]/95 via-[#111111]/75 to-transparent backdrop-blur-md transition-all select-none">
      {/* Left side: Category quick links */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="font-black text-xl text-[#E50914] tracking-tight md:hidden">
            RELLIX
          </span>
        </div>

     </div>

      {/* Right side controls */}
      <div className="flex items-center gap-4">
        {/* Search — navigates to the Search tab and focuses its input.
            There is deliberately no inline search field here: two search inputs
            on one screen meant typing in the navbar and typing on the search page
            were two different states, and the navbar copy was easy to miss. The
            full input lives on the Search tab. */}
        <button
          onClick={() => {
            onSelectTab('search');
            // If the user is already on the Search tab, onSelectTab is a no-op
            // and the input keeps focus anyway; the event handles the case where
            // it does not (the tab was already mounted but focus was elsewhere).
            window.dispatchEvent(new Event('rellix:focus-search'));
          }}
          className="text-[#cccccc] hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          title="Search"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Profile menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu((v) => !v)}
            className="block p-1 rounded-full hover:bg-white/10 transition-colors"
            title="Profile"
          >
            <img src={currentProfile.avatarUrl} alt="" className="w-8 h-8 rounded-md" />
          </button>

          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
              <div className="absolute right-0 mt-2 z-50 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#181818] shadow-2xl animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
                  <img src={currentProfile.avatarUrl} alt="" className="w-9 h-9 rounded-md" />
                  <div>
                    <p className="text-sm font-bold text-white">{currentProfile.name}</p>
                    <p className="text-[11px] text-[#737373]">{currentProfile.isKid ? 'Kids profile' : 'Profile'}</p>
                  </div>
                </div>

                <div className="py-1.5">
                  <button
                    onClick={() => { setShowProfileMenu(false); onSwitchProfile(); }}
                    className={menuItem}
                  >
                    <UserCheck className="w-4 h-4 text-[#a3a3a3]" /> Switch Profile
                  </button>
                  {profiles.filter((p) => p.id !== currentProfile.id).slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setShowProfileMenu(false); onSelectProfile(p); }}
                      className={menuItem}
                    >
                      <img src={p.avatarUrl} alt="" className="w-4 h-4 rounded-[3px]" /> {p.name}
                    </button>
                  ))}
                  <a href="/settings" className={menuItem}>
                    <Settings className="w-4 h-4 text-[#a3a3a3]" /> Settings
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
      </header>
    </div>
  );
}

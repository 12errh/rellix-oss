'use client';

import React from 'react';
import { Search, Home, Compass, Tv, Film, Orbit, Bookmark } from 'lucide-react';
import { NavTab } from './Sidebar';

interface MobileNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const ITEMS: { id: NavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { id: 'search', label: 'Search', icon: <Search className="w-5 h-5" /> },
  { id: 'trending', label: 'Browse', icon: <Compass className="w-5 h-5" /> },
  { id: 'tv', label: 'TV', icon: <Tv className="w-5 h-5" /> },
  { id: 'movies', label: 'Movies', icon: <Film className="w-5 h-5" /> },
  { id: 'anime', label: 'Anime', icon: <Orbit className="w-5 h-5" /> },
  { id: 'mylist', label: 'My List', icon: <Bookmark className="w-5 h-5" /> },
];

export function MobileNav({ activeTab, onSelectTab }: MobileNavProps) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#0f0f0f]/95 backdrop-blur-xl border-t border-white/10">
      <div className="flex items-center justify-around px-1 py-2 overflow-x-auto no-scrollbar">
        {ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center gap-1 min-w-[56px] px-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                isActive ? 'text-white' : 'text-[#8c8c8c] hover:text-white'
              }`}
            >
              <span className={isActive ? 'text-[#E50914]' : ''}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

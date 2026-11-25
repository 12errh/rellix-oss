'use client';

import React from 'react';
import {
  Search,
  Home,
  Compass,
  Tv,
  Film,
  Orbit,
  Bookmark,
} from 'lucide-react';

export type NavTab = 'home' | 'search' | 'trending' | 'tv' | 'movies' | 'anime' | 'mylist';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
}: SidebarProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'search',
      label: 'Search',
      icon: <Search className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
    {
      // Tab id is still 'trending' (renaming it would mean touching NavTab,
      // app/page.tsx and any persisted active-tab value for no user-visible
      // gain), but the LABEL is "Browse" and the tab renders <BrowserTab>, so
      // the icon should say browsing a catalogue. TrendingUp was the mismatch:
      // it duplicated the "Trending & Top" rail on the home screen.
      id: 'trending',
      label: 'Browse',
      icon: <Compass className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
    {
      id: 'tv',
      label: 'TV Shows',
      icon: <Tv className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
    {
      id: 'movies',
      label: 'Movies',
      icon: <Film className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
    {
      id: 'anime',
      label: 'Anime',
      // Orbit instead of Sparkles: Sparkles is the most over-used glyph in
      // media UIs and reads as "new / AI / recommended" rather than anime.
      // Tv, Film and CirclePlay are already taken above, so there is no
      // conventional screen glyph left to use here.
      icon: <Orbit className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
    {
      id: 'mylist',
      label: 'My List',
      icon: <Bookmark className="w-5 h-5 transition-transform group-hover:scale-110" />,
    },
  ];

  return (
    <aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      className={`fixed left-0 top-0 bottom-0 z-40 hidden md:flex flex-col gap-6 py-6 transition-[width] duration-300 ease-out select-none overflow-hidden ${
        isExpanded
          ? 'w-60 bg-[#0f0f0f]/95 backdrop-blur-xl shadow-2xl shadow-black/80 border-r border-white/5'
          : 'w-16 md:w-20 bg-transparent'
      }`}
    >
      {/* Top brand icon or empty spacer */}
      <div className="flex flex-col items-center px-4 mb-4">
        <button
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-3 w-full group focus:outline-none"
          title="Rellix Home"
        >
          <div className="w-8 h-8 rounded-md overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-512.png" alt="Rellix" className="w-full h-full object-cover" />
          </div>
          <span className={`font-bold text-xl tracking-wider text-[#E50914] uppercase transition-opacity duration-200 whitespace-nowrap ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
            RELLIX
          </span>
        </button>
      </div>

      {/* Main Nav Items (Matches the screenshot vertical row) */}
      <nav className="flex flex-col gap-2 w-full px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex items-center gap-4 w-full px-3 py-3 rounded-lg text-sm font-medium transition-all active:scale-[0.98] group focus:outline-none ${
                isActive
                  ? 'text-white font-semibold'
                  : 'text-[#8c8c8c] hover:text-white hover:bg-white/5'
              }`}
              title={!isExpanded ? item.label : undefined}
            >
              {/* Active Indicator: Red accent matching the screenshot */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#E50914] rounded-r-full shadow-[0_0_12px_#E50914]" />
              )}

              <div
                className={`flex items-center justify-center w-8 h-8 transition-colors ${
                  isActive ? 'text-white' : 'text-[#a3a3a3] group-hover:text-white'
                }`}
              >
                {item.icon}
              </div>

              <span className={`truncate whitespace-nowrap text-left text-sm tracking-wide transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* No API-key or Settings entry here on purpose. Both live in Settings,
          which is reached from the avatar menu in TopNavbar. */}
    </aside>
  );
}

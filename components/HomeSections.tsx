'use client';

import { useState } from 'react';
import { MediaItem } from '@/types/movie';
import { MediaRail } from './MediaRail';
import { buildSections, railQuery, HomeRail } from '@/lib/home-rails';

interface HomeSectionsProps {
  /** Data-driven rows for this viewer ("Because You Watched …", "Because you like …"). */
  adaptive?: HomeRail[];
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  myListIds: string[];
  onToggleMyList: (media: MediaItem) => void;
}

/**
 * The home rail stack.
 *
 * Rails are declared in lib/home-rails.ts rather than hand-written here, so the
 * home screen can cover every genre and region without one JSX element per row.
 * Sections with more than `defaultVisible` rails collapse behind a "Show all"
 * control, and every rail below the fold defers its fetch until it is near the
 * viewport.
 */
export function HomeSections({
  adaptive = [],
  onPlay,
  onOpenDetails,
  myListIds,
  onToggleMyList,
}: HomeSectionsProps) {
  const sections = buildSections(adaptive);
  // One "show all" decision per section, keyed by section id.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-10">
      {sections.map(({ section, rails }) => {
        const limit = section.defaultVisible ?? 4;
        const isExpanded = expanded[section.id] ?? false;
        const collapsible = !!section.collapsible && rails.length > limit;
        const visible = collapsible && !isExpanded ? rails.slice(0, limit) : rails;
        // Count the hidden rows, not the total: "Show all 17 more" was wrong
        // when only 13 were behind the control.
        const hiddenCount = rails.length - visible.length;
        const noun = section.id === 'region' ? 'rows' : section.id === 'trending' ? 'rows' : 'genres';

        return (
          <section key={section.id} aria-label={section.title}>
            {section.title !== 'For You' && (
              <header className="mb-3 flex items-baseline justify-between gap-4 px-6 md:px-16">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-white md:text-lg">
                    {section.title}
                  </h2>
                  {section.subtitle && (
                    <p className="mt-0.5 truncate text-xs text-[#737373]">{section.subtitle}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-[#525252]">
                  {rails.length} {noun}
                </span>
              </header>
            )}

            <div className="space-y-6">
              {visible.map((rail) => (
                <MediaRail
                  key={rail.id}
                  title={rail.title}
                  category={rail.category ?? ''}
                  type={rail.type}
                  query={railQuery(rail) || undefined}
                  apiPath={rail.apiPath}
                  lazy
                  onPlay={onPlay}
                  onOpenDetails={onOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={onToggleMyList}
                />
              ))}
            </div>

            {collapsible && (
              <div className="mt-4 px-6 md:px-16">
                <button
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [section.id]: !isExpanded }))
                  }
                  aria-expanded={isExpanded}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-[#d4d4d4] transition hover:border-white/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
                >
                  {isExpanded ? 'Show less' : `Show ${hiddenCount} more ${noun}`}
                  <span aria-hidden className="text-[10px]">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

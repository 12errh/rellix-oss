'use client';

import { useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';

export interface FacetOption {
  value: string;
  label: string;
}

export interface Facet {
  /** Stable id, e.g. 'sort' | 'genre'. */
  key: string;
  label: string;
  options: FacetOption[];
  value: string;
  onChange: (value: string) => void;
  /** Long option lists scroll horizontally instead of wrapping. */
  scroll?: boolean;
}

interface BrowseFilterBarProps {
  facets: Facet[];
  /** Rendered behind a "More filters" disclosure — keeps a sticky bar short. */
  advancedFacets?: Facet[];
  resultCount: number;
  loading?: boolean;
  totalLabel?: string;
  onClear?: () => void;
  showClear?: boolean;
}

/**
 * Shared browse header + filter bar.
 *
 * Root cause of the old UI: every tab (Movies / TV / Anime / Browse) had its
 * own hand-rolled mix of pill buttons and bare <select> elements, so what you
 * could filter by looked different on every screen and the active state was easy
 * to miss. This is the one place that decides how a browse screen looks:
 *
 *  - live result count + a single "Clear all" affordance, only when something is set
 *  - one labelled chip row per facet; selected chip is white-on-black like
 *    Netflix's browse rows, unselected are recessive
 *  - long chip lists scroll sideways instead of wrapping into a tall block
 *  - extra facets collapse behind "More filters" so a sticky bar never eats the
 *    viewport (Browse has type/sort/genre/year/language/country/rating)
 */
export function BrowseFilterBar({
  facets,
  advancedFacets,
  resultCount,
  loading,
  totalLabel,
  onClear,
  showClear,
}: BrowseFilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedActive = advancedFacets?.some(
    (f) => f.value !== '' && !(f.options[0]?.value === f.value)
  );
  const visible = advancedOpen && advancedFacets ? [...facets, ...advancedFacets] : facets;

  return (
    <div className="border-b border-white/10 pb-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-xs text-[#8c8c8c]">
          {loading ? 'Loading…' : `${resultCount} title${resultCount === 1 ? '' : 's'}`}
          {totalLabel ? ` • ${totalLabel}` : ''}
        </p>
        <div className="flex shrink-0 items-center gap-4">
          {advancedFacets && advancedFacets.length > 0 && (
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className={`flex items-center gap-1.5 text-xs font-semibold transition ${
                advancedActive ? 'text-white' : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              More filters
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          {showClear && onClear && (
            <button
              onClick={onClear}
              className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#a3a3a3] transition hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {visible.map((facet) => (
          <div key={facet.key} className="flex items-center gap-3">
            <span className="hidden w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#5f5f5f] sm:block">
              {facet.label}
            </span>
            <div
              className={
                facet.scroll
                  ? 'no-scrollbar flex gap-2 overflow-x-auto pb-0.5'
                  : 'flex flex-wrap gap-2'
              }
            >
              {facet.options.map((opt) => {
                const active = facet.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => facet.onChange(opt.value)}
                    aria-pressed={active}
                    className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'bg-white text-black'
                        : 'bg-white/[0.07] text-[#c9c9c9] hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Convenience helper so tabs declare their chip lists declaratively. */
export function facet(
  key: string,
  label: string,
  options: FacetOption[],
  value: string,
  onChange: (v: string) => void,
  scroll = false
): Facet {
  return { key, label, options, value, onChange, scroll };
}

export function FilterIcon() {
  return <SlidersHorizontal className="h-4 w-4" />;
}
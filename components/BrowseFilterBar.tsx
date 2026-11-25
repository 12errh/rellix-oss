'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RotateCcw } from 'lucide-react';

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
}

interface BrowseFilterBarProps {
  facets: Facet[];
  resultCount: number;
  loading?: boolean;
  onClear?: () => void;
  showClear?: boolean;
}

const DEFAULT_LABELS: Record<string, true> = {
  all: true,
  any: true,
  'all genres': true,
  'any year': true,
  'any language': true,
  'any country': true,
  'any rating': true,
  // Defaults for facets that have no empty option. They are still real values;
  // the pill simply stays quiet until the user changes them.
  popular: true,
  movies: true,
};

const MENU_WIDTH = 224;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

interface MenuPosition {
  key: string;
  top: number;
  left: number;
}

function menuPosition(key: string, trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const left =
    rect.right + MENU_WIDTH + VIEWPORT_MARGIN > window.innerWidth
      ? rect.right - MENU_WIDTH
      : rect.left;
  return {
    key,
    top: rect.bottom + MENU_GAP,
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, left),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
    ),
  };
}

/**
 * One compact row of dropdown filters — the Netflix browse pattern.
 *
 * The previous version stacked one chip row per facet (type, sort, genre, year,
 * language, country, rating). Seven wrapped rows pushed the first poster below
 * the fold on a laptop, and the "More filters" disclosure meant half of them
 * were invisible until opened. Every facet now lives in the same row as a pill
 * that shows its current value; the menu lists the options.
 *
 * Facets are single-select on purpose: `lib/client-tmdb.ts` passes `with_genres`
 * as one comma list to TMDB, and the certification ladder takes one ceiling.
 * Multi-select here would either lie about what the results mean or need a new
 * query shape on the shim.
 *
 * Menus render in a portal: on phones the pill row is an `overflow-x-auto`
 * strip, which would otherwise clip a menu to its 30px height.
 */
export function BrowseFilterBar({
  facets,
  resultCount,
  loading,
  onClear,
  showClear,
}: BrowseFilterBarProps) {
  const [open, setOpen] = useState<MenuPosition | null>(null);
  const baseId = useId();
  const openKey = open?.key ?? null;

  useEffect(() => {
    if (!openKey) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-facet-menu]')) return;
      // Let the trigger's own click handler toggle; closing here would make
      // the following click reopen the same menu.
      if (target.closest('[data-facet-trigger]')) return;
      setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openKey]);

  useEffect(() => {
    if (!openKey) return;

    const reposition = () => {
      const trigger = document.querySelector<HTMLElement>(
        `[data-facet-trigger="${openKey}"]`
      );
      if (trigger) setOpen(menuPosition(openKey, trigger));
    };
    // Scroll events do not bubble from the pill strip, so listen in capture.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [openKey]);

  return (
    <div className="border-b border-white/[0.08] pb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a7a7a] sm:mr-auto">
          {loading
            ? 'Loading'
            : `${resultCount} title${resultCount === 1 ? '' : 's'}`}
        </p>

        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {facets.map((facetProp) => {
            const selected = facetProp.options.find(
              (opt) => opt.value === facetProp.value
            );
            const showValue =
              selected && !DEFAULT_LABELS[selected.label.trim().toLowerCase()];
            const isOpen = open?.key === facetProp.key;
            const menuId = `${baseId}-${facetProp.key}`;

            return (
              <div key={facetProp.key} className="relative shrink-0">
                <button
                  type="button"
                  data-facet-trigger={facetProp.key}
                  aria-haspopup="listbox"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? menuId : undefined}
                  aria-label={`${facetProp.label}: ${selected?.label ?? 'any'}`}
                  onClick={(event) => {
                    if (isOpen) {
                      setOpen(null);
                      return;
                    }
                    setOpen(menuPosition(facetProp.key, event.currentTarget));
                  }}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${
                    isOpen || showValue
                      ? 'border-white/45 text-white'
                      : 'border-white/[0.16] text-[#b0b0b0] hover:border-white/30 hover:text-white'
                  }`}
                >
                  <span>{facetProp.label}</span>
                  {showValue && (
                    <>
                      <span aria-hidden className="text-[#5f5f5f]">
                        /
                      </span>
                      <span className="max-w-[9rem] truncate normal-case tracking-normal text-[11px]">
                        {selected.label}
                      </span>
                    </>
                  )}
                  <ChevronDown
                    aria-hidden
                    className={`h-3 w-3 text-[#7a7a7a] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen &&
                  createPortal(
                    <div
                      id={menuId}
                      role="listbox"
                      aria-label={facetProp.label}
                      data-facet-menu
                      style={{
                        top: open.top,
                        left: open.left,
                        width: MENU_WIDTH,
                      }}
                      className="fixed z-[60] max-h-72 overflow-y-auto border border-white/[0.12] bg-[#151515] py-1 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
                    >
                      {facetProp.options.map((opt) => {
                        const isSelected = opt.value === facetProp.value;
                        return (
                          <button
                            key={opt.value || 'default'}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              facetProp.onChange(opt.value);
                              setOpen(null);
                            }}
                            className={`flex w-full items-center border-l-2 px-3 py-2 text-left text-xs transition-colors ${
                              isSelected
                                ? 'border-[#E50914] bg-white/[0.04] text-white'
                                : 'border-transparent text-[#b4b4b4] hover:bg-white/[0.05] hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>,
                    document.body
                  )}
              </div>
            );
          })}

          {showClear && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#8a8a8a] transition-colors hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Convenience helper so tabs declare their option lists declaratively. */
export function facet(
  key: string,
  label: string,
  options: FacetOption[],
  value: string,
  onChange: (v: string) => void
): Facet {
  return { key, label, options, value, onChange };
}

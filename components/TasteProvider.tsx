'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { MediaItem } from '@/types/movie';
import { computeMatch } from '@/lib/taste';

/**
 * The current viewer's weighted genre profile.
 *
 * Kept in React state rather than a module-level variable so a profile switch
 * and new likes re-render every match badge immediately. A module variable was
 * only updated in an effect, which meant cards could render once with the
 * previous viewer's (or no) taste signal and never update.
 */
const TasteContext = createContext<ReadonlyMap<string, number> | null>(null);

export function TasteProvider({
  profile,
  children,
}: {
  profile: ReadonlyMap<string, number> | null;
  children: ReactNode;
}) {
  return <TasteContext.Provider value={profile}>{children}</TasteContext.Provider>;
}

/** Returns a score function bound to the current taste profile. */
export function useMatchScore(): (item: MediaItem) => number | null {
  const profile = useContext(TasteContext);
  return (item) => computeMatch(item, profile);
}

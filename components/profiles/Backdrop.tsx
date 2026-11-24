'use client';

import React from 'react';

// Plain, near-black backdrop with a very subtle top glow for the profile
// picker + PIN screens. No tiles — clean and mobile-friendly.
export function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0a]">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(60% 40% at 50% -5%, rgba(229,9,20,0.12), transparent 60%), radial-gradient(50% 30% at 50% 110%, rgba(255,255,255,0.04), transparent 60%)',
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </div>
  );
}

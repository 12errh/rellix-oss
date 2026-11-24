import React from 'react';

// Loading skeleton for the profile-gate phase (before we know whether to show
// WhoIsWatching, PIN entry, or the home screen). Matches the picker layout.
export function ProfileGateSkeleton() {
  return (
    <div className="flex min-h-screen w-full animate-pulse flex-col items-center justify-center gap-8 bg-[#0a0a0a] px-4">
      <div className="h-10 w-72 rounded-lg bg-white/10" />
      <div className="flex flex-wrap justify-center gap-6 md:gap-10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-[#1f1f1f]" />
            <div className="h-4 w-16 rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="h-9 w-44 rounded-full bg-white/5" />
    </div>
  );
}

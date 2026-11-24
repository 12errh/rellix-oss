'use client';

import React from 'react';

export type PinLength = 4 | 6;

export const PIN_LENGTHS: PinLength[] = [4, 6];

/**
 * 4 or 6 digits, chosen by whoever sets the PIN.
 *
 * 4 digits is 10,000 candidates; 6 is 1,000,000. The chosen length is stored on
 * the profile record so the lock screen knows how many digits to render before
 * the user types anything. This is a UX lock stored in the same browser it
 * protects — see lib/db.ts.
 */
export function PinLengthPicker({
  value,
  onChange,
  disabled,
}: {
  value: PinLength;
  onChange: (n: PinLength) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="PIN length">
      {PIN_LENGTHS.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
              active
                ? 'border-[#E50914] bg-[#E50914]/15 text-white'
                : 'border-white/10 bg-black/40 text-[#8e8e8e] hover:text-white'
            }`}
          >
            {n} digits
          </button>
        );
      })}
    </div>
  );
}

export function PinDigits({
  length,
  filled,
  error,
}: {
  length: number;
  filled: number;
  error?: boolean;
}) {
  return (
    <div
      className="flex justify-center gap-2.5"
      style={error ? { animation: 'rellix-shake 0.4s ease' } : undefined}
      aria-label="pin"
    >
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className={`h-3.5 w-3.5 rounded-full transition ${
            filled > i ? 'bg-[#E50914]' : 'bg-white/25'
          }`}
        />
      ))}
    </div>
  );
}
export function formatRemaining(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export function parseDurationToMinutes(duration?: string): number | undefined {
  if (!duration) return undefined;
  const hMatch = duration.match(/(\d+)\s*h/);
  const mMatch = duration.match(/(\d+)\s*m/);
  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  const total = h * 60 + m;
  return total > 0 ? total : undefined;
}

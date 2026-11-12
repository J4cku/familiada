import { useEffect } from 'react';

/** Exposes the configured team colours as --team-0 / --team-1 for both views. */
export function useTeamColors(colors: readonly [string, string]) {
  const [left, right] = colors;
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--team-0', left);
    root.setProperty('--team-1', right);
  }, [left, right]);
}

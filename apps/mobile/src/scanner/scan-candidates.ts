import type { RadarBottleOption } from '../api/types';

/** Require repeated agreement, then hold results until the user starts a new scan. */
export function createCandidateLatch() {
  let previous = '';
  let locked = false;
  return {
    observe(matches: RadarBottleOption[]): RadarBottleOption[] | null {
      if (locked) return null;
      const candidate = matches[0]?.id || '';
      if (!candidate || candidate !== previous) { previous = candidate; return null; }
      locked = true;
      return matches;
    },
    verified(matches: RadarBottleOption[]): RadarBottleOption[] | null {
      if (locked || !matches.length) return null;
      locked = true;
      return matches;
    },
  };
}

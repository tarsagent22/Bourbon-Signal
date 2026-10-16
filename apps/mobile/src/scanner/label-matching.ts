import type { RadarBottleOption } from '../api/types';

const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const generic = new Set('kentucky straight bourbon whiskey whisky distilled bottled distillery american alcohol volume alc vol proof year years aged reserve small batch single barrel the and of in by for ml liter litre'.split(' '));

export function createLabelIndex(catalog: readonly RadarBottleOption[]) {
  return catalog.map(bottle => ({ bottle, names: [bottle.name, ...(bottle.aliases || [])].map(normalize).filter(Boolean) }));
}

/** Candidate retrieval, never an identity claim. Batch/age confirmation belongs to the user. */
export function matchBottleLabel(index: ReturnType<typeof createLabelIndex>, text: string, limit = 4): RadarBottleOption[] {
  const normalized = normalize(text.slice(0, 4000));
  if (normalized.length < 4) return [];
  const observed = new Set(normalized.split(' '));
  const observedAges = [...normalized.matchAll(/\b(\d{1,2})\s*(?:years?|yr)\b/g)].map(match => match[1]);
  const ranked = index.map(({ bottle, names }) => {
    const bottleAge = normalize(bottle.ageStatement || '').match(/^(\d{1,2})(?:y| year)/)?.[1] || normalize(bottle.name).match(/\b(\d{1,2})\s*year\b/)?.[1];
    if (bottleAge && observedAges.length && !observedAges.includes(String(Number(bottleAge)))) return { bottle, score: 0 };
    const score = Math.max(...names.map(name => {
      const tokens = [...new Set(name.split(' ').filter(token => !generic.has(token) && token.length > 1))];
      const words = tokens.filter(token => !/^\d+$/.test(token));
      // A numeric brand such as 1792 is a useful anchor; proof alone is not.
      const meaningful = words.length ? words : /^\d{3,4}\b/.test(name) ? [name.split(' ')[0]] : [];
      const matched = meaningful.filter(token => observed.has(token));
      // Generic label text and a lone brand word must not become confident matches.
      if (!meaningful.length || matched.length < Math.min(2, meaningful.length) || matched.length / meaningful.length < 0.65) return 0;
      const age = name.match(/\b(\d{1,2})\s*year\b/)?.[1];
      if (age && observedAges.length && !observedAges.includes(age)) return 0;
      const numbers = tokens.filter(token => /^\d+$/.test(token));
      return matched.length / meaningful.length * 10 + matched.length + (normalized.includes(name) ? 10 : 0) + numbers.filter(token => observed.has(token)).length * 3;
    }));
    return { bottle, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.bottle.name.localeCompare(b.bottle.name));
  return ranked.slice(0, limit).map(item => item.bottle);
}

export function normalizeBarcode(value: string): string | null {
  if (!/^\d{12,13}$/.test(value)) return null;
  const code = value.length === 12 ? `0${value}` : value;
  const sum = code.slice(0, 12).split('').reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === Number(code[12]) ? code : null;
}

// Only owner-reviewed, exact-release mappings belong here. Never infer identity from a UPC.
export const VERIFIED_BOTTLE_BARCODES: Readonly<Record<string, string>> = {};

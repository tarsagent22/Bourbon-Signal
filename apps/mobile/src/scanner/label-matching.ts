import type { RadarBottleOption } from '../api/types';

const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
  .replace(/\b(?:[a-z] ){1,}[a-z]\b/g, initials => initials.replace(/ /g, ''))
  .replace(/\b0*(\d{1,2})\s*(?:years?|yrs?|yo|y)\b/g, '$1 year');
const generic = new Set('kentucky straight bourbon whiskey whisky distilled bottled distillery american alcohol volume alc vol proof year years aged reserve small batch single barrel the and of in by for ml liter litre'.split(' '));
const expressions = ['small batch', 'single barrel', 'barrel proof', 'full proof', 'cask strength', 'bottled in bond'];
function namesFor(bottle: RadarBottleOption) {
  return [...new Set([bottle.name, ...(bottle.aliases || [])].map(normalize).filter(Boolean))].map(name => {
    const tokens = [...new Set(name.split(' ').filter(token => !generic.has(token) && token.length > 1))];
    const words = tokens.filter(token => !/^\d+$/.test(token));
    return { name, meaningful: words.length ? words : /^\d{3,4}\b/.test(name) ? [name.split(' ')[0]] : [], numbers: tokens.filter(token => /^\d+$/.test(token)) };
  });
}
type LabelEntry = { bottle: RadarBottleOption; identity: string; names: ReturnType<typeof namesFor>; rye: boolean; expressions: string[]; numericBrand?: string; age?: string; editions: string[] };
type LabelIndex = { entries: LabelEntry[]; byToken: Map<string, Set<LabelEntry>>; fuzzyTokens: Map<string, Set<string>> };
const indexes = new WeakMap<readonly RadarBottleOption[], LabelIndex>();
const deletionKeys = (word: string) => [word, ...Array.from(word, (_, i) => word.slice(0, i) + word.slice(i + 1))];

export function createLabelIndex(catalog: readonly RadarBottleOption[]): LabelIndex {
  const cached = indexes.get(catalog);
  if (cached) return cached;
  const index: LabelIndex = { entries: [], byToken: new Map(), fuzzyTokens: new Map() };
  for (const bottle of catalog) {
    const identity = normalize(bottle.name);
    const entry: LabelEntry = { bottle, identity, names: namesFor(bottle), rye: identity.split(' ').includes('rye'), expressions: expressions.filter(e => identity.includes(e)),
      numericBrand: identity.match(/^(\d{3,4})\b/)?.[1], age: identity.match(/\b(\d{1,2}) year\b/)?.[1] || normalize(bottle.ageStatement || '').match(/^(\d{1,2}) year\b/)?.[1],
      editions: [...identity.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m => m[1]) };
    index.entries.push(entry);
    for (const token of new Set(entry.names.flatMap(n => n.meaningful))) {
      const rows = index.byToken.get(token) || new Set(); rows.add(entry); index.byToken.set(token, rows);
    }
  }
  for (const token of index.byToken.keys()) if (token.length >= 5 && /^[a-z]+$/.test(token)) {
    for (const key of deletionKeys(token)) {
      const words = index.fuzzyTokens.get(key) || new Set(); words.add(token); index.fuzzyTokens.set(key, words);
    }
  }
  indexes.set(catalog, index);
  return index;
}

function oneEdit(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let a = 0, b = 0, differences = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    if (++differences > 1) return false;
    if (left.length >= right.length) a++;
    if (right.length >= left.length) b++;
  }
  return differences + Number(a < left.length || b < right.length) <= 1;
}

/** Candidate retrieval, never an identity claim. Batch/age confirmation belongs to the user. */
export function matchBottleLabel(index: LabelIndex, text: string, limit = 4): RadarBottleOption[] {
  const normalized = normalize(text.slice(0, 4000));
  if (normalized.length < 3 || !Number.isFinite(limit) || limit <= 0) return [];
  const observed = new Set(normalized.split(' '));
  const observedExpressions = expressions.filter(expression => normalized.includes(expression));
  const observedAges = [...normalized.matchAll(/\b(\d{1,2}) year\b/g)].map(match => match[1]);
  const observedEditions = [...normalized.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(match => match[1]);
  const ryeLabel = /\b(?:straight rye|rye whisk(?:ey|y))\b/.test(normalized) || observed.has('rye') && !observed.has('bourbon');
  const candidates = new Set<LabelEntry>(), approximate = new Set<string>();
  for (const token of observed) {
    for (const entry of index.byToken.get(token) || []) candidates.add(entry);
    if (token.length < 5 || !/^[a-z]+$/.test(token) || generic.has(token) || index.byToken.has(token)) continue;
    for (const key of deletionKeys(token)) for (const word of index.fuzzyTokens.get(key) || []) if (oneEdit(token, word)) {
      approximate.add(word); for (const entry of index.byToken.get(word) || []) candidates.add(entry);
    }
  }
  const ranked: { bottle: RadarBottleOption; score: number; expression: boolean }[] = [];
  for (const entry of candidates) {
    const { bottle, identity, names } = entry;
    if (ryeLabel && !entry.rye || observed.has('bourbon') && !observed.has('rye') && entry.rye) continue;
    if (observedExpressions.length && entry.expressions.length && !observedExpressions.some(e => entry.expressions.includes(e))) continue;
    if (entry.numericBrand && !observed.has(entry.numericBrand)) continue;
    if (entry.age && observedAges.length && !observedAges.includes(entry.age)) continue;
    if (entry.editions.length && observedEditions.length && !entry.editions.some(n => observedEditions.includes(n))) continue;
    const score = Math.max(0, ...names.map(({ name, meaningful, numbers }) => {
      const exact = meaningful.filter(token => observed.has(token)).length;
      const fuzzy = meaningful.some(token => !observed.has(token) && approximate.has(token)) ? 1 : 0;
      // Require an exact anchor alongside a single OCR correction. Proof/age
      // numbers and short brand words never receive fuzzy identity corrections.
      const matched = exact + (exact >= 1 && meaningful.length >= 2 ? fuzzy : 0);
      if (!meaningful.length || matched < Math.min(2, meaningful.length) || matched / meaningful.length < 0.65) return 0;
      const age = name.match(/\b(\d{1,2}) year\b/)?.[1];
      if (age && observedAges.length && !observedAges.includes(age)) return 0;
      return matched / meaningful.length * 10 + matched + (normalized.includes(name) ? 10 : 0) + numbers.filter(token => observed.has(token)).length * 3 - (matched > exact ? 4 : 0);
    }));
    if (score) ranked.push({ bottle, score: score + (normalized === identity ? 20 : 0), expression: observedExpressions.some(e => entry.expressions.includes(e)) });
  }
  ranked.sort((a, b) => b.score - a.score || a.bottle.name.localeCompare(b.bottle.name) || a.bottle.id.localeCompare(b.bottle.id));
  const expressionMatches = observedExpressions.length ? ranked.filter(item => item.expression) : [];
  return (expressionMatches.length ? expressionMatches : ranked).slice(0, Math.floor(limit)).map(item => item.bottle);
}

export function normalizeBarcode(value: string): string | null {
  if (!/^\d{12,13}$/.test(value)) return null;
  const code = value.length === 12 ? `0${value}` : value;
  const sum = code.slice(0, 12).split('').reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === Number(code[12]) ? code : null;
}

// Only owner-reviewed, exact-release mappings belong here. Never infer identity from a UPC.
export const VERIFIED_BOTTLE_BARCODES: Readonly<Record<string, string>> = {};

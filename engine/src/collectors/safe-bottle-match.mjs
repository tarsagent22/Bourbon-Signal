function normalizedBottleText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cityHiveSafeBottleMatch(rawName, bible) {
  const { match, record } = bottleMatch(rawName, bible);
  if (!record) return { match, record: null, unsafeReason: 'no_bottle_bible_match' };
  const unsafeReason = cityHiveUnsafeBottleMatchReason(rawName, record);
  if (unsafeReason) return { match, record: null, unsafeReason };
  return { match, record, unsafeReason: null };
}

export function cityHiveUnsafeBottleMatchReason(rawName, record) {
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(record.canonical);
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(raw) && !/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(canonical)) return 'flavored_or_liqueur_matched_core_bottle';
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return 'rye_matched_non_rye';
  if (/\bbourbon\b/.test(raw) && /\brye\b/.test(canonical) && !/\brye\b/.test(raw)) return 'bourbon_matched_rye';
  if (/\bwheated\b/.test(raw) && !/\bwheated\b/.test(canonical)) return 'wheated_matched_non_wheated';
  if (/\breserve\b/.test(raw) && !/\breserve\b/.test(canonical)) return 'reserve_matched_non_reserve';
  const rawSpecificPhrases = ['single barrel', 'full proof', 'barrel proof', 'cask strength', 'limited edition', 'small batch select', 'private selection', 'store pick'];
  for (const phrase of rawSpecificPhrases) {
    const reviewedHenryMcKennaSingleBarrel = phrase === 'single barrel'
      && raw === 'henry mckenna single barrel 10 year old bourbon whiskey'
      && canonical === 'henry mckenna 10 year';
    if (raw.includes(phrase) && !canonical.includes(phrase) && !reviewedHenryMcKennaSingleBarrel && !(phrase === 'cask strength' && canonical.includes('barrel proof'))) return `specific_raw_modifier_matched_generic:${phrase}`;
  }
  const requiredPhrases = [
    'limited edition', 'batch proof', 'barrel proof', 'single barrel', 'small batch select',
    'small batch', 'full proof', 'bottled in bond', 'private barrel', 'store pick', 'single barrel select'
  ];
  for (const phrase of requiredPhrases) {
    if (canonical.includes(phrase) && !raw.includes(phrase)) return `missing_modifier:${phrase}`;
  }
  if (/\bfour roses\b/.test(canonical) && /\bbarrel strength\b/.test(canonical)) {
    const hasBarrelStrengthSignal = /\b(barrel strength|cask strength|private selection|private barrel|single barrel select|oes[foqkv]|obs[foqkv])\b/.test(raw);
    if (!hasBarrelStrengthSignal) return 'four_roses_standard_single_barrel_not_barrel_strength';
  }
  for (const yearExpression of [...canonical.matchAll(/\b((?:18|19|20)\d{2})\b/g)].map((m) => m[1])) {
    if (!new RegExp(`\\b${yearExpression}\\b`).test(raw)) return `missing_expression:${yearExpression}`;
  }
  for (const year of [...canonical.matchAll(/\b(\d{1,2})\s*year\b/g)].map((m) => m[1])) {
    if (!new RegExp(`\\b${year}\\s*(?:year|yr|y)\\b`).test(raw)) return `missing_age:${year}`;
  }
  for (const year of [...canonical.matchAll(/\b(\d{1,2})\s*y\b/g)].map((m) => m[1])) {
    if (!new RegExp(`\\b${year}\\s*(?:y|yr|year)\\b`).test(raw)) return `missing_age:${year}y`;
  }
  return null;
}

function bottleMatch(raw, bible) {
  const match = bible.match(raw);
  return { match, record: match?.record };
}


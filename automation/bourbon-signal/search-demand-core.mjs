const DEFAULT_MIN_COHORT = 5;
const EMAIL_SHAPE = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i;
const URL_SHAPE = /(?:\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|info|biz)(?:\b|\/))/i;
const PHONE_SHAPE = /(?:\+?\d[\s().-]*){7,}/;

export function containsSensitiveSearchInput(value) {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  return candidate.length > 180
    || /[\u0000-\u001f\u007f]/.test(candidate)
    || EMAIL_SHAPE.test(candidate)
    || URL_SHAPE.test(candidate)
    || PHONE_SHAPE.test(candidate);
}

function clean(value, max = 180) {
  if (typeof value !== 'string' || containsSensitiveSearchInput(value)) return '';
  const result = value.trim().replace(/\s+/g, ' ');
  return result.length <= max ? result : '';
}

function lookupKey(value) {
  return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildCatalog(catalog) {
  const lookup = new Map();
  for (const item of Array.isArray(catalog) ? catalog.slice(0, 2_000) : []) {
    const canonicalBottleId = clean(item.canonical_id || item.id, 160).toLowerCase();
    const canonicalBottleName = clean(item.canonical_name || item.name, 180);
    if (!/^[a-z0-9][a-z0-9_-]{0,159}$/.test(canonicalBottleId) || !canonicalBottleName) continue;
    const canonical = { canonicalBottleId, canonicalBottleName };
    for (const alias of [item.id, item.name, item.canonical_id, item.canonical_name, item.canonical_key, ...(item.aliases || [])]) {
      const key = lookupKey(alias);
      if (!key) continue;
      const existing = lookup.get(key);
      if (existing && existing.canonicalBottleId !== canonicalBottleId) lookup.set(key, null);
      else if (existing === undefined) lookup.set(key, canonical);
    }
  }
  return lookup;
}

export function buildPrivacySafeSearchDemand(events, options) {
  const minCohortSize = Math.max(DEFAULT_MIN_COHORT, Math.floor(options?.minCohortSize || DEFAULT_MIN_COHORT));
  const approvedStates = new Set((options?.approvedStateCodes || []).map((state) => clean(state, 32).toUpperCase()).filter(Boolean));
  const catalog = buildCatalog(options?.catalog || []);
  const bottleCounts = new Map();
  const geographyCounts = new Map();
  let acceptedEvents = 0;
  let rejectedSensitiveEvents = 0;

  for (const raw of Array.isArray(events) ? events.slice(0, 100_000) : []) {
    const event = raw && typeof raw === 'object' ? raw : {};
    if (containsSensitiveSearchInput(event.query)) {
      rejectedSensitiveEvents += 1;
      continue;
    }
    acceptedEvents += 1;
    const idKey = lookupKey(event.matchedBottleId);
    const nameKey = lookupKey(event.matchedBottleName);
    const canonical = catalog.get(idKey) || catalog.get(nameKey) || null;
    if (canonical) {
      const current = bottleCounts.get(canonical.canonicalBottleId) || { ...canonical, eventCount: 0 };
      current.eventCount += 1;
      bottleCounts.set(canonical.canonicalBottleId, current);
    }
    const state = clean(event.state, 32).toUpperCase();
    if (approvedStates.has(state)) geographyCounts.set(state, (geographyCounts.get(state) || 0) + 1);
  }

  const bottles = [...bottleCounts.values()]
    .filter((item) => item.eventCount >= minCohortSize)
    .map((item) => ({ ...item, weightedDemand: item.eventCount }))
    .sort((a, b) => b.weightedDemand - a.weightedDemand || a.canonicalBottleName.localeCompare(b.canonicalBottleName));
  const geographies = [...geographyCounts.entries()]
    .filter(([, eventCount]) => eventCount >= minCohortSize)
    .map(([state, eventCount]) => ({ state, eventCount, weightedDemand: eventCount }))
    .sort((a, b) => b.weightedDemand - a.weightedDemand || a.state.localeCompare(b.state));

  return {
    privacy: { minCohortSize, containsPii: false, containsRawHistory: false },
    acceptedEvents,
    rejectedSensitiveEvents,
    bottles,
    geographies,
    suppressed: {
      bottleCohorts: [...bottleCounts.values()].filter((item) => item.eventCount < minCohortSize).length,
      geographyCohorts: [...geographyCounts.values()].filter((eventCount) => eventCount < minCohortSize).length,
    },
  };
}

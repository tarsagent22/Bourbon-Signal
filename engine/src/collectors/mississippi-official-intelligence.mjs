const ALLOWED_TYPES = new Set(['directory', 'official_catalog', 'pricing_change', 'release_watch']);

export function buildMississippiOfficialIntelligenceSignal({
  sourceLabel,
  sourceUrl,
  rawName,
  signalType,
  observedAt = new Date().toISOString(),
  raw = {},
} = {}) {
  if (!ALLOWED_TYPES.has(signalType)) throw new TypeError(`Unsupported Mississippi official intelligence type ${signalType}`);
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || !/(?:^|\.)dor\.ms\.gov$/iu.test(url.hostname)) throw new TypeError('Mississippi official intelligence requires an official DOR HTTPS source');
  return {
    state: 'MS',
    stateCode: 'MS',
    sourceLabel,
    sourceUrl: url.href,
    rawName,
    canonicalBottleId: null,
    canonicalName: null,
    eventType: signalType,
    sourceLayer: signalType === 'directory' ? 'directory' : 'official_intelligence',
    locationPrecision: signalType === 'directory' ? 'store_level' : 'statewide_catalog',
    quantity: 0,
    quantityIsExact: false,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    inventorySemantics: 'Mississippi DOR directory, catalog, SPA, pricing, bailment, wholesale, and policy evidence is intelligence only and never exact consumer-premises bottle inventory.',
    raw: {
      ...raw,
      inventoryAuthoritative: false,
      officialIntelligenceType: signalType,
    },
  };
}

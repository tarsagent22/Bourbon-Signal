function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function parseArcgisFeaturesPayload(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('ArcGIS response was not valid JSON.');
  }
  if (payload?.error) throw new Error(`ArcGIS error: ${payload.error.message || 'unknown service error'}`);
  if (!Array.isArray(payload?.features)) throw new Error('ArcGIS response did not include a features array.');
  if (payload.features.length === 0) throw new Error('ArcGIS response returned an empty feature set.');
  return payload.features;
}

export function assertCredibleVirginiaOfficialLocations(locations) {
  if (!Array.isArray(locations) || locations.length < 300) {
    throw new Error(`Virginia official location refresh did not meet the credible minimum of 300 rows (received ${locations?.length || 0}).`);
  }
  return locations;
}

export function virginiaOfficialStoreIdentity(name) {
  const match = clean(name).match(/^(?:virginia\s+)?abc\s+store\s+0*(\d+)$/i);
  if (!match) return null;
  const sourceStoreId = String(Number(match[1]));
  if (!sourceStoreId || sourceStoreId === '0') return null;
  return { id: sourceStoreId, sourceStoreId };
}

export function replaceRefreshedOfficialLocations({ previous = [], collected = [], refreshedSources = [] }) {
  const refreshed = new Set(refreshedSources.map((source) => clean(source)).filter(Boolean));
  const byId = new Map();
  for (const location of previous) {
    if (!location?.id || refreshed.has(clean(location.source))) continue;
    byId.set(location.id, location);
  }
  for (const location of collected) {
    if (location?.id) byId.set(location.id, location);
  }
  return [...byId.values()];
}

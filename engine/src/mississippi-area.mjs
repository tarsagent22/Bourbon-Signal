import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROGRAM_PATH = fileURLToPath(new URL('../../src/config/mississippi-program.json', import.meta.url));

export const MISSISSIPPI_PROGRAM = Object.freeze(JSON.parse(readFileSync(PROGRAM_PATH, 'utf8')));
export const MISSISSIPPI_REGION_IDS = Object.freeze(MISSISSIPPI_PROGRAM.regions.map((region) => region.id));

export function normalizeMississippiPlace(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\bcounty\b/gu, ' ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const REGION_LOOKUP = new Map();
const REGION_BY_ID = new Map();
const COUNTY_TO_REGION = new Map();
const CITY_TO_REGIONS = new Map();

for (const region of MISSISSIPPI_PROGRAM.regions) {
  REGION_BY_ID.set(region.id, region);
  for (const alias of [region.id, region.label, ...(region.aliases || [])]) {
    const key = normalizeMississippiPlace(alias);
    if (key) REGION_LOOKUP.set(key, region.id);
  }
  for (const county of region.counties || []) {
    const key = normalizeMississippiPlace(county);
    if (!key) continue;
    if (COUNTY_TO_REGION.has(key)) throw new Error(`Mississippi county ${county} is assigned to multiple regions.`);
    COUNTY_TO_REGION.set(key, region.id);
  }
  for (const city of region.cities || []) {
    const key = normalizeMississippiPlace(city);
    if (!key) continue;
    const regions = CITY_TO_REGIONS.get(key) || new Set();
    regions.add(region.id);
    CITY_TO_REGIONS.set(key, regions);
  }
}

export function mississippiRegionForLocation(location = {}) {
  const explicit = REGION_LOOKUP.get(normalizeMississippiPlace(location.regionId || location.region || location.area));
  if (explicit) return REGION_BY_ID.get(explicit) || null;
  const countyRegion = COUNTY_TO_REGION.get(normalizeMississippiPlace(location.county));
  if (countyRegion) return REGION_BY_ID.get(countyRegion) || null;
  const cityRegions = CITY_TO_REGIONS.get(normalizeMississippiPlace(location.city));
  if (cityRegions?.size === 1) return REGION_BY_ID.get([...cityRegions][0]) || null;
  return null;
}

export function assignMississippiRegion(location = {}) {
  return mississippiRegionForLocation(location)?.id || null;
}

export function isMississippiAreaMatch(row = {}, area) {
  if (String(row.state || row.stateCode || '').toUpperCase() !== 'MS') return false;
  const requestedRegionId = REGION_LOOKUP.get(normalizeMississippiPlace(area));
  if (!requestedRegionId) return false;
  return assignMississippiRegion(row) === requestedRegionId;
}

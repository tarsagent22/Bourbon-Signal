import { assignMississippiRegion } from '../mississippi-area.mjs';

export function normalizeMississippiPermit(value) {
  const digits = String(value || '').replace(/\D/gu, '');
  return /^\d{6}$/u.test(digits) ? digits : null;
}

export function mississippiPermitStoreId(value) {
  const permitNumber = normalizeMississippiPermit(value);
  if (!permitNumber) throw new TypeError(`Invalid Mississippi permit number ${JSON.stringify(value)}`);
  return `ms-permit-${permitNumber}`;
}

export function normalizeMississippiAddress(value) {
  return String(value || '')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/\bMOUNT\b/gu, 'MT')
    .replace(/\bROAD\b/gu, 'RD')
    .replace(/\bSTREET\b/gu, 'ST')
    .replace(/\bAVENUE\b/gu, 'AVE')
    .replace(/\bBOULEVARD\b/gu, 'BLVD')
    .replace(/\bHIGHWAY\b/gu, 'HWY')
    .replace(/\bSUITE\b/gu, 'STE')
    .replace(/[^A-Z0-9'#&]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeMississippiDirectoryRow(row = {}) {
  const permitNumber = normalizeMississippiPermit(row.permitNumber);
  const city = String(row.city || '').trim();
  const county = String(row.county || '').trim().replace(/\s+County$/iu, '');
  const address = normalizeMississippiAddress(row.address);
  const zip = address.match(/\b(\d{5})(?:-\d{4})?\s*$/u)?.[1] || null;
  const regionId = assignMississippiRegion({ city, county });
  if (!permitNumber || !row.dba || !address || !city || !county || !zip || !regionId) {
    throw new TypeError(`Incomplete Mississippi Package Retailer row for permit ${row.permitNumber || 'unknown'}`);
  }
  return {
    id: mississippiPermitStoreId(permitNumber),
    permitNumber,
    legalName: String(row.legalName || '').trim() || null,
    dba: String(row.dba).trim(),
    name: String(row.dba).trim(),
    address,
    city: city.replace(/\s+/gu, ' ').trim(),
    county,
    state: 'MS',
    stateCode: 'MS',
    zip,
    regionId,
    permitType: 'Package Retailer',
    status: 'current',
  };
}

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function validateFwgsChunk(payload, { offset = 0, limit = 100, minProducts = 10 } = {}) {
  const summary = payload?.summary || {};
  const locations = Array.isArray(payload?.locations) ? payload.locations : [];
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const inventoryRows = Array.isArray(payload?.inventoryRows) ? payload.inventoryRows : [];
  const total = Number(payload?.locationTotal || summary.locationTotal || 0);
  const expected = total > 0 ? Math.max(0, Math.min(limit, total - offset)) : limit;
  const sourceLocationCount = Number(summary.sourceLocationCount ?? locations.length);
  const excludedLocationCount = Number(summary.excludedLocationCount || 0);
  const uniqueLocations = new Set(locations.map((row) => String(row?.locationId || '')).filter(Boolean));
  const uniqueRows = new Set(inventoryRows.map((row) => `${row?.product?.sku || ''}:${row?.location?.locationId || ''}`));
  const nonOkSearches = (payload?.productSearches || []).filter((row) => !row?.ok || Number(row?.status || 0) !== 200);
  const failures = [];
  if (products.length < minProducts) failures.push(`only ${products.length} products (minimum ${minProducts})`);
  if (expected > 0 && sourceLocationCount !== expected) failures.push(`only ${sourceLocationCount}/${expected} source locations for offset ${offset}`);
  if (uniqueLocations.size !== sourceLocationCount - excludedLocationCount) failures.push(`eligible location count does not reconcile with ${excludedLocationCount} explicit exclusions`);
  if (uniqueLocations.size !== locations.length) failures.push('duplicate location IDs');
  if (uniqueRows.size !== inventoryRows.length) failures.push('duplicate SKU/store inventory rows');
  if (nonOkSearches.length) failures.push(`${nonOkSearches.length} product searches failed`);
  if (Number(summary.invalidCoordinateCount || 0) > 0) failures.push(`${summary.invalidCoordinateCount} invalid coordinates`);
  return { ok: failures.length === 0, failures, expectedLocations: expected, locationTotal: total };
}

export function validateFwgsFullArtifact(payload, {
  minPositiveRows = 1000,
  minLocations = 550,
  minProducts = 10,
  minSearchTerms = 30
} = {}) {
  const summary = payload?.summary || {};
  const locations = Array.isArray(payload?.locations) ? payload.locations : [];
  const rows = Array.isArray(payload?.inventoryRows) ? payload.inventoryRows : [];
  const uniqueLocations = new Set(locations.map((row) => String(row?.locationId || '')).filter(Boolean));
  const uniqueRows = new Set(rows.map((row) => `${row?.product?.sku || ''}:${row?.location?.locationId || ''}`));
  const orphanRows = rows.filter((row) => !uniqueLocations.has(String(row?.location?.locationId || '')));
  const invalidQuantities = rows.filter((row) => !Number.isFinite(Number(row?.quantity)) || Number(row.quantity) <= 0);
  const invalidCoordinates = locations.filter((row) => {
    if (row?.latitude == null && row?.longitude == null && row?.coordinateSuppressed) return false;
    const lat = Number(row?.latitude);
    const lon = Number(row?.longitude);
    return !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 39.5 || lat > 42.6 || lon < -80.7 || lon > -74.6;
  });
  const failures = [];
  if (Number(summary.positiveInventoryRowCount || rows.length) < minPositiveRows) failures.push(`positive rows below ${minPositiveRows}`);
  if (uniqueLocations.size < minLocations) failures.push(`locations below ${minLocations}`);
  const reportedTotal = Number(payload?.locationTotal || 0);
  const excludedLocationCount = Number(summary.excludedLocationCount || 0);
  if (reportedTotal > 0 && uniqueLocations.size !== reportedTotal - excludedLocationCount) failures.push(`location coverage ${uniqueLocations.size}/${reportedTotal - excludedLocationCount} eligible (${excludedLocationCount} excluded)`);
  if (Number(summary.positiveInventoryProductCount || 0) < minProducts) failures.push(`positive products below ${minProducts}`);
  if (Number(summary.searchTermCount || 0) < minSearchTerms) failures.push(`search terms below ${minSearchTerms}`);
  if (uniqueLocations.size !== locations.length) failures.push('duplicate location IDs');
  if (uniqueRows.size !== rows.length) failures.push('duplicate SKU/store inventory rows');
  if (orphanRows.length) failures.push(`${orphanRows.length} orphan inventory rows`);
  if (invalidQuantities.length) failures.push(`${invalidQuantities.length} invalid inventory quantities`);
  if (invalidCoordinates.length) failures.push(`${invalidCoordinates.length} locations outside Pennsylvania bounds`);
  if (Number(summary.invalidCoordinateCount || 0) > 0) failures.push('invalid coordinates present');
  if ((payload?.failedChunks || []).length) failures.push('failed chunks present');
  if ((payload?.staleChunks || []).length) failures.push('stale fallback chunks present');
  return { ok: failures.length === 0, failures };
}

export async function atomicWriteJson(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, JSON.stringify(payload, null, 2));
  await rename(temp, file);
}

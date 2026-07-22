import { readFile, stat } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);

const OHIO_INVENTORY_EVENTS = new Set([
  'browser_assisted_store_inventory_in_stock',
  'browser_assisted_store_inventory_limited_supply',
]);

const OHIO_POSITIVE_STATUSES = new Set(['in_stock', 'limited_supply']);

export function seedOhioInventoryCacheSignals(stateReport) {
  const signals = (stateReport?.signals || [])
    .filter((signal) => signal?.state === 'OH'
      && OHIO_INVENTORY_EVENTS.has(String(signal?.eventType || ''))
      && OHIO_POSITIVE_STATUSES.has(String(signal?.availabilityStatus || ''))
      && signal?.locationPrecision === 'store_level'
      && signal?.storeId)
    .map((signal) => {
      const lastConfirmed = signal.observedAt || stateReport?.finishedAt || stateReport?.generatedAt || null;
      return {
        ...signal,
        stale: true,
        sourceStale: true,
        alertable: false,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        staleSourceCaveat: `OHLQ inventory was last confirmed at ${lastConfirmed || 'an unknown time'}; retained for context only. Verify with the store before driving.`,
        raw: {
          ...(signal.raw || {}),
          staleFallback: true,
          staleReason: signal.staleReason || signal.raw?.staleReason || stateReport?.staleReason || 'state_report_cache_seed',
        },
      };
    });

  return {
    generatedAt: stateReport?.lastGoodAt || stateReport?.previousFinishedAt || stateReport?.generatedAt || stateReport?.finishedAt || null,
    signals,
  };
}

export async function loadOhioInventoryRecoverySeed(path, options = {}) {
  const maxCompressedBytes = Math.max(1, Number(options.maxCompressedBytes || 512 * 1024));
  const maxExpandedBytes = Math.max(1, Number(options.maxExpandedBytes || 4 * 1024 * 1024));
  const maxSignals = Math.max(1, Number(options.maxSignals || 2000));
  const metadata = await stat(path);
  if (metadata.size > maxCompressedBytes) throw new Error(`Ohio recovery seed exceeds compressed-size limit (${metadata.size}/${maxCompressedBytes})`);
  const compressed = await readFile(path);
  const report = JSON.parse((await gunzipAsync(compressed, { maxOutputLength: maxExpandedBytes })).toString('utf8'));
  if (!Array.isArray(report?.signals)) throw new Error('Ohio recovery seed has an invalid signal payload');
  if (report.signals.length > maxSignals) throw new Error(`Ohio recovery seed exceeds signal-count limit (${report.signals.length}/${maxSignals})`);
  return seedOhioInventoryCacheSignals(report);
}

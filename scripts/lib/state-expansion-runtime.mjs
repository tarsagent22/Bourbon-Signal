import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RETAILER_EVENT = /^(?:cityhive_store_inventory_result|retailer_store_inventory_result|store_inventory_result)$/i;

export function normalizeStateCode(value) {
  const state = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(state)) throw new Error('State must be a two-letter code.');
  return state;
}

export function optionValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (fallback !== undefined && error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(file, value) {
  const destination = path.resolve(file);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
}

export function runCommand(command, args, { cwd = process.cwd(), env = process.env, timeoutMs = 30 * 60_000, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr, code, signal });
      else reject(new Error(`${command} ${args.join(' ')} exited ${code ?? signal}${stderr ? `: ${stderr.trim().slice(-1000)}` : ''}`));
    });
  });
}

function rows(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (key === 'drops' && Array.isArray(value?.items)) return value.items;
  return [];
}

function alertable(row) {
  return row?.alertable === true || row?.canAlertAsInventory === true || row?.canAlertAsWatch === true
    || row?.eligibleForDelivery === true || row?.eligibleForOnSite === true || row?.eligibleForEmail === true || row?.eligibleForSms === true;
}

function stale(row) {
  return row?.stale === true || row?.sourceStale === true || row?.raw?.staleFallback === true;
}

function freshExactStore(row, stateCode, nowMs, maxAgeMs, minimumObservedAtMs) {
  if (String(row?.state || row?.stateCode || '').toUpperCase() !== stateCode) return false;
  if (!RETAILER_EVENT.test(String(row?.eventType || row?.type || ''))) return false;
  const sourceLabel = row?.sourceLabel || row?.source;
  const canonicalBottleId = row?.canonicalBottleId || row?.canonicalId || row?.bottleId;
  const storeAddress = row?.storeAddress || row?.store_address;
  const verifiedAvailability = row?.sourceAvailabilityVerified === true
    && /^(?:in_stock|available|orderable)$/iu.test(String(row?.availabilityStatus || ''));
  let sourceUrl;
  try { sourceUrl = new URL(row?.sourceUrl); } catch { return false; }
  if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname) return false;
  if (row?.locationPrecision !== 'store_level' || !row?.storeId || !row?.storeName || !storeAddress) return false;
  if (!sourceLabel || !canonicalBottleId || !row?.merchantId || !row?.productId) return false;
  if (row?.canAlertAsInventory !== true && row?.eligibleForOnSite !== true) return false;
  if (!verifiedAvailability || stale(row)) return false;
  const observedAt = Date.parse(row?.observedAt || row?.signalAt || '');
  return Number.isFinite(observedAt) && observedAt >= minimumObservedAtMs
    && nowMs >= observedAt && nowMs - observedAt <= maxAgeMs;
}

export function calculateStateExpansionMetrics({
  stateCode,
  stateReport,
  siteDrops,
  coverageState,
  knownStoreFloor = 0,
  representedAreasFloor = 0,
  nowMs = Date.now(),
  maxAgeMs = 12 * 60 * 60_000,
  minimumObservedAtMs = 0,
} = {}) {
  const state = normalizeStateCode(stateCode);
  const signals = rows(stateReport?.signals, 'signals').filter((row) => String(row?.state || row?.stateCode || '').toUpperCase() === state);
  const drops = rows(siteDrops, 'drops').filter((row) => String(row?.state || row?.stateCode || '').toUpperCase() === state);
  const freshSignals = signals.filter((row) => freshExactStore(row, state, nowMs, maxAgeMs, minimumObservedAtMs));
  const freshDrops = drops.filter((row) => freshExactStore(row, state, nowMs, maxAgeMs, minimumObservedAtMs));
  const liveStoreIds = new Set([...freshSignals, ...freshDrops].map((row) => row.storeId));
  const alertGradeStoreIds = new Set([...freshSignals, ...freshDrops]
    .filter((row) => row.canAlertAsInventory === true)
    .map((row) => row.storeId));
  const knownSignalStores = new Set(signals.filter((row) => row?.locationPrecision === 'store_level' && row?.storeId).map((row) => row.storeId));
  const layers = coverageState?.layers || {};
  return {
    knownStores: Math.max(Number(layers.known) || 0, knownSignalStores.size, Number(knownStoreFloor) || 0),
    liveStores: liveStoreIds.size,
    alertGradeStores: alertGradeStoreIds.size,
    representedAreas: Math.max(Number(coverageState?.representedAreaCount) || 0, Number(representedAreasFloor) || 0),
    freshExactStoreDrops: freshDrops.length,
    alertableStaleRows: [...signals, ...drops].filter((row) => stale(row) && alertable(row)).length,
  };
}

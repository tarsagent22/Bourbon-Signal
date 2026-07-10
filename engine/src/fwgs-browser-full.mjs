import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { atomicWriteJson, validateFwgsChunk, validateFwgsFullArtifact } from './fwgs-artifact-policy.mjs';

const OFFSETS = (process.env.FWGS_FULL_OFFSETS || '0,100,200,300,400,500,600')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value));
const CHUNK_LIMIT = Number(process.env.FWGS_FULL_CHUNK_LIMIT || 100);
const OUT_FILE = process.env.FWGS_OUT_FILE || 'out/browser/fwgs-store-inventory.json';
const CHUNK_RETRIES = Number(process.env.FWGS_FULL_CHUNK_RETRIES || 2);
const ALLOW_PARTIAL = process.env.FWGS_ALLOW_PARTIAL_FULL === '1';
const CHUNK_FALLBACK_MAX_AGE_MS = Number(process.env.FWGS_FULL_CHUNK_FALLBACK_MAX_AGE_MS || 24 * 60 * 60_000);
const CHUNK_REUSE_MAX_AGE_MS = Number(process.env.FWGS_CHUNK_REUSE_MAX_AGE_MS || 2 * 60 * 60_000);

function chunkFileFor(offset) {
  return `out/browser/fwgs-store-inventory-${offset}.json`;
}

async function readUsableChunk(file) {
  try {
    const payload = JSON.parse(await readFile(file, 'utf8'));
    const generatedAt = payload.generatedAt ? new Date(payload.generatedAt).getTime() : 0;
    const ageMs = generatedAt ? Date.now() - generatedAt : Infinity;
    const locationCount = Number(payload.summary?.locationCount || payload.locations?.length || 0);
    const productCount = Number(payload.summary?.productCount || payload.products?.length || 0);
    const offset = Number(file.match(/-(\d+)\.json$/)?.[1] || 0);
    const validation = validateFwgsChunk(payload, { offset, limit: CHUNK_LIMIT });
    if (ageMs >= 0 && ageMs <= CHUNK_FALLBACK_MAX_AGE_MS && locationCount > 0 && productCount > 0 && validation.ok) {
      return { file, payload, ageMs };
    }
  } catch {}
  return null;
}

function runChunk(offset) {
  return new Promise((resolve, reject) => {
    const chunkFile = chunkFileFor(offset);
    const child = spawn(process.execPath, ['src/fwgs-browser-collector.mjs'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        FWGS_LOCATION_OFFSET: String(offset),
        FWGS_LOCATION_LIMIT: String(CHUNK_LIMIT),
        FWGS_OUT_FILE: chunkFile,
        FWGS_REUSE_TAB: '1'
      }
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(chunkFile);
      else reject(new Error(`FWGS chunk offset ${offset} exited ${code}`));
    });
  });
}

async function main() {
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const chunkFiles = [];
  const failedChunks = [];
  const staleChunks = [];
  for (const offset of OFFSETS) {
    let collected = null;
    const reusable = await readUsableChunk(chunkFileFor(offset));
    if (reusable && reusable.ageMs <= CHUNK_REUSE_MAX_AGE_MS) {
      collected = reusable.file;
      console.log(`Reusing validated fresh FWGS chunk offset ${offset} (${Math.round(reusable.ageMs / 1000)}s old).`);
    }
    let lastError = null;
    for (let attempt = 1; !collected && attempt <= CHUNK_RETRIES + 1; attempt += 1) {
      try {
        console.log(`=== FWGS full chunk offset ${offset} ===`);
        const file = await runChunk(offset);
        const payload = JSON.parse(await readFile(file, 'utf8'));
        const validation = validateFwgsChunk(payload, { offset, limit: CHUNK_LIMIT });
        if (!validation.ok) throw new Error(`FWGS chunk offset ${offset} failed validation: ${validation.failures.join('; ')}`);
        collected = file;
        break;
      } catch (error) {
        lastError = error;
        if (attempt <= CHUNK_RETRIES) {
          console.warn(`FWGS chunk offset ${offset} attempt ${attempt}/${CHUNK_RETRIES + 1} failed; retrying: ${error.message}`);
        }
      }
    }
    if (collected) {
      chunkFiles.push(collected);
    } else {
      const fallback = await readUsableChunk(chunkFileFor(offset));
      if (fallback) {
        chunkFiles.push(fallback.file);
        staleChunks.push({
          offset,
          file: fallback.file,
          generatedAt: fallback.payload.generatedAt || null,
          ageMinutes: Math.round(fallback.ageMs / 60_000),
          error: lastError?.message || 'unknown chunk failure'
        });
        console.warn(`FWGS chunk offset ${offset} failed after ${CHUNK_RETRIES + 1} attempts; using previous valid chunk ${fallback.file} from ${fallback.payload.generatedAt || 'unknown time'}.`);
      } else {
        failedChunks.push({ offset, error: lastError?.message || 'unknown chunk failure' });
        console.warn(`FWGS chunk offset ${offset} failed after ${CHUNK_RETRIES + 1} attempts: ${lastError?.message || 'unknown chunk failure'}`);
      }
    }
  }

  const chunks = [];
  for (const file of chunkFiles) chunks.push({ file, payload: JSON.parse(await readFile(file, 'utf8')) });
  const first = chunks[0]?.payload;
  if (!first) throw new Error(`No FWGS chunks were collected. Failed chunks: ${failedChunks.map((f) => `${f.offset}:${f.error}`).join('; ')}`);
  if (failedChunks.length && !ALLOW_PARTIAL) {
    throw new Error(`FWGS full refresh incomplete (${failedChunks.length}/${OFFSETS.length} chunks failed); leaving previous full artifact untouched. Set FWGS_ALLOW_PARTIAL_FULL=1 to publish a partial diagnostic artifact. Failed chunks: ${failedChunks.map((f) => `${f.offset}:${f.error}`).join('; ')}`);
  }

  const locationsById = new Map();
  const rowsByKey = new Map();
  const failures = [];
  const productsBySku = new Map();
  for (const { payload } of chunks) {
    for (const location of payload.locations || []) locationsById.set(location.locationId, location);
    for (const product of payload.products || []) if (product?.sku) productsBySku.set(product.sku, product);
    for (const row of payload.inventoryRows || []) {
      const key = `${row?.product?.sku || ''}:${row?.location?.locationId || ''}`;
      if (key !== ':' && (!rowsByKey.has(key) || Number(row.quantity || 0) > Number(rowsByKey.get(key)?.quantity || 0))) rowsByKey.set(key, row);
    }
    failures.push(...(payload.failures || []));
  }
  const rows = [...rowsByKey.values()];
  const generatedTimes = chunks.map(({ payload }) => Date.parse(payload.generatedAt || '')).filter(Number.isFinite);

  const merged = {
    ...first,
    generatedAt: generatedTimes.length ? new Date(Math.min(...generatedTimes)).toISOString() : new Date().toISOString(),
    sourceUrl: 'https://www.finewineandgoodspirits.com/store-locator',
    chunks: chunks.map(({ file, payload }) => ({ file, generatedAt: payload.generatedAt, summary: payload.summary })),
    failedChunks,
    staleChunks,
    locations: [...locationsById.values()].sort((a, b) => String(a.locationId).localeCompare(String(b.locationId))),
    products: [...productsBySku.values()],
    inventoryRows: rows,
    failures,
    summary: {
      productCount: productsBySku.size,
      searchTermCount: first.summary?.searchTermCount || first.searchTerms?.length || 0,
      locationCount: locationsById.size,
      sourceLocationCount: chunks.reduce((sum, { payload }) => sum + Number(payload.summary?.sourceLocationCount || payload.locations?.length || 0), 0),
      excludedLocationCount: chunks.reduce((sum, { payload }) => sum + Number(payload.summary?.excludedLocationCount || 0), 0),
      positiveInventoryRowCount: rows.length,
      failureCount: failures.length,
      swappedCoordinateCount: chunks.reduce((sum, { payload }) => sum + Number(payload.summary?.swappedCoordinateCount || 0), 0),
      suppressedCoordinateCount: chunks.reduce((sum, { payload }) => sum + Number(payload.summary?.suppressedCoordinateCount || 0), 0),
      invalidCoordinateCount: chunks.reduce((sum, { payload }) => sum + Number(payload.summary?.invalidCoordinateCount || 0), 0),
      positiveInventoryProductCount: new Set(rows.map((row) => row.product?.sku).filter(Boolean)).size
    }
  };
  const validation = validateFwgsFullArtifact(merged, {
    minPositiveRows: Number(process.env.BOURBON_SIGNAL_MIN_FWGS_POSITIVE_ROWS || 1000),
    minLocations: Number(process.env.BOURBON_SIGNAL_MIN_FWGS_LOCATIONS || 550)
  });
  if (!validation.ok) {
    if (ALLOW_PARTIAL) await atomicWriteJson(`${OUT_FILE}.partial`, merged);
    throw new Error(`FWGS full artifact rejected${ALLOW_PARTIAL ? `; diagnostic written to ${OUT_FILE}.partial` : ''}: ${validation.failures.join('; ')}`);
  }
  await atomicWriteJson(OUT_FILE, merged);
  console.log(`Wrote ${OUT_FILE}: ${merged.summary.productCount} products, ${merged.summary.locationCount} stores, ${merged.summary.positiveInventoryRowCount} positive store rows, ${merged.summary.failureCount} failures, ${failedChunks.length} failed chunks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });

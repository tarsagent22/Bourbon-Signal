import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const OFFSETS = (process.env.FWGS_FULL_OFFSETS || '0,100,200,300,400,500')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value));
const CHUNK_LIMIT = Number(process.env.FWGS_FULL_CHUNK_LIMIT || 100);
const OUT_FILE = process.env.FWGS_OUT_FILE || 'out/browser/fwgs-store-inventory.json';

function runChunk(offset) {
  return new Promise((resolve, reject) => {
    const chunkFile = `out/browser/fwgs-store-inventory-${offset}.json`;
    const child = spawn(process.execPath, ['src/fwgs-browser-collector.mjs'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        FWGS_LOCATION_OFFSET: String(offset),
        FWGS_LOCATION_LIMIT: String(CHUNK_LIMIT),
        FWGS_OUT_FILE: chunkFile,
        FWGS_REUSE_TAB: '0'
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
  for (const offset of OFFSETS) {
    console.log(`=== FWGS full chunk offset ${offset} ===`);
    try {
      chunkFiles.push(await runChunk(offset));
    } catch (error) {
      failedChunks.push({ offset, error: error.message });
      console.warn(`FWGS chunk offset ${offset} failed; continuing with remaining chunks: ${error.message}`);
    }
  }

  const chunks = [];
  for (const file of chunkFiles) chunks.push({ file, payload: JSON.parse(await readFile(file, 'utf8')) });
  const first = chunks[0]?.payload;
  if (!first) throw new Error(`No FWGS chunks were collected. Failed chunks: ${failedChunks.map((f) => `${f.offset}:${f.error}`).join('; ')}`);

  const locationsById = new Map();
  const rows = [];
  const failures = [];
  for (const { payload } of chunks) {
    for (const location of payload.locations || []) locationsById.set(location.locationId, location);
    rows.push(...(payload.inventoryRows || []));
    failures.push(...(payload.failures || []));
  }

  const merged = {
    ...first,
    generatedAt: new Date().toISOString(),
    sourceUrl: 'https://www.finewineandgoodspirits.com/store-locator',
    chunks: chunks.map(({ file, payload }) => ({ file, generatedAt: payload.generatedAt, summary: payload.summary })),
    failedChunks,
    locations: [...locationsById.values()].sort((a, b) => String(a.locationId).localeCompare(String(b.locationId))),
    inventoryRows: rows,
    failures,
    summary: {
      productCount: first.products?.length || 0,
      locationCount: locationsById.size,
      positiveInventoryRowCount: rows.length,
      failureCount: failures.length
    }
  };
  await writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${OUT_FILE}: ${merged.summary.productCount} products, ${merged.summary.locationCount} stores, ${merged.summary.positiveInventoryRowCount} positive store rows, ${merged.summary.failureCount} failures, ${failedChunks.length} failed chunks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });

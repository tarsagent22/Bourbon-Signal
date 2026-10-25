import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogDigest, normalizeLibraryCatalog } from './core/library-catalog.mjs';

const source = 'https://www.bourbonsignal.com/api/bottle-catalog';
const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'cache-control': 'no-cache' } });
if (!response.ok) throw new Error(`Full library sync failed: HTTP ${response.status}`);
const payload = await response.json();
const records = normalizeLibraryCatalog(payload);
if (payload.total !== records.length || records.length < 1_000) throw new Error('Full library sync returned an incomplete catalog');
const target = path.resolve('out/library-catalog.json');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(`${target}.tmp`, JSON.stringify({ schemaVersion: 1, source, fetchedAt: new Date().toISOString(), digest: catalogDigest(records), records }, null, 2));
await rename(`${target}.tmp`, target);
console.log(`Synced ${records.length} full app library identities.`);

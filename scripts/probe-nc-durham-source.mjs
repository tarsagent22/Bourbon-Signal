import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { DURHAM_STORE_PRODUCTS, parseDurhamStoreInventory } from '../engine/src/collectors/nc-durham-store-surfaces.mjs';

await mkdir('engine/out/nc-durham-preflight', { recursive: true });
const observations = [];
for (const product of DURHAM_STORE_PRODUCTS) {
  const observation = { url: product.url, checkedAt: new Date().toISOString(), status: 0, parsed: false };
  try {
    const response = await fetch(product.url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) });
    observation.status = response.status;
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('source_unavailable'); }
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length; if (bytes > 2_000_000) throw new Error('source_size_limit'); chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    observation.sha256 = createHash('sha256').update(body).digest('hex');
    const parsed = parseDurhamStoreInventory(body.toString('utf8'), product.url);
    if (!parsed) throw new Error('source_schema_unverified');
    Object.assign(observation, { parsed: true, product: parsed });
  } catch { observation.error = 'public_source_or_identity_unverified'; }
  observations.push(observation);
}
const complete = observations.every(row => row.status === 200 && row.parsed);
const evidence = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  headSha: process.env.GITHUB_SHA || null, workflowRunId: process.env.GITHUB_RUN_ID || null,
  complete, mode: 'research_preflight', productionSnapshotTouched: false, deliveryEnabled: false, observations };
await writeFile('engine/out/nc-durham-preflight/evidence.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ complete, sourceCount: observations.length,
  positiveStores: new Set(observations.flatMap(row => (row.product?.stores || []).filter(store => store.inStock).map(store => store.storeId))).size,
  publication: false, delivery: false }));
if (!complete) process.exitCode = 1;

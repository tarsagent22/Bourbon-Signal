import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MA_JULIOS_PROBE_URLS, parseMassachusettsJulios } from '../engine/src/collectors/massachusetts-retailer-surfaces.mjs';

const observations = [];
for (const url of MA_JULIOS_PROBE_URLS) {
  const row = { url, checkedAt: new Date().toISOString(), status: null, sha256: null, rows: [], error: null };
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000) });
    row.status = response.status;
    if (!response.ok) { await response.body?.cancel(); throw new Error('source_http_failure'); }
    let size = 0;
    const chunks = [];
    if (!response.body) throw new Error('missing_body');
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error('source_size_limit');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    row.sha256 = createHash('sha256').update(body).digest('hex');
    row.rows = parseMassachusettsJulios(body.toString('utf8')).map(product => ({
      merchantId: product.merchantId, productId: product.productId, variantId: product.variantId,
      title: product.title, productUrl: product.productUrl, price: product.price,
      premisesVerified: product.premisesVerified, pickupOfferVerified: product.pickupOfferVerified,
      quantityIsExact: false,
    }));
  } catch { row.error = 'public_source_request_or_parse_failed'; }
  observations.push(row);
}
const runnerReachable = observations.every(row => row.status === 200 && !row.error);
const positivePickupRows = observations.reduce((sum, row) => sum + row.rows.length, 0);
await mkdir('engine/out/ma-source-preflight', { recursive: true });
await writeFile('engine/out/ma-source-preflight/julios.json', JSON.stringify({
  schemaVersion: 1, state: 'MA', generatedAt: new Date().toISOString(),
  headSha: process.env.GITHUB_SHA || null, workflowRunId: process.env.GITHUB_RUN_ID || null,
  runnerReachable, positivePickupRows, inventoryEvidence: false, promotionEligible: false,
  limits: ['Research preflight only. State integration and promotion evidence remain required.'], observations,
}, null, 2));
console.log(JSON.stringify({ runnerReachable, positivePickupRows, inventoryEvidence: false }));
if (!runnerReachable || !positivePickupRows) process.exitCode = 1;

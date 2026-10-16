import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Research only. These fixed public GETs cannot publish inventory or promote MA.
export const SOURCE_URLS = Object.freeze([
  'https://norfolkwineandspirits.com/contact-us/',
  'https://norfolkwineandspirits.com/in-store-and-curbside-pickup/',
  'https://norfolkwineandspirits.com/wp-json/wc/store/v1/products/12051',
  'https://norfolkwineandspirits.com/shop/elijah-craig-small-batch/',
]);
const MAX_BYTES = 2_000_000;

export async function probeMassachusettsSource({ fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const observations = [];
  for (const url of SOURCE_URLS) {
    const observation = { url, checkedAt: now(), status: null, sha256: null, bytes: 0, product: null, error: null };
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000) });
      observation.status = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`public_source_http_${response.status}`);
      }
      if (!response.body) throw new Error('missing_response_body');
      const chunks = [];
      for await (const chunk of response.body) {
        observation.bytes += chunk.length;
        if (observation.bytes > MAX_BYTES) throw new Error('response_size_limit');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      observation.sha256 = createHash('sha256').update(body).digest('hex');
      if (url.includes('/wp-json/')) {
        const product = JSON.parse(body.toString('utf8'));
        if (product.id !== 12051 || product.permalink !== SOURCE_URLS[3]) throw new Error('unexpected_product_identity');
        observation.product = {
          id: product.id, name: String(product.name || '').slice(0, 200), permalink: product.permalink,
          isInStock: product.is_in_stock === true, isPurchasable: product.is_purchasable === true,
          isOnBackorder: product.is_on_backorder !== false,
          price: typeof product.prices?.price === 'string' ? product.prices.price.slice(0, 20) : null,
          currency: typeof product.prices?.currency_code === 'string' ? product.prices.currency_code.slice(0, 10) : null,
        };
      }
    } catch (error) {
      // Fixed vocabulary only: never copy headers, cookies or server response text into the artifact.
      observation.error = /^(public_source_http_\d{3}|missing_response_body|response_size_limit|unexpected_product_identity)$/.test(error.message)
        ? error.message : 'public_source_request_or_parse_failed';
    }
    observations.push(observation);
  }
  return {
    schemaVersion: 1, state: 'MA', source: 'Norfolk Wine & Spirits', generatedAt: now(),
    runnerReachable: observations.every(row => row.status === 200 && row.error === null),
    inventoryEvidence: false, promotionEligible: false,
    limits: ['Reachability and catalog flags require review against exact-store pickup semantics before integration.'],
    observations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await probeMassachusettsSource();
  const output = path.resolve('engine/out/ma-source-preflight/evidence.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ ...result, workflowRunId: process.env.GITHUB_RUN_ID || null,
    headSha: process.env.GITHUB_SHA || null }, null, 2)}\n`);
  console.log(JSON.stringify({ runnerReachable: result.runnerReachable, inventoryEvidence: false, output }));
  if (!result.runnerReachable) process.exitCode = 1;
}

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BourbonBible } from './core/bible.mjs';
import { fetchCollectionResponse, readBoundedCollectionBody } from './core/collection-http.mjs';
import { NEW_YORK_RETAILER_SOURCES, parseMetroCityHiveHtml } from './collectors/metro-retailer-surfaces.mjs';
import { collectBuffaloCityHiveRows } from './collectors/buffalo-cityhive-discovery.mjs';
import { cityHiveSafeBottleMatch } from './collectors/precision-probes.mjs';

const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = path.resolve(outputArg?.slice('--output='.length) || 'out/evidence/NY-buffalo-depth-live-proof.json');
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const sources = NEW_YORK_RETAILER_SOURCES.filter((source) => source.area === 'Buffalo' && source.depthDiscovery);

function summarize(rows) {
  const matches = rows.flatMap((row) => {
    const { match, record } = cityHiveSafeBottleMatch(row.title, bible);
    return record && Number(match?.confidence) >= 0.72 ? [{ row, match, record }] : [];
  });
  const tierCounts = Object.fromEntries([...new Set(matches.map(({ record }) => record.tier))].sort().map((tier) => [tier, matches.filter(({ record }) => record.tier === tier).length]));
  return {
    uniquePositiveVariants: rows.length,
    canonicalRelevantMatches: matches.length,
    tierCounts,
    bottles: [...new Map(matches.map(({ row, record }) => [`${record.id}:${row.variantId}`, {
      canonicalBottleId: record.id,
      canonicalName: record.canonical,
      tier: record.tier,
      rawName: row.title,
      productUrl: row.productUrl,
      merchantId: row.merchantId,
      variantId: row.variantId,
    }])).values()],
  };
}

const storeResults = [];
for (const source of sources) {
  const responses = [];
  let baselineHtml = null;
  const fetchText = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10_000);
    const signal = AbortSignal.any([controller.signal, options.signal].filter(Boolean));
    try {
      const fetched = await fetchCollectionResponse(url, {
        reviewedSeedUrls: [source.baseUrl],
        maxRedirects: 3,
        headers: { 'user-agent': 'Mozilla/5.0 (BourbonSignal Buffalo depth verification)', accept: 'text/html,*/*' },
        signal,
      });
      const body = await readBoundedCollectionBody(fetched.response, { maxBytes: options.maxBytes, signal });
      const text = body.toString('utf8');
      baselineHtml ??= text;
      responses.push({
        url: fetched.url,
        status: fetched.response.status,
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      });
      return { ok: fetched.response.ok, status: fetched.response.status, url: fetched.url, text, error: null };
    } catch (error) {
      return { ok: false, status: 0, url, text: '', error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  };

  const startedAt = Date.now();
  try {
    const improved = await collectBuffaloCityHiveRows(source, { fetchText, parseHtml: parseMetroCityHiveHtml });
    const baselineRows = parseMetroCityHiveHtml(baselineHtml, source);
    const baseline = summarize(baselineRows);
    const improvedSummary = summarize(improved.rows);
    const baselineKeys = new Set(baseline.bottles.map((bottle) => `${bottle.canonicalBottleId}:${bottle.variantId}`));
    storeResults.push({
      sourceId: source.id,
      storeName: source.stores[0].name,
      merchantId: source.stores[0].merchantId,
      status: 'success',
      requestCount: improved.metadata.requestCount,
      elapsedMs: Date.now() - startedAt,
      baseline,
      improved: improvedSummary,
      extraCanonicalBottles: improvedSummary.bottles.filter((bottle) => !baselineKeys.has(`${bottle.canonicalBottleId}:${bottle.variantId}`)),
      completeSnapshot: improved.metadata.completeSnapshot,
      stoppedReason: improved.metadata.stoppedReason,
      optionalFailures: improved.metadata.optionalFailures,
      responseEvidence: responses,
    });
  } catch (error) {
    storeResults.push({
      sourceId: source.id,
      storeName: source.stores[0].name,
      merchantId: source.stores[0].merchantId,
      status: 'failed',
      requestCount: responses.length,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      responseEvidence: responses,
    });
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  proofKind: 'production-compatible unauthenticated first-party Buffalo CityHive comparison',
  syntheticDataUsed: false,
  complete: storeResults.every((result) => result.status === 'success'),
  stores: storeResults,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputPath, complete: report.complete, stores: storeResults.map(({ sourceId, status, requestCount, elapsedMs }) => ({ sourceId, status, requestCount, elapsedMs })) }, null, 2));
if (!report.complete) process.exitCode = 1;

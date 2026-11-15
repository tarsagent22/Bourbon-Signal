import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CENTRAL_CITYHIVE_RESEARCH_SOURCES } from './collectors/central-cityhive-research-premises.mjs';
import { parseCentralCityHiveInventory } from './collectors/central-cityhive-expansion.mjs';
import { centralCityHiveAllocatedQueryFilter } from './collectors/central-cityhive-market-policy.mjs';
import { isCentralCityHiveResearchInventory } from './central-cityhive-policy.mjs';
import { BourbonBible } from './core/bible.mjs';
import { withResearchLifecycle } from './research-state-registry.mjs';
import { libraryIdentityKey } from './core/library-catalog.mjs';
import { librarySearchPool } from './library-query-plan.mjs';
import { matchesNorthDakotaGroceryLocator, parseNorthDakotaGrocerySearch } from './research-north-dakota-runtime.mjs';
import { isNorthDakotaGroceryResearchInventory, williston } from './north-dakota-retail-policy.mjs';

const maxAgeMs = 2 * 60 * 60_000;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const rock = CENTRAL_CITYHIVE_RESEARCH_SOURCES.find(source => source.state === 'ND');
const productKey = row => [row.storeId, row.merchantId, row.productId, row.variantId, row.canonicalBottleId,
  row.canonicalName, row.rawName, row.tier, row.price, row.sourceUrl, row.observedAt];
const identities = rows => rows.map(row => JSON.stringify(productKey(row))).sort();

function canonicalSourceUrl(value) {
  const url = new URL(value);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.hash);
  url.searchParams.sort();
  return url.href;
}

function verifyOrigin(report, provenance, bible) {
  const origin = report.metadata?.origin;
  assert.equal(report.state, 'ND');
  assert.equal(report.status, 'useful');
  assert.equal(report.stale, false);
  assert.equal(report.metadata.complete, true);
  assert.equal(report.metadata.shadowOnly, true);
  assert.equal(report.metadata.productionActivationAllowed, false);
  assert.equal(report.metadata.customerDeliveryAllowed, false);
  assert.equal(provenance.status, 'verified_github_shadow_artifact');
  assert.equal(provenance.state, 'ND');
  assert.equal(provenance.repository, 'tarsagent22/Bourbon-Signal');
  assert.match(provenance.artifactId, /^\d+$/);
  assert.match(provenance.artifactDigest, /^[a-f0-9]{64}$/);
  assert.match(provenance.headSha, /^[a-f0-9]{40}$/);
  assert.equal(origin.kind, 'github_actions');
  assert.equal(origin.repository, provenance.repository);
  assert.equal(origin.workflowRunId, provenance.workflowRunId);
  assert.equal(origin.commitSha, provenance.headSha);
  assert.equal(report.metadata.bibleRecordsSha256, sha256(JSON.stringify(bible.records)));
  assert.deepEqual(report.metadata.verifiedPremises, [rock.storeId, williston.storeId]);
}

async function readReceipts(reportDirectory, receipts, report, nowMs) {
  const paths = new Set(), urls = new Set();
  const start = Date.parse(report.startedAt), finish = Date.parse(report.finishedAt);
  assert.ok(start <= finish && finish <= nowMs && nowMs - start <= maxAgeMs);
  return Promise.all(receipts.map(async receipt => {
    assert.equal(receipt.status, 200);
    const url = canonicalSourceUrl(receipt.url);
    assert.equal(url, canonicalSourceUrl(receipt.finalUrl));
    assert.ok(!urls.has(url));
    urls.add(url);
    assert.match(receipt.artifactPath, /^source-captures\/[a-z0-9-]+\.(?:html|json)$/);
    assert.ok(!paths.has(receipt.artifactPath));
    paths.add(receipt.artifactPath);
    const observed = Date.parse(receipt.observedAt);
    assert.ok(start <= observed && observed <= finish && nowMs - observed <= maxAgeMs);
    assert.ok(receipt.bytes > 0 && receipt.bytes <= 4 * 1024 * 1024);
    const bytes = await readFile(path.join(reportDirectory, receipt.artifactPath));
    assert.equal(bytes.length, receipt.bytes);
    assert.equal(sha256(bytes), receipt.sha256);
    return bytes.toString('utf8');
  }));
}

function isMerchantSearch(url, source) {
  return url.origin === source.baseUrl && url.pathname === '/shop/'
    && url.searchParams.get('merchant-id') === source.merchantId
    && url.searchParams.has('ch-query') && [...url.searchParams].length === 2;
}

function isInStoreSearch(url, term) {
  return url.origin === 'https://www.albertsons.com' && url.pathname === '/abs/pub/xapi/search/substitute'
    && url.searchParams.get('storeid') === '28' && url.searchParams.get('q') === term
    && url.searchParams.get('channel') === 'instore' && url.searchParams.get('banner') === 'albertsons'
    && url.searchParams.get('start') === '0' && url.searchParams.get('rows') === '100';
}

export async function prepareNorthDakotaCanary({ report, reportDirectory, bible, provenance, nowMs = Date.now() }) {
  verifyOrigin(report, provenance, bible);
  const { cityHive, grocery, receipts } = report.metadata;
  assert.equal(cityHive.complete, true);
  assert.equal(cityHive.receipts.length, 2);
  assert.equal(grocery.receipts.length, 3);
  assert.equal(cityHive.requests.length, 2);
  assert.deepEqual(receipts, [...cityHive.receipts, ...grocery.receipts]);
  const [rockBroad, rockIndexed, locatorBody, willistonBroad, willistonIndexed] =
    await readReceipts(reportDirectory, receipts, report, nowMs);
  const allowedQuery = centralCityHiveAllocatedQueryFilter(bible, 'ND');
  const indexed = new Set(librarySearchPool(bible).filter(allowedQuery).map(libraryIdentityKey));
  const rockClock = cityHive.sourceAttempts[rock.id]?.lastAttemptAt;
  const rockObservedMs = Date.parse(rockClock);
  assert.ok(Date.parse(report.startedAt) <= rockObservedMs && rockObservedMs <= Date.parse(receipts[0].observedAt));
  const rockRows = new Map();
  for (const [i, body] of [rockBroad, rockIndexed].entries()) {
    const receipt = receipts[i], url = new URL(receipt.url);
    const request = cityHive.requests[i];
    assert.equal(request.url, receipt.url);
    assert.equal(request.sourceId, rock.id);
    assert.equal(request.ok, true);
    assert.equal(request.status, 200);
    assert.ok(isMerchantSearch(url, rock));
    const term = url.searchParams.get('ch-query');
    assert.ok(i === 0 ? term === 'bourbon' : indexed.has(libraryIdentityKey(term)));
    let verifiedPremise = false;
    const rows = parseCentralCityHiveInventory(body, rock, bible, {
      observedAt: rockClock,
      onVerifiedPremise() { verifiedPremise = true; },
    });
    assert.equal(verifiedPremise, true);
    for (const row of rows) if (!rockRows.has(row.id)) rockRows.set(row.id, row);
  }
  assert.equal(receipts[2].term, null);
  assert.equal(receipts[2].storeId, williston.storeId);
  assert.equal(receipts[2].url, williston.locator);
  assert.equal(matchesNorthDakotaGroceryLocator(locatorBody), true);
  const groceryRows = new Map();
  const unconfirmed = [];
  assert.equal(grocery.plan.terms.length, 1);
  assert.ok(indexed.has(libraryIdentityKey(grocery.plan.terms[0])));
  for (const [i, body] of [willistonBroad, willistonIndexed].entries()) {
    const receipt = receipts[i + 3];
    const term = i === 0 ? 'bourbon' : grocery.plan.terms[0].toLowerCase();
    assert.equal(receipt.storeId, williston.storeId);
    assert.equal(receipt.term, term);
    assert.ok(isInStoreSearch(new URL(receipt.url), term));
    const result = parseNorthDakotaGrocerySearch(JSON.parse(body), term, bible, receipt.observedAt);
    if (!result.confirmed) unconfirmed.push(term);
    for (const row of result.signals) if (!groceryRows.has(row.id)) groceryRows.set(row.id, row);
  }
  const combined = [...rockRows.values(), ...groceryRows.values()];
  assert.equal(combined.length, new Set(combined.map(row => row.id)).size);
  assert.deepEqual(unconfirmed, grocery.unconfirmedQueries);
  assert.deepEqual(identities(combined), identities(report.signals));
  assert.ok(report.signals.every(row => isCentralCityHiveResearchInventory(row, {nowMs})
    || isNorthDakotaGroceryResearchInventory(row)));
  assert.ok(rockRows.size > 0 && groceryRows.size > 0, 'ND preview requires a current exact result in both reviewed cities');
  const silent = { alertable: false, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForWatch: false,
    eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false };
  const drops = combined.map(row => ({ ...row, ...silent, type: row.eventType, previewOnly: true,
    source: row.sourceLabel, bottleName: row.canonicalName, timestamp: row.observedAt, lastConfirmedAt: row.observedAt,
    eligibleForOnSite: true, eligibleForDropFeed: true,
    sourceRuntimeId: row.sourceRuntimeId ?? `research:nd:${rock.id}`,
    sourceProductBinding: { ...row.sourceProductBinding, shadowOnly: true }, raw: { ...row.raw, shadowOnly: true } }));
  const locations = [rock, williston].map(source => ({ state: 'ND', id: source.storeId, storeId: source.storeId,
    name: source.name, address: source.address, city: source.city, zip: source.zip, lat: source.lat, lng: source.lng,
    type: 'store', locationType: 'store', source: source.sourceLabel, precision: 'store_level', searchable: true,
    collectorAttached: true, hasSignals: true }));
  return { schemaVersion: 1, state: 'ND', generatedAt: report.finishedAt, scope: 'isolated_canary_input_no_production_activation',
    sourceFamily: 'north_dakota_retail', workflowSource: provenance, sourceReceipts: receipts,
    originalSourceClockPreserved: true, allDeliveryDisabled: true, drops, locations };
}

async function main() {
  const argument = flag => process.argv.find(value => value.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const artifact = argument('--artifact-dir'), proofFile = argument('--provenance');
  const out = 'data/canary-inputs/ND.json';
  const configOut = 'out/canary-preparation/ND/lifecycle-research.json';
  assert.ok(artifact && proofFile, 'Use --artifact-dir and --provenance from the verified North Dakota shadow download');
  const provenance = JSON.parse(await readFile(proofFile));
  const reports = (await readdir(path.resolve(artifact), { recursive: true })).filter(file => path.basename(file) === 'report.json');
  const matches = [];
  for (const file of reports) {
    const filename = path.resolve(artifact, file), report = JSON.parse(await readFile(filename));
    if (report.state === 'ND' && report.metadata?.origin?.workflowRunId === provenance.workflowRunId) {
      matches.push({ report, reportDirectory: path.dirname(filename) });
    }
  }
  assert.equal(matches.length, 1, 'Expected one matching workflow-issued North Dakota report');
  const candidate = await prepareNorthDakotaCanary({ ...matches[0], provenance, bible: await BourbonBible.load() });
  const lifecycle = withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json')));
  assert.ok(!lifecycle.activeStates.includes('ND') && lifecycle.states.ND.publicStatus === 'research_only');
  for (const [file, value] of [[out, candidate], [configOut, lifecycle]]) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  }
  console.log(JSON.stringify({ state: 'ND', rows: candidate.drops.length, stores: candidate.locations.length,
    sourceRun: provenance.workflowRunId, productionActivationAllowed: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
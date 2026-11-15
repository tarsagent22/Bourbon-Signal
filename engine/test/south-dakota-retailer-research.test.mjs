import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSouthDakotaResearch, reviewSouthDakotaPickup, southDakotaResearchSource } from '../src/research-south-dakota-retailer.mjs';
import { sources, storeId, fullAddress, southDakotaRetailerRequest } from '../src/south-dakota-pickup-policy.mjs';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'south-dakota-sante');
const fixtures = new Map([
  ['Wild Turkey', 'west.json'],
  ['Heaven Hill', 'south-heaven-hill.json'],
  ['Larceny', 'south-larceny.json'],
]);
const expressions = [
  ['Wild Turkey 101 8Y .75l', 'limited'],
  ['Heaven Hill Bottled-in-Bond 7 Year', 'limited'],
  ['Larceny Barrel Proof', 'limited'],
];

function exactBible() {
  const records = expressions.map(([canonical, tier], index) => ({
    id: `sd-test-${index}`, canonical, libraryAlertEligible: true,
    libraryIdentities: [{ id: `sd-test-${index}`, canonicalName: canonical, aliases: [], isAlertEligible: true, nationalTier: tier }],
  }));
  const byName = new Map(records.map(record => [record.canonical, record]));
  return { records, match: name => byName.has(name) ? { record: byName.get(name), confidence: 1 } : null };
}

async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bs-sd-research-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('retained Sante captures replay three exact binary pickup rows at two Rapid City premises', async () => {
  const bible = exactBible();
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceRun.workflowRunId, '43622872651');
  assert.equal(manifest.sourceRun.commitSha, '2810e125021ce0b400c8940d4f78b414ac087d23');
  const parsed = [];
  for (const source of sources) for (const term of source.terms) {
    const receipt = manifest.requests.find(row => row.query === term);
    const file = fixtures.get(term);
    assert.ok(receipt && file, `fixture receipt for ${term}`);
    assert.equal(receipt.storeId, storeId(source));
    assert.equal(receipt.status, 200);
    const raw = await readFile(path.join(fixtureRoot, file));
    assert.equal(createHash('sha256').update(raw).digest('hex'), receipt.retainedCaptureSha256);
    const payload = JSON.parse(raw.toString('utf8'));
    const rowSet = reviewSouthDakotaPickup(payload, source.id, bible, receipt.observedAt, southDakotaRetailerRequest(term));
    assert.ok(rowSet);
    parsed.push(...rowSet.signals);
  }
  assert.equal(parsed.length, 3);
  assert.equal(new Set(parsed.map(row => row.storeId)).size, 2);
  assert.deepEqual(new Set(parsed.map(row => row.city)), new Set(['Rapid City']));
  assert.equal(southDakotaResearchSource('SD').active, false);
  assert.ok(parsed.every(row => row.quantity === 0 && row.quantityIsExact === false
    && row.quantitySemantics === 'binary_retailer_orderable_no_exact_count'
    && row.sourceProductBinding.availableToOrder > 0 && row.canAlertAsInventory === false));
  assert.deepEqual([...new Set(parsed.map(row => row.storeAddress))].sort(), [
    '3609 Sturgis Road, Rapid City, SD 57702', '5312 Black Hills Blvd, Rapid City, SD 57701',
  ].sort());
  assert.deepEqual(parsed.map(row => row.observedAt).sort(), manifest.requests.map(row => row.observedAt).sort());
});

test('South Dakota collector replays retained receipts offline with real report clocks and silent rows', async t => {
  const dir = await temporary(t);
  const attemptFile = path.join(dir, 'attempts.json');
  const reportDirectory = path.join(dir, 'report');
  const bible = exactBible();
  let tick = Date.parse('2026-11-14T17:46:00.000Z');
  const now = () => tick++;
  const calls = [];
  const report = await collectSouthDakotaResearch(southDakotaResearchSource('SD'), bible, {
    env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, attemptsFile: attemptFile, reportDirectory, now, sleep: async () => {},
    fetchText: async (url, options) => {
      const input = JSON.parse(new URL(url).searchParams.get('input'));
      const reviewedTerm = input['2'].json.text;
      assert.ok(reviewedTerm, 'query is from the reviewed source registry');
      calls.push(reviewedTerm);
      const body = await readFile(path.join(fixtureRoot, fixtures.get(reviewedTerm)), 'utf8');
      await options.onResponse({ status: 200, retryAfterSeconds: 0 });
      return { status: 200, url, text: body };
    },
  });
  assert.deepEqual(calls, ['Wild Turkey', 'Heaven Hill', 'Larceny']);
  assert.equal(report.metadata.complete, true);
  assert.equal(report.status, 'useful');
  assert.equal(report.signals.length, 3);
  assert.equal(report.metadata.verifiedPremises.length, 2);
  assert.ok(report.signals.every(row => row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && row.sourceProductBinding.shadowOnly === true));
  const ledger = JSON.parse(await readFile(attemptFile, 'utf8'));
  assert.equal(ledger.schemaVersion, 2);
  assert.equal(Date.parse(ledger.nextAllowedAt) - Date.parse(ledger.lastAttemptAt), 30 * 60_000);
  assert.equal(Object.keys(ledger.hosts).length, 0);
});

test('a denied Sante host persists Retry-After plus the minimum and is skipped on later scheduled runs', async t => {
  const dir = await temporary(t);
  const attemptFile = path.join(dir, 'attempts.json');
  let tick = Date.parse('2026-11-14T18:00:00.000Z');
  const now = () => tick;
  let calls = 0;
  const fetchText = async (url, options) => {
    calls++;
    await options.onResponse({ status: 429, retryAfterSeconds: 48 * 60 * 60 });
    return { status: 429, url, text: '' };
  };
  const options = { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, attemptsFile: attemptFile, now, sleep: async () => {}, fetchText };
  const first = await collectSouthDakotaResearch(southDakotaResearchSource('SD'), exactBible(), options);
  assert.equal(first.signals.length, 0);
  assert.equal(calls, 1);
  assert.equal(first.roadblocks[0].status, 429);
  let ledger = JSON.parse(await readFile(attemptFile, 'utf8'));
  const host = new URL('https://www.mrliquor.com').hostname;
  assert.equal(ledger.hosts[host].httpStatus, 429);
  assert.equal(Date.parse(ledger.hosts[host].nextAllowedAt) - Date.parse(ledger.hosts[host].lastAttemptAt), 48 * 60 * 60_000);

  tick += 25 * 60 * 60_000;
  const second = await collectSouthDakotaResearch(southDakotaResearchSource('SD'), exactBible(), options);
  assert.equal(calls, 1, 'the denied host stays quiet while later shadow runs may handle other source hosts');
  assert.ok(second.roadblocks.some(row => row.error === 'source_host_cooldown' && row.status === 429));
  ledger = JSON.parse(await readFile(attemptFile, 'utf8'));
  assert.equal(ledger.hosts[host].nextAllowedAt, '2026-11-16T18:00:00.000Z');
});

test('a 403 without Retry-After still gives the exact retailer host the 24 hour minimum', async t => {
  const dir = await temporary(t);
  const attemptFile = path.join(dir, 'attempts.json');
  const now = () => Date.parse('2026-11-14T19:00:00.000Z');
  const report = await collectSouthDakotaResearch(southDakotaResearchSource('SD'), exactBible(), {
    env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, attemptsFile: attemptFile, now, sleep: async () => {},
    fetchText: async (url, options) => {
      await options.onResponse({ status: 403, retryAfterSeconds: 0 });
      return { status: 403, url, text: '' };
    },
  });
  assert.equal(report.roadblocks[0].status, 403);
  const ledger = JSON.parse(await readFile(attemptFile, 'utf8'));
  const host = new URL('https://www.mrliquor.com').hostname;
  assert.equal(Date.parse(ledger.hosts[host].nextAllowedAt) - Date.parse(ledger.hosts[host].lastAttemptAt), 24 * 60 * 60_000);
});

test('a malformed persisted South Dakota cooldown ledger stops before HTTP', async t => {
  const dir = await temporary(t);
  const attemptsFile = path.join(dir, 'attempts.json');
  await writeFile(attemptsFile, 'null');
  let calls = 0;
  await assert.rejects(collectSouthDakotaResearch(southDakotaResearchSource('SD'), exactBible(), {
    env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, attemptsFile,
    fetchText: async () => { calls++; throw Error('must not issue HTTP'); },
  }), /journal must be an object/);
  assert.equal(calls, 0);
});

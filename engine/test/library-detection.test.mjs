import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BourbonBible } from '../src/core/bible.mjs';
import { normalizeLibraryCatalog, integrateLibraryCatalog, readLibraryCatalog, catalogDigest, isLibraryDetectionTarget } from '../src/core/library-catalog.mjs';
import { cityHiveSafeBottleMatch } from '../src/collectors/safe-bottle-match.mjs';
import { buildLibraryCoverageAudit, isLibraryObservation, US_STATES } from '../src/library-coverage-audit.mjs';
import { libraryDetectionQueries } from '../src/library-query-plan.mjs';
import { arizonaXapiRequestPlan, parseArizonaXapiInventory } from '../src/collectors/arizona-xapi.mjs';
import { bibleLookup, publicSignal } from '../src/export-site-contract.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';

const bottle = (id, name, extra = {}) => ({ id, canonicalName: name, aliases: [name], nationalTier: 'allocated', stateOverrides: [], ...extra });
const nowMs = Date.parse('2026-10-25T18:00:00Z');

test('every static scarce library canonical name safely matches, including ages and separate Taylor expressions', async () => {
  const bible = await BourbonBible.load();
  const library = normalizeLibraryCatalog(JSON.parse(await readFile(new URL('../../src/data/drop-feed-classification.generated.json', import.meta.url))));
  const targets = library.filter(isLibraryDetectionTarget);
  assert(targets.length > 200);
  for (const entry of targets) assert(cityHiveSafeBottleMatch(entry.canonicalName, bible).record, entry.canonicalName);
  assert.equal(bible.match('1792 12 Year 750ml').record.canonical, '1792 12 Year');
  assert.notEqual(bible.match('E.H. Taylor Single Barrel').record.id, bible.match('E.H. Taylor Small Batch').record.id);
  assert.notEqual(bible.match('1792 12 Year').record.id, bible.match('1792 Full Proof').record.id);
  assert.equal(bible.match('Old Fitzgerald 7yr Bottled In Bond').record.canonical, 'Old Fitzgerald 7Y Bottled in Bond');
});

test('new identities never enter legacy containment; ambiguous aliases and unknown editions fail closed', () => {
  const entries = [bottle('twelve', 'Example Whiskey 12 Year'), bottle('fifteen', 'Example Whiskey 15 Year'),
    bottle('rye', 'Example Rye', { aliases: ['ambiguous example'] }), bottle('bourbon', 'Example Bourbon', { aliases: ['ambiguous example'] })];
  const bible = new BourbonBible(integrateLibraryCatalog([], { records: entries }));
  assert.equal(bible.match('Example Whiskey'), null);
  assert.equal(bible.match('Example Whiskey 13 Year'), null);
  assert.equal(bible.match('Example Whiskey 12 Year 2027 Release'), null);
  assert.equal(bible.match('ambiguous example'), null);
  assert.equal(bible.match('Example Whiskey 12Y 750ml').record.id, 'twelve');
  assert.equal(bible.scanText('Example Whiskey 12 Year release announcement').length, 0, 'No new substring-based page claims');
  const exported = publicSignal({ state: 'NC', type: 'inventory', rawName: 'Example Whiskey 13 Year', observedAt: new Date(nowMs).toISOString() }, bibleLookup(bible.records));
  assert.notEqual(exported.canonicalId, 'twelve', 'Exporter must not restore lossy matches rejected by the shared matcher');
});

test('library ingestion validates completeness, identities, age and digest; stale live sync cannot silently fall back', async () => {
  const records = normalizeLibraryCatalog({ bottles: [bottle('twelve', 'Example 12 Year')] });
  assert.throws(() => normalizeLibraryCatalog({ records: [...records, ...records] }), /duplicate/);
  assert.throws(() => normalizeLibraryCatalog({ records: [{ ...records[0], nationalTier: 'unknown' }] }), /Invalid/);
  const dir = await mkdtemp(path.join(tmpdir(), 'library-sync-'));
  const file = path.join(dir, 'live.json');
  const write = snapshot => writeFile(file, JSON.stringify(snapshot));
  const snapshot = { schemaVersion: 1, fetchedAt: new Date(nowMs).toISOString(), source: 'fixture', records, digest: catalogDigest(records) };
  try {
    await write(snapshot);
    assert.equal((await readLibraryCatalog({ liveFile: file, nowMs })).records.length, 1);
    await assert.rejects(readLibraryCatalog({ liveFile: file, nowMs: nowMs + 3_600_001 }), /stale or corrupt/);
    await write({ ...snapshot, digest: 'wrong' });
    await assert.rejects(readLibraryCatalog({ liveFile: file, nowMs }), /stale or corrupt/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('production selects the live catalog for every subprocess rebuild, while offline builds remain deterministic', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const jobEnvironment = workflow.slice(0, workflow.indexOf('    steps:'));
  assert.match(jobEnvironment, /BOURBON_SIGNAL_LIBRARY_CATALOG_FILE:.*github\.workspace.*\/engine\/out\/library-catalog\.json/);
  assert(workflow.indexOf('- name: Synchronize the full customer bottle library') < workflow.indexOf('- name: Verify deterministic customer-surface regressions'));
  const root = await mkdtemp(path.join(tmpdir(), 'library-rebuild-'));
  const engine = path.join(root, 'engine');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(engine, { recursive: true });
  await mkdir(path.join(root, 'src/data'), { recursive: true });
  const records = normalizeLibraryCatalog({ records: [bottle('offline', 'Offline Example 12 Year'), bottle('approved', 'Approved Example 15 Year')] });
  const liveFile = path.join(root, 'live-library.json');
  const env = { ...process.env };
  delete env.BOURBON_SIGNAL_LIBRARY_CATALOG_FILE;
  const build = selectedEnv => {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../src/build-bible.mjs', import.meta.url))], { cwd: engine, env: selectedEnv, encoding: 'utf8', windowsHide: true });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    return readFile(path.join(engine, 'out/bourbon-bible.json'), 'utf8').then(JSON.parse);
  };
  try {
    await writeFile(path.join(root, 'src/data/drop-feed-classification.generated.json'), JSON.stringify({ records: records.slice(0, 1) }));
    await writeFile(liveFile, JSON.stringify({ schemaVersion: 1, source: 'fixture', fetchedAt: new Date().toISOString(), records, digest: catalogDigest(records) }));
    const selectedEnv = { ...env, BOURBON_SIGNAL_LIBRARY_CATALOG_FILE: liveFile };
    for (let rebuild = 0; rebuild < 2; rebuild++) {
      const payload = await build(selectedEnv);
      assert.equal(payload.libraryCatalog.digest, catalogDigest(records));
      assert.equal(payload.libraryCatalog.mode, 'live');
      assert.equal(payload.records.length, 2);
    }
    const offline = await build(env);
    assert.equal(offline.libraryCatalog.mode, 'static');
    assert.equal(offline.records.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('syncing a library identity cannot enable alerts explicitly disabled in its library record', () => {
  const entries = [bottle('disabled', 'Example Allocated Bourbon', { isAlertEligible: false })];
  const bible = new BourbonBible(integrateLibraryCatalog([], { records: entries }));
  const signal = { state: 'AZ', eventType: 'retailer_store_inventory_result', canonicalBottleId: 'disabled', canonicalName: 'Example Allocated Bourbon', rawName: 'Example Allocated Bourbon', canAlertAsInventory: true, canAlertAsWatch: true };
  const canonical = canonicalizeSignal(signal, bible);
  assert.equal(canonical.canAlertAsInventory, false);
  assert.equal(canonical.canAlertAsWatch, false);
  const exported = publicSignal(signal, bibleLookup(bible.records));
  assert.equal(exported.canAlertAsInventory, false);
  assert.equal(exported.canAlertAsWatch, false);
});

test('all-state audit separates unsupported, source observations, freshness, publishing and inventory alert permission', () => {
  const records = [bottle('example', 'Example 12 Year')];
  const catalog = { records, digest: catalogDigest(records) };
  const bible = { records: integrateLibraryCatalog([], catalog), libraryCatalog: { digest: catalog.digest, mode: 'live' } };
  const observedAt = new Date(nowMs).toISOString();
  const reports = { AZ: { startedAt: observedAt, finishedAt: observedAt, signals: [{ canonicalBottleId: 'example', observedAt }], precisionMetadata: { xapi: { requests: [{ kind: 'inventory', term: 'Example 12 Year', ok: true, requestedAt:observedAt }] } } } };
  const audit = buildLibraryCoverageAudit({ bible, catalog, reports, nowMs });
  assert.equal(US_STATES.length, 50);
  assert.equal(new Set(US_STATES).size, 50);
  assert.equal(audit.cells.length, 51);
  const az = audit.cells.find(row => row.state === 'AZ');
  assert.equal(az.exactMatch, true); assert.equal(az.freshSourceRows, 1); assert.equal(az.freshPublicRows, 0);
  assert.equal(az.searchedExactExpressionThisRun, true); assert.equal(az.status, 'no_fresh_public_evidence');
  assert.equal(audit.cells.find(row => row.state === 'AK').status, 'unsupported');
  assert.equal(audit.cells.find(row => row.state === 'MD').evidenceClass, 'montgomery_county_only_separate_row');
  assert.equal(audit.cells.find(row => row.state === 'IA').stateInventoryAlertsPermitted, false);
  const stale = buildLibraryCoverageAudit({ bible, catalog, reports, nowMs: nowMs + 3 * 3_600_000 });
  assert.equal(stale.cells.find(row => row.state === 'AZ').freshSourceRows, 0);
  assert.equal(stale.cells.find(row => row.state === 'AZ').searchedExactExpressionThisRun, false);
  reports.AZ.stale = true;
  assert.equal(buildLibraryCoverageAudit({ bible, catalog, reports, nowMs }).cells.find(row => row.state === 'AZ').freshSourceRows, 0);
  assert(audit.states.every(row => row.exhaustiveDetectionVerified === false));
  assert.throws(() => buildLibraryCoverageAudit({ bible, catalog: { ...catalog, digest: 'wrong' } }), /differs/);
});

test('audit traces source-named public rows to the same exact store/product, never another premise', () => {
  const record = { id: 'library-example', canonical: 'Example 12 Year' };
  const source = { canonicalBottleId: record.id, storeId: 'safeway:209', sourceUrl: 'https://example.test/product-1', rawName: 'Retailer Example 12 Year' };
  const index = new Map([[JSON.stringify([source.storeId, source.sourceUrl, source.rawName]), source]]);
  const published = { ...source, canonicalBottleId: 'source-display-hash', canonicalId: 'source-display-hash' };
  assert.equal(isLibraryObservation(published, record, index), true);
  assert.equal(isLibraryObservation({ ...published, storeId: 'safeway:210' }, record, index), false);
  assert.equal(isLibraryObservation({ ...published, sourceUrl: 'https://example.test/product-2' }, record, index), false);
});

test('Arizona recognizes a library rye without brand-list filtering but still requires exact store and positive channel evidence', () => {
  const records = [bottle('example-rye', 'Example Rare Rye')];
  const bible = new BourbonBible(integrateLibraryCatalog([], { records }));
  const store = { locationId: '209', domainName: 'Safeway', address: { line1: '1 Main St', city: 'Phoenix', state: 'AZ', zipcode: '85001' } };
  const product = { id: '123456', storeId: '209', name: 'Example Rare Rye 750ml', containsAlcohol: true, channelInventory: { instore: '1', instoreItemQty: 2 } };
  const parse = item => parseArizonaXapiInventory({ response: { docs: [item] } }, store, bible, { observedAt: new Date(nowMs).toISOString() });
  assert.equal(parse(product).length, 1);
  assert.equal(parse({ ...product, storeId: '210' }).length, 0);
  assert.equal(parse({ ...product, channelInventory: { instore: '1', instoreItemQty: 0 } }).length, 0);
  assert.equal(parse({ ...product, name: 'Example Rare Rye 50ml' }).length, 0);
  assert.equal(parse({ ...product, name: 'Example Rye' }).length, 0);
  assert.equal(parse({ ...product, containsAlcohol: false }).length, 0);
  assert.deepEqual(libraryDetectionQueries(bible), ['Example Rare Rye']);
  const plan = arizonaXapiRequestPlan([store], { terms: ['bourbon', ...libraryDetectionQueries(bible)], nowMs });
  assert(plan.flatMap(row => row.terms).includes('Example Rare Rye'));
  const legacyOnly = new BourbonBible([{ id: 'legacy-heritage', canonical: "Jack Daniel's Barrel Heritage Barrel Toasted", normalizedKey: 'heritage', aliases: ['Jack Daniels Heritage'], tier: 'limited' }]);
  const vague = parseArizonaXapiInventory({ response: { docs: [{ ...product, name: 'Jack Daniels Heritage 750ml' }] } }, store, legacyOnly, { observedAt: new Date(nowMs).toISOString() });
  assert.equal(vague.length, 0, 'A newly admitted brand must not inherit a specific expression through old family aliases');
});

test('the expanded Arizona query rotation reaches the whole library pool and each store without increasing the daily cap', () => {
  const stores = Array.from({ length: 134 }, (_, index) => ({ locationId: String(5000 + index), domainName: 'Safeway',
    address: { line1: `${index + 1} Main St`, city: `City${index}`, state: 'AZ', zipcode: '85001' } }));
  const terms = Array.from({ length: 235 }, (_, index) => `Example expression ${index}`);
  const seen = new Set();
  for (let day = 0; day < 32; day++) {
    const plan = arizonaXapiRequestPlan(stores, { terms: ['bourbon', ...terms], nowMs: nowMs + day * 86_400_000 });
    assert.equal(plan.flatMap(row => row.terms).length, 150);
    for (const row of plan) if (row.terms[1]) seen.add(row.terms[1]);
  }
  assert.equal(seen.size, terms.length);
  const visits = new Map(stores.slice(0, 7).map(row => [row.locationId, new Set()]));
  for (let day = 0; day < 20; day++) for (const row of arizonaXapiRequestPlan(stores.slice(0, 7), {
    terms: ['bourbon', ...terms.slice(0, 20)], nowMs: nowMs + day * 86_400_000 })) visits.get(row.store.locationId).add(row.terms[1]);
  assert([...visits.values()].every(queries => queries.size === 20));
});

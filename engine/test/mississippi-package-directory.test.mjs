import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectMississippiPackageDirectory,
  importMississippiPackageDirectory,
  parseMississippiTapPage,
  refreshMississippiPackageDirectory,
} from '../src/discovery/mississippi-package-directory.mjs';
import {
  assignMississippiRegion,
  mississippiRegionForLocation,
} from '../src/mississippi-area.mjs';
import {
  buildMississippiSourceAtlas,
  validateMississippiSourceAtlas,
} from '../src/discovery/source-atlas.mjs';

const fixture = (name) => readFile(new URL(`./fixtures/ms/directory/${name}`, import.meta.url), 'utf8');

test('TAP parser extracts public package-retailer rows and a bounded next page', async () => {
  const parsed = parseMississippiTapPage(await fixture('page-1.html'), {
    pageUrl: 'https://tap.dor.ms.gov/_/?permitType=Package%20Retailer&page=1',
  });
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], {
    dba: 'A Liquor Warehouse Inc',
    address: '605 Middleton Rd Winona MS 38967-2021',
    city: 'Winona',
    county: 'Montgomery',
    permitType: 'Package Retailer',
    permitNumber: '046478',
    wholesaler: false,
    status: 'current',
  });
  assert.equal(parsed.nextPageUrl, 'https://tap.dor.ms.gov/_/?permitType=Package%20Retailer&page=2');
});

test('authorized-capture directory importer deduplicates page overlap and binds a response digest', async () => {
  const pages = [
    { url: 'https://tap.dor.ms.gov/_/?permitType=Package%20Retailer&page=1', text: await fixture('page-1.html') },
    { url: 'https://tap.dor.ms.gov/_/?permitType=Package%20Retailer&page=2', text: await fixture('page-2.html') },
  ];
  const result = await collectMississippiPackageDirectory({
    startUrl: pages[0].url,
    expectedCount: 3,
    maxPages: 2,
    authorizedCapture: {
      mode: 'operator_supplied_authorized_capture',
      generatedAt: '2026-07-25T20:00:00.000Z',
      pages,
    },
  });
  assert.equal(result.pageCount, 2);
  assert.equal(result.rowCount, 4);
  assert.equal(result.uniquePermitCount, 3);
  assert.match(result.responseDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.sourcePolicy.status, 'source_policy_blocked');
  assert.equal(result.sourcePolicy.autonomousFetchAllowed, false);
  assert.deepEqual(result.rows.map((row) => row.permitNumber), ['029254', '040562', '046478']);
});

test('default TAP live collection fails closed for source policy and makes no request', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('network request must not happen');
  };
  try {
    await assert.rejects(
      collectMississippiPackageDirectory({ expectedCount: 690 }),
      (error) => error?.code === 'source_policy_blocked' && /robots\.txt|source policy/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests, 0);
});

test('directory refresh rejects shrink/partial captures and preserves last-good atomically', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-ms-directory-'));
  const lastGoodPath = path.join(directory, 'last-good.json');
  const outputPath = path.join(directory, 'current.json');
  const lastGood = { uniquePermitCount: 690, responseDigest: 'last-good-digest', rows: [{ permitNumber: '999999' }] };
  await writeFile(lastGoodPath, `${JSON.stringify(lastGood)}\n`);
  await assert.rejects(
    refreshMississippiPackageDirectory({
      lastGoodPath,
      outputPath,
      expectedCount: 690,
      collect: async () => ({
        pageCount: 1,
        rowCount: 2,
        uniquePermitCount: 2,
        responseDigest: 'partial',
        rows: [{ permitNumber: '000001' }, { permitNumber: '000002' }],
      }),
    }),
    /expected 690|shrink|incomplete/i,
  );
  assert.deepEqual(JSON.parse(await readFile(lastGoodPath, 'utf8')), lastGood);
  await assert.rejects(readFile(outputPath, 'utf8'));
  await rm(directory, { recursive: true, force: true });
});

test('reviewed importer preserves all 690 authoritative capture permits across nine regions', async () => {
  const capture = JSON.parse(await readFile(new URL('../data/source-captures/MS-package-retailers-2026-07-26.json', import.meta.url), 'utf8'));
  const program = JSON.parse(await readFile(new URL('../../src/config/mississippi-program.json', import.meta.url), 'utf8'));
  const universe = importMississippiPackageDirectory(capture, program);
  assert.equal(universe.reviewedCurrentPermitCount, 690);
  assert.equal(universe.stores.length, 690);
  assert.equal(new Set(universe.stores.map((store) => store.id)).size, 690);
  assert.ok(universe.stores.every((store) => store.id === `ms-permit-${store.permitNumber}`));
  assert.ok(universe.stores.every((store) => program.regions.some((region) => region.id === store.regionId)));
  assert.deepEqual(new Set(universe.stores.map((store) => store.regionId)), new Set(program.regions.map((region) => region.id)));
  assert.equal(universe.summary.cityCount, 168);
  assert.equal(universe.summary.countyCount, 78);
  assert.equal(program.officialDirectory.replacementPermitBindings, undefined);
  assert.equal(universe.stores.find((store) => store.address.startsWith('605 MIDDLETON RD')).permitNumber, '046478');
  assert.equal(universe.stores.find((store) => store.address.startsWith('904 GOODMAN RD W')).permitNumber, '029254');
  assert.equal(universe.stores.find((store) => store.address.startsWith('26260 W MAIN ST'))?.zip, '39773');
  assert.ok(universe.stores.every((store) => store.address.endsWith(store.zip)
    || store.address.endsWith(`-${store.zip}`)
    || new RegExp(`\\b${store.zip}-[0-9]{4}$`, 'u').test(store.address)));
  assert.ok(!universe.stores.some((store) => 'tapPermitNumber' in store || 'permitBindingReason' in store));
});

test('region matching is exact and source atlas closes every research disposition', async () => {
  assert.equal(assignMississippiRegion({ city: 'Southaven', county: 'DeSoto' }), 'northwest-desoto-memphis-fringe');
  assert.equal(assignMississippiRegion({ city: 'Gulfport', county: 'Harrison' }), 'gulf-coast');
  assert.equal(mississippiRegionForLocation({ city: 'Not Gulfport Heights', county: 'Unknown' }), null);

  const universe = JSON.parse(await readFile(new URL('../data/store-universe/MS.json', import.meta.url), 'utf8'));
  const atlas = buildMississippiSourceAtlas(universe);
  const summary = validateMississippiSourceAtlas(atlas);
  assert.equal(summary.currentStores, 690);
  assert.equal(summary.unresearched, 0);
  assert.equal(summary.finalDispositions, 690);
  assert.equal(summary.inventoryCapable, 10);
  assert.equal(summary.blockedOrOfflineOrProbeOnly, 9);
  assert.equal(atlas.stores.filter((store) => store.platform === 'bottlecapps').length, 7);
  assert.equal(atlas.stores.filter((store) => store.platform === 'moonshine').length, 5);
  assert.equal(atlas.stores.filter((store) => store.platform === 'tupelo2go').length, 3);
  assert.equal(atlas.stores.filter((store) => store.platform === 'godaddy_release_watch').length, 1);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'directory_only').length, 670);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'blocked_by_source_policy').length, 5);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'source_offline').length, 2);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'platform_probe_only').length, 2);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'release_watch').length, 1);
  assert.equal(atlas.stores.find((store) => store.permitNumber === '043336')?.platformIds?.googlePlayApp, 'com.cta.shots_wine_spirits');
  assert.equal(atlas.stores.find((store) => store.permitNumber === '024142')?.platformIds?.googlePlayApp, 'com.cta.norms_discount_liquor');
  assert.ok(atlas.researchMethod.statewideDirectoryReviewed);
  assert.ok(atlas.stores.filter((store) => store.disposition === 'directory_only')
    .every((store) => store.firstPartyDomains.length === 0));
  assert.ok(atlas.stores.every((store) => store.reviewProvenance?.reviewStatus === 'reviewed'));
  const tamperedAtlas = structuredClone(atlas);
  const firstLive = tamperedAtlas.stores.find((store) => store.permitNumber === '029254');
  const secondLive = tamperedAtlas.stores.find((store) => store.permitNumber === '044692');
  [firstLive.firstPartyDomains, secondLive.firstPartyDomains] = [secondLive.firstPartyDomains, firstLive.firstPartyDomains];
  assert.throws(() => validateMississippiSourceAtlas(tamperedAtlas), /mismatched reviewed source|complete canonical reviewed record/iu);
  const tamperedDirectoryAtlas = structuredClone(atlas);
  const tamperedDirectory = tamperedDirectoryAtlas.stores.find((store) => store.disposition === 'directory_only');
  tamperedDirectory.sourceLayer = 'private_retailer_inventory';
  tamperedDirectory.platformIds = { merchantId: 'synthetic' };
  tamperedDirectory.evidenceUrls = ['https://attacker.invalid/inventory'];
  tamperedDirectory.inventoryAuthoritative = true;
  assert.throws(() => validateMississippiSourceAtlas(tamperedDirectoryAtlas), /complete canonical reviewed record/iu);
  const tamperedReviewedAtlas = structuredClone(atlas);
  const tamperedReviewed = tamperedReviewedAtlas.stores.find((store) => store.permitNumber === '046478');
  tamperedReviewed.probeStatus = 'inventory_capable';
  tamperedReviewed.ecommerce = false;
  tamperedReviewed.pickup = false;
  assert.throws(() => validateMississippiSourceAtlas(tamperedReviewedAtlas), /complete canonical reviewed record/iu);
  const duplicatePermitAtlas = structuredClone(atlas);
  duplicatePermitAtlas.stores[0] = { ...structuredClone(duplicatePermitAtlas.stores[1]), id: 'synthetic-duplicate-id' };
  assert.throws(() => validateMississippiSourceAtlas(duplicatePermitAtlas), /Duplicate or missing Mississippi atlas permit|permit coverage does not exactly match|mismatched official ID/iu);
  const unreviewedUniverse = structuredClone(universe);
  unreviewedUniverse.stores.push({ ...universe.stores[0], id: 'ms-permit-999999', permitNumber: '999999' });
  assert.throws(() => buildMississippiSourceAtlas(unreviewedUniverse), /reviewed disposition ledger|missing an explicit reviewed disposition/iu);
});

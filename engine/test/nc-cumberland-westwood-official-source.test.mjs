import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NC_STATIC_BOARD_TARGETS,
  candidateUrlsForBoard,
  ncBoardWebsiteSignalEligible,
  ncGenericBoardWebsiteWatchEligibility,
  ncWestwoodOfficialStoreIdentity,
  prioritizeNcBoardWebsiteTargets,
} from '../src/collectors/north-carolina-intelligence.mjs';

const BOARD = 'Cumberland County ABC Board';
const UPDATE_URL = 'https://www.cumberlandabc.com/sales-special-orders-new-discontinued';
const WESTWOOD_URL = 'https://www.cumberlandabc.com/morganton-rd';
const DIRECTORY_URL = 'https://www.cumberlandabc.com/store-locations';
const target = NC_STATIC_BOARD_TARGETS.find((entry) => entry.boardName === BOARD);

const westwoodHtml = `
  <main>
    <h1>Morganton Rd. ABC</h1>
    <p>This location has relocated to the Westwood Shopping Center, Suite 102.</p>
    <p>Fayetteville, NC 28314</p>
  </main>
`;
const directoryHtml = '<section><h2>Store # 6 - Morganton Rd</h2><p>102 Westwood Shopping Center, Fayetteville, NC 28314</p></section>';
const directoryEvidence = { requestedUrl: DIRECTORY_URL, finalUrl: DIRECTORY_URL, html: directoryHtml };

test('Cumberland rotation includes the official update, complete store directory, and exact Westwood page', () => {
  assert.ok(target);
  assert.deepEqual(target.urls, [
    'https://www.cumberlandabc.com/',
    UPDATE_URL,
    'https://www.cumberlandabc.com/store-locations',
    WESTWOOD_URL,
    'https://www.cumberlandabc.com/products',
    'https://www.cumberlandabc.com/about-3',
  ]);
  assert.deepEqual(target.signalUrls, [UPDATE_URL]);
  assert.equal(target.capability, 'product_updates_and_exact_store_directory');
});

test('Westwood identity requires the reviewed HTTPS origin and exact official store identity', () => {
  assert.deepEqual(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, directoryEvidence),
    { verified: true, reason: null },
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, 'https://attacker.example/morganton-rd', westwoodHtml, target.urls, directoryEvidence).reason,
    /redirected outside/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity('http://www.cumberlandabc.com/morganton-rd', WESTWOOD_URL, westwoodHtml, target.urls, directoryEvidence).reason,
    /HTTPS route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, 'https://www.cumberlandabc.com/products', westwoodHtml, target.urls, directoryEvidence).reason,
    /exact reviewed HTTPS route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, `${WESTWOOD_URL}?redirected=1`, westwoodHtml, target.urls, directoryEvidence).reason,
    /exact reviewed HTTPS route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, `${WESTWOOD_URL}?`, westwoodHtml, target.urls, directoryEvidence).reason,
    /exact reviewed HTTPS route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(`${WESTWOOD_URL}#`, WESTWOOD_URL, westwoodHtml, target.urls, directoryEvidence).reason,
    /exact reviewed HTTPS route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity('https://www.cumberlandabc.com/products', WESTWOOD_URL, westwoodHtml, target.urls, directoryEvidence).reason,
    /exact reviewed HTTPS route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, { ...directoryEvidence, html: '<p>102 Westwood Shopping Center, Raleigh, NC 27601</p>' }).reason,
    /complete Fayetteville address/i,
  );
  for (const forgedDirectoryHtml of [
    '<p>Store # 6 - Morganton Rd Raleigh, NC 27601; 102 Westwood Shopping Center, Fayetteville, NC 28314</p>',
    '<p>Store # 6 - Morganton Rd 102 Westwood Shopping Center, Fayetteville, NC 28314; Raleigh, NC 27601</p>',
  ]) {
    assert.match(
      ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, { ...directoryEvidence, html: forgedDirectoryHtml }).reason,
      /complete Fayetteville address/i,
    );
  }
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, '<h1>Morganton Rd. ABC</h1><p>102 Westwood Shopping Center, Raleigh, NC 27601</p>', target.urls, directoryEvidence).reason,
    /complete Fayetteville address/i,
  );
  for (const forgedHtml of [
    '<h1>Morganton Rd. ABC</h1><p>Raleigh, NC 27601 — 102 Westwood Shopping Center</p>',
    '<h1>Morganton Rd. ABC</h1><p>102 Westwood Shopping Center, Raleigh, NC</p>',
    '<h1>Morganton Rd. ABC</h1><p>102 Westwood Shopping Center, Atlanta, GA 30301</p>',
    '<h1>Morganton Rd. ABC</h1><p>102 Westwood Shopping Center, Raleigh, NC 27601; Fayetteville, NC 28314</p>',
    `<h1>Morganton Rd. ABC</h1><p>Fayetteville, NC 28314 102 Westwood Shopping Center${'x'.repeat(190)} Raleigh, NC 27601</p>`,
  ]) {
    assert.match(
      ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, forgedHtml, target.urls, directoryEvidence).reason,
      /complete Fayetteville address/i,
    );
  }
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, '<p>Westwood Shopping Center, Suite 102</p>', target.urls, directoryEvidence).reason,
    /store identity.*complete Fayetteville address/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, { ...directoryEvidence, finalUrl: 'https://www.cumberlandabc.com/products' }).reason,
    /exact reviewed first-party store-directory route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, { ...directoryEvidence, finalUrl: `${DIRECTORY_URL}?redirected=1` }).reason,
    /exact reviewed first-party store-directory route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, { ...directoryEvidence, requestedUrl: `${DIRECTORY_URL}?` }).reason,
    /exact reviewed first-party store-directory route/i,
  );
  assert.match(
    ncWestwoodOfficialStoreIdentity(WESTWOOD_URL, WESTWOOD_URL, westwoodHtml, target.urls, { ...directoryEvidence, finalUrl: `${DIRECTORY_URL}#` }).reason,
    /exact reviewed first-party store-directory route/i,
  );
});

test('Cumberland source additions remain directory or county-update evidence, never inventory alerts', () => {
  assert.doesNotMatch(target.capability, /store_inventory_search|store_level/i);
  assert.equal(ncGenericBoardWebsiteWatchEligibility(), false);
  assert.equal(ncBoardWebsiteSignalEligible(BOARD, UPDATE_URL), true);
  assert.equal(ncBoardWebsiteSignalEligible(BOARD, WESTWOOD_URL), false);
  assert.equal(ncBoardWebsiteSignalEligible(BOARD, 'https://www.cumberlandabc.com/products'), false);
  assert.equal(ncBoardWebsiteSignalEligible(BOARD, 'https://attacker.example/inventory'), false);
});

test('candidate URL construction merges every reviewed static row for boards with multiple entries', () => {
  const urls = candidateUrlsForBoard({ boardName: 'New Hanover County ABC Board', website: null });
  assert.equal(urls.includes('https://www.newhanovercountyabc.com/barrels/'), true);
  assert.equal(urls.includes('https://www.newhanovercountyabc.com/allocated-products/'), true);
});

test('Cumberland stays inside the bounded production board-page cohort', () => {
  const boards = NC_STATIC_BOARD_TARGETS.map((entry, index) => ({
    boardName: entry.boardName,
    website: null,
    trackedUnits: 10_000 - index,
  })).reverse();
  const selected = prioritizeNcBoardWebsiteTargets(boards, 12).map((board) => board.boardName);
  assert.equal(selected.includes(BOARD), true);
});

import { ncOfficialBoardSourceId, STANLEY_ABC_BOARD, stanleyDirectoryHasNoRetailStores } from '../src/nc-official-board-directory.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildNcSourceLedger, enrichNcSingleStoreShipmentSignals, validateNcSingleStoreCoverage, validateNcSourceLedgerContract } from '../src/nc-source-ledger.mjs';
import { locationValue, precisionRank } from '../src/location-precision.mjs';

const locations = [
  {
    id: 'board-wake', state: 'NC', source: 'NC ABC Commission board list', name: 'Wake County ABC Board',
    notes: 'Official NC ABC board option id 92. Store locator is available; public bottle inventory varies by board.',
    sourceUrl: 'https://abc2.nc.gov/Search/ABCStoreLocator', lastVerifiedAt: '2026-07-29T03:00:00.000Z',
  },
  {
    id: 'store-wake-1', state: 'NC', source: 'NC ABC Commission store locator', name: 'Wake ABC Store 1', address: '1 Main St', city: 'Raleigh',
    notes: 'Official NC ABC store locator row for Wake County ABC Board (board id 92).', lastVerifiedAt: '2026-07-29T03:00:00.000Z',
  },
  {
    id: 'board-small', state: 'NC', source: 'NC ABC Commission board list', name: 'Small Town ABC Board',
    notes: 'Official NC ABC board option id 7. Store locator is available; public bottle inventory varies by board.',
    sourceUrl: 'https://abc2.nc.gov/Search/ABCStoreLocator', lastVerifiedAt: '2026-07-29T03:00:00.000Z',
  },
  {
    id: 'store-small-1', state: 'NC', source: 'NC ABC Commission store locator', name: 'Small Town ABC Store', address: '2 Main St', city: 'Small Town',
    notes: 'Official NC ABC store locator row for Small Town ABC Board (board id 7).', lastVerifiedAt: '2026-07-29T03:00:00.000Z',
  },
];

const intelligence = {
  generatedAt: '2026-07-29T03:10:00.000Z',
  boards: [
    {
      boardName: 'Wake County ABC Board', website: 'https://wakeabc.com', trackedShipmentRows: 21,
      capabilities: ['store_level_probe_attached', 'tracked_board_shipments'],
      officialPageReports: [{ url: 'https://wakeabc.com/search-results/', status: 200 }],
    },
    {
      boardName: 'Small Town ABC Board', website: null, trackedShipmentRows: 4,
      capabilities: ['tracked_board_shipments'], officialPageReports: [],
    },
  ],
};

test('builds one operational source-ledger row for every official board without inflating inventory qualification', () => {
  const ledger = buildNcSourceLedger(locations, intelligence);
  assert.equal(ledger.contractVersion, 'bourbon-signal-nc-source-ledger-v1');
  assert.equal(ledger.boardCount, 2);
  assert.equal(ledger.boards.length, 2);

  const wake = ledger.boards.find((board) => board.boardId === '92');
  assert.equal(wake.officialStoreCount, 1);
  assert.equal(wake.qualification, 'direct_inventory_monitored');
  assert.equal(wake.health, 'monitored_unverified');
  assert.equal(wake.supportingEvidenceHealth, 'healthy');
  assert.equal(wake.expectedCadence, 'hourly');
  assert.equal(wake.lastSuccessfulRetrievalAt, null);
  assert.equal(wake.lastSuccessfulSupportingEvidenceAt, intelligence.generatedAt);

  const small = ledger.boards.find((board) => board.boardId === '7');
  assert.equal(small.officialStoreCount, 1);
  assert.equal(small.qualification, 'single_store_board_shipment_intelligence');
  assert.equal(small.canAlertAsInventory, false);
  assert.match(small.nextAction, /shipment/i);
});

test('maps one-store board shipments to the official store as non-inventory store-equivalent intelligence', () => {
  const signals = [{
    id: 'shipment-small-1', state: 'NC', eventType: 'nc_board_shipment_snapshot',
    locationName: 'Small Town ABC Board', locationPrecision: 'board_county', quantity: 12,
    canAlertAsInventory: false, canAlertAsWatch: false, sourceAvailabilityVerified: false,
    inventorySemantics: 'Board-level shipment intelligence; exact store and shelf status remain unknown.',
    raw: { shipmentScope: 'board_level_not_store_inventory' },
  }, {
    id: 'wake-inventory', state: 'NC', eventType: 'store_inventory_result',
    locationName: 'Wake ABC Store 1', locationPrecision: 'store_level', quantity: 3,
    canAlertAsInventory: true,
  }];

  const enriched = enrichNcSingleStoreShipmentSignals(signals, locations);
  const shipment = enriched.find((signal) => signal.id === 'shipment-small-1');
  assert.equal(shipment.locationPrecision, 'store_equivalent_shipment');
  assert.equal(shipment.storeId, 'store-small-1');
  assert.equal(shipment.storeName, 'Small Town ABC Store');
  assert.equal(shipment.quantity, null);
  assert.equal(shipment.boardShipmentQuantity, 12);
  assert.equal(shipment.canAlertAsInventory, false);
  assert.equal(shipment.canAlertAsWatch, false);
  assert.equal(shipment.sourceAvailabilityVerified, false);
  assert.equal(shipment.raw.shipmentScope, 'single_store_board_shipment_not_shelf_inventory');
  assert.match(shipment.inventorySemantics, /not current shelf inventory/i);
  assert.equal(precisionRank(shipment.locationPrecision), precisionRank('board_county'));
  assert.equal(locationValue(shipment), 'medium_board_or_county_signal');
  assert.equal(enriched.find((signal) => signal.id === 'wake-inventory').locationPrecision, 'store_level');
});

test('checked NC artifacts produce a complete 174-board ledger with qualified one-store shipment coverage', async () => {
  const [locationPayload, intelligence] = await Promise.all([
    readFile(new URL('../out/site/locations.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../out/site/nc-intelligence.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const ledger = buildNcSourceLedger(locationPayload.locations, intelligence);
  assert.equal(ledger.boardCount, 174);
  const stanley = ledger.boards.find(board => board.boardName === 'Stanley ABC Board');
  assert.ok(stanley);
  assert.equal(stanley.canAlertAsInventory, false);
  assert.equal(stanley.officialStoreCount, 0);
  assert.equal(ledger.boards.every((board) => board.boardId && board.boardName && board.qualification && board.expectedCadence && board.health && board.nextAction), true);
  assert.equal(ledger.boards.filter((board) => board.qualification === 'direct_inventory_monitored').length >= 3, true);
  assert.equal(ledger.boards.filter((board) => board.officialStoreCount === 1).length >= 75, true);
  assert.equal(ledger.boards.every((board) => board.canAlertAsInventory === false), true);
});

test('direct-inventory capability alone never fabricates source health or a successful retrieval timestamp', () => {
  const result = buildNcSourceLedger([{
    id: 'board-direct-only', state: 'NC', source: 'NC ABC Commission board list',
    name: 'Direct Only ABC Board', notes: 'Canonical NC ABC board option id 999.',
  }], {
    generatedAt: '2026-07-29T05:00:00.000Z',
    boards: [{
      boardName: 'Direct Only ABC Board',
      capabilities: ['store_level_probe_attached'],
      trackedShipmentRows: 3,
      officialPageReports: [{ url: 'https://official.example/releases', status: 200 }],
    }],
  });
  const board = result.boards[0];
  assert.equal(board.qualification, 'direct_inventory_monitored');
  assert.equal(board.health, 'monitored_unverified');
  assert.equal(board.lastSuccessfulRetrievalAt, null);
  assert.equal(board.supportingEvidenceHealth, 'healthy');
  assert.equal(board.lastSuccessfulSupportingEvidenceAt, '2026-07-29T05:00:00.000Z');
});

test('a forged board-page redirect cannot certify supporting source health', () => {
  const result = buildNcSourceLedger([{
    id: 'board-forged', state: 'NC', source: 'NC ABC Commission board list',
    name: 'Forged ABC Board', notes: 'Canonical NC ABC board option id 998.',
  }], {
    generatedAt: '2026-07-29T05:00:00.000Z',
    boards: [{
      boardName: 'Forged ABC Board',
      website: 'https://official.example',
      capabilities: [],
      trackedShipmentRows: 0,
      officialPageReports: [{
        url: 'https://official.example/releases',
        finalUrl: 'https://attacker.example/releases',
        status: 200,
        sourceIdentityVerified: false,
      }],
    }],
  });
  const board = result.boards[0];
  assert.equal(board.qualification, 'official_board_website_watch');
  assert.equal(board.supportingEvidenceHealth, 'watch_only');
  assert.equal(board.lastSuccessfulSupportingEvidenceAt, null);
});

test('NC source ledger production contract requires exactly 174 unique official boards', () => {
  const boards = Array.from({ length: 174 }, (_, index) => ({ boardId: `board-${index + 1}` }));
  assert.deepEqual(validateNcSourceLedgerContract({ boardCount: 174, boards }), []);
  assert.match(validateNcSourceLedgerContract({ boardCount: 173, boards: boards.slice(0, 173) }).join(' '), /exactly 174/i);
  assert.match(validateNcSourceLedgerContract({ boardCount: 174, boards: [...boards.slice(0, 173), { boardId: 'board-173' }] }).join(' '), /unique board ids/i);
});

test('single-store coverage is stable when a quiet shipment day changes current qualifications', () => {
  const boards = Array.from({ length: 100 }, (_, index) => ({
    boardId: `single-${index + 1}`,
    officialStoreCount: 1,
    qualification: index < 74 ? 'single_store_board_shipment_intelligence' : 'official_board_website_watch',
  }));
  assert.deepEqual(validateNcSingleStoreCoverage({ boards }, 75), []);
  assert.match(validateNcSingleStoreCoverage({ boards: boards.slice(0, 74) }, 75).join(' '), /official single-store board coverage below threshold/i);
});

test('Stanley can be verified as a directory-only board from its exact official detail page', () => {
  const page = '<h2>ABC Board Directory</h2><h6><u>Stanley ABC Board</u></h6>'
    + '<div><label for="RetailSalesDate">Date of First Retail Sales</label>:</div><div class="col-6"></div>';
  assert.equal(stanleyDirectoryHasNoRetailStores(page), true);
  assert.equal(stanleyDirectoryHasNoRetailStores(page + '<th>Store Address</th>'), false);
  assert.equal(stanleyDirectoryHasNoRetailStores(page.replace('Stanley ABC Board', 'Unrelated Board')), false);
  assert.equal(stanleyDirectoryHasNoRetailStores(page.replace('col-6"></div>', 'col-6">11/12/2026</div>')), false);
  const row = { name: STANLEY_ABC_BOARD.label, sourceUrl: STANLEY_ABC_BOARD.sourceUrl, notes: 'Official NC ABC board id 261.' };
  assert.equal(ncOfficialBoardSourceId(row), STANLEY_ABC_BOARD.sourceId);
  assert.equal(ncOfficialBoardSourceId({ ...row, sourceUrl: 'https://example.com/Districts/Board/261' }), null);
});

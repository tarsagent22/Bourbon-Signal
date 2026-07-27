import assert from 'node:assert/strict';
import { formatSmsAlert, gsmSeptetLength, isExactStoreSmsLocation } from '../src/lib/sms-alert-copy.ts';
import { stableGroupedAlertDedupeKey } from '../src/lib/alert-dedupe.ts';

const groupedBottleNames = [
  'Buffalo Trace Bourbon',
  'Elijah Craig Barrel Proof',
  'Willett Family Estate',
  "Michter's US 1 Straight Bourbon Small Batch",
  "Baker's High Rye Bourbon",
  'Willett Pot Still Reserve Small Batch Straight Bourbon',
];

const grouped = formatSmsAlert({
  bottleNames: groupedBottleNames,
  storeLabel: 'Wake County ABC - 7200 Sandy Fork Rd., Raleigh, NC 27609',
  state: 'NC',
  quantityLabel: '490 bottles reported',
  timestampLabel: 'within the last hour',
  sourceCaveat: 'Verify before driving.',
});

assert.match(grouped, /^Bourbon Signal\nMatches\n\n/, `SMS should use a scannable multiline header: ${grouped}`);
assert.doesNotMatch(grouped, / @ /, `SMS should not compress the bottle and location into one dense line: ${grouped}`);

for (const expected of [
  'Buffalo Trace Bourbon',
  'Elijah Craig BP',
  'Willett Family Estate',
  "Michter's US 1 Bourbon Sm Batch",
  "Baker's High Rye Bourbon",
  'Willett Pot Still Reserve Sm Batch Bourbon',
]) {
  assert.ok(grouped.includes(expected), `grouped SMS should identify ${expected}: ${grouped}`);
}
assert.ok(gsmSeptetLength(grouped) <= 306, `expected the real grouped alert to fit two GSM segments, got ${gsmSeptetLength(grouped)} septets: ${grouped}`);
assert.doesNotMatch(grouped, /\|/, 'extension-table separators should not unexpectedly add GSM septets');
assert.match(grouped, /\n\nVerify before driving\.\nReply STOP to unsubscribe\.$/);
assert.doesNotMatch(grouped, /within the la$/);

const boardLevel = formatSmsAlert({
  bottleNames: ['Henry McKenna 10 Year Bottled-in-Bond'],
  storeLabel: 'Mecklenburg County ABC',
  state: 'NC',
  locationScope: 'board',
  quantityLabel: '2880 bottles reported',
  timestampLabel: 'within the last hour',
  sourceCaveat: 'Board-level signal; check source before driving.',
});
assert.match(boardLevel, /^Bourbon Signal\nFresh match\n\nHenry McKenna 10 Year Bottled-in-Bond\nMecklenburg County ABC, NC\n<1 hr ago\n\nBoard-level signal; check source before driving\.\nReply STOP to unsubscribe\.$/);
assert.doesNotMatch(boardLevel, /2880/, 'board and warehouse aggregate quantities should not appear in customer SMS copy');

const manyNames = Array.from({ length: 12 }, (_, index) => `Collector Bottle ${index + 1} Limited Edition Single Barrel Bourbon`);
const oversized = formatSmsAlert({
  bottleNames: manyNames,
  storeLabel: 'Example Store - 123 Long Address Road, Exampletown, NC 27000',
  state: 'NC',
  quantityLabel: '120 bottles reported',
  timestampLabel: 'about 2 hours ago',
  sourceCaveat: 'Verify before driving.',
});
assert.match(oversized, /\+[0-9]+ more matched bottles/, `oversized groups should summarize overflow cleanly: ${oversized}`);
assert.ok(gsmSeptetLength(oversized) <= 306, `even oversized grouped alerts must remain inside two GSM segments: ${gsmSeptetLength(oversized)} septets`);
assert.match(oversized, /\n\nVerify before driving\.\nReply STOP to unsubscribe\.$/);

assert.equal(isExactStoreSmsLocation({ locationPrecision: 'store_level', eventType: 'store_inventory' }), true);
assert.equal(isExactStoreSmsLocation({ locationPrecision: 'store_level', eventType: 'store_inventory_aggregate' }), false, 'aggregate event evidence must override a contradictory store precision');
assert.equal(isExactStoreSmsLocation({ actionabilityClass: 'board_or_county_lead', eventType: 'store_delivery_snapshot' }), false, 'board/county actionability must override a store-like event name');

const irreduciblyLong = formatSmsAlert({
  bottleNames: ['A'.repeat(400)],
  storeLabel: 'Long Store '.repeat(40),
  state: 'NC',
  locationScope: 'store',
  quantityLabel: '1234567890'.repeat(20),
  timestampLabel: 'within the last hour '.repeat(20),
  sourceCaveat: 'Verify this unusually long source description before driving. '.repeat(20),
});
assert.ok(gsmSeptetLength(irreduciblyLong) <= 306, `irreducibly long fields must still fit two GSM segments: ${gsmSeptetLength(irreduciblyLong)}`);
assert.match(irreduciblyLong, /Reply STOP to unsubscribe\.$/, 'length bounding must preserve the compliance footer');
assert.match(irreduciblyLong, /\.\.\./, 'long fields should be shortened intentionally rather than cutting the final message');
assert.equal(isExactStoreSmsLocation({ locationPrecision: 'store_aggregate', actionabilityClass: 'store_inventory', eventType: 'store_inventory_aggregate' }), false, 'aggregate precision overrides misleading store event names');

const pathologicalState = formatSmsAlert({
  bottleNames: ['B'.repeat(400)],
  storeLabel: 'Long Store '.repeat(40),
  state: 'STATE'.repeat(100),
  locationScope: 'store',
  quantityLabel: '9'.repeat(200),
  timestampLabel: 'recent '.repeat(100),
  sourceCaveat: 'verify '.repeat(100),
});
assert.ok(gsmSeptetLength(pathologicalState) <= 306, `state input must be bounded before every fallback: ${gsmSeptetLength(pathologicalState)} septets`);
assert.match(pathologicalState, /Reply STOP to unsubscribe\.$/);
assert.equal(isExactStoreSmsLocation({ locationPrecision: 'board_county', eventType: 'store_delivery_snapshot' }), false, 'board precision cannot be upgraded by a store-like event type');
assert.equal(isExactStoreSmsLocation({ eventType: 'store_inventory_aggregate' }), false, 'aggregate fallback events are not exact stores');

const unicode = formatSmsAlert({
  bottleNames: ['Maker’s Mark Wood Finishing Series – 2026'],
  storeLabel: 'Café Spirits — 1 Main Street, Raleigh, NC',
  state: 'NC',
  quantityLabel: '1 bottle reported',
  timestampLabel: 'within the last hour',
  sourceCaveat: 'Verify before driving.',
});
assert.equal(/[^\x00-\x7F]/.test(unicode), false, `SMS should remain ASCII/GSM-safe: ${unicode}`);
assert.match(unicode, /Maker's Mark Wood Finishing Series - 2026/);

const firstInventorySnapshot = [
  { matchKey: 'wake|buffalo-trace', dedupeKey: 'wake|buffalo-trace|qty-120' },
  { matchKey: 'wake|elijah-craig-bp', dedupeKey: 'wake|elijah-craig-bp|qty-24' },
];
const changedQuantitySnapshot = [
  { matchKey: 'wake|buffalo-trace', dedupeKey: 'wake|buffalo-trace|qty-115' },
  { matchKey: 'wake|elijah-craig-bp', dedupeKey: 'wake|elijah-craig-bp|qty-20' },
];
assert.equal(
  stableGroupedAlertDedupeKey('NC|store|wake-sandy-fork', firstInventorySnapshot),
  stableGroupedAlertDedupeKey('NC|store|wake-sandy-fork', changedQuantitySnapshot),
  'quantity changes must not reopen the same grouped SMS alert',
);
assert.notEqual(
  stableGroupedAlertDedupeKey('NC|store|wake-sandy-fork', firstInventorySnapshot),
  stableGroupedAlertDedupeKey('NC|store|wake-sandy-fork', [...changedQuantitySnapshot, { matchKey: 'wake|new-bottle', dedupeKey: 'wake|new-bottle|qty-1' }]),
  'a genuinely new bottle should create a new grouped SMS identity',
);

console.log(`SMS alert copy and dedupe tests passed (${grouped.length} chars for the reported grouped alert).`);

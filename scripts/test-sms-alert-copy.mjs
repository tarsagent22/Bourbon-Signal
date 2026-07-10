import assert from 'node:assert/strict';
import { formatSmsAlert } from '../src/lib/sms-alert-copy.ts';
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
assert.ok(grouped.length <= 306, `expected the real grouped alert to fit two GSM segments, got ${grouped.length}: ${grouped}`);
assert.match(grouped, /Verify before driving\. Reply STOP to unsubscribe\.$/);
assert.doesNotMatch(grouped, /within the la$/);

const manyNames = Array.from({ length: 12 }, (_, index) => `Collector Bottle ${index + 1} Limited Edition Single Barrel Bourbon`);
const oversized = formatSmsAlert({
  bottleNames: manyNames,
  storeLabel: 'Example Store - 123 Long Address Road, Exampletown, NC 27000',
  state: 'NC',
  quantityLabel: '120 bottles reported',
  timestampLabel: 'about 2 hours ago',
  sourceCaveat: 'Verify before driving.',
});
for (let index = 1; index <= manyNames.length; index += 1) {
  assert.ok(oversized.includes(`Collector Bottle ${index} LE SiB Bourbon`), `oversized SMS dropped bottle ${index}: ${oversized}`);
}
assert.match(oversized, /Verify before driving\. Reply STOP to unsubscribe\.$/);

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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NEW_YORK_RETAILER_SOURCES, parseMetroCityHiveHtml } from '../src/collectors/metro-retailer-surfaces.mjs';

const evidenceRoot = new URL('../data/source-evidence/NY/buffalo/', import.meta.url);
const cases = [
  ['five-star-wine-spirits-buffalo', '5star-bourbon-live.html', '5star-buffalo-trace-375-oos.html', 24],
  ['bailey-discount-liquor-wine', 'bailey-bourbon-live.html', 'bailey-makers-mark-options.html', 16],
];

test('captured Buffalo first-party evidence stays bound to exact merchants and premises', () => {
  for (const [sourceId, positiveFixture, negativeFixture, minimumRows] of cases) {
    const source = NEW_YORK_RETAILER_SOURCES.find((candidate) => candidate.id === sourceId);
    const positiveRows = parseMetroCityHiveHtml(readFileSync(new URL(positiveFixture, evidenceRoot), 'utf8'), source);
    const negativeRows = parseMetroCityHiveHtml(readFileSync(new URL(negativeFixture, evidenceRoot), 'utf8'), source);
    assert.ok(positiveRows.length >= minimumRows);
    assert.ok(positiveRows.every((row) => row.merchantId === source.stores[0].merchantId
      && row.storeId === source.stores[0].id
      && row.premisesVerified
      && row.pickupOfferVerified
      && row.sourceAvailabilityVerified));
    assert.equal(negativeRows.length, 0);
  }
});

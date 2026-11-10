import assert from 'node:assert/strict';
import test from 'node:test';
import { membershipDisplayPrice } from './membership-price';
test('whole store prices omit zero fractions while preserving currency and nonzero cents', () => {
  for (const [price, expected] of [['$6.00','$6'],['CA$9.00','CA$9'],['9,00 €','9 €'],['$6.49','$6.49'],['1.234,00 €','1.234 €'],['$6,000','$6,000']]) assert.equal(membershipDisplayPrice(price),expected);
});

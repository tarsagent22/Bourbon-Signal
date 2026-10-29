import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFleetDropBudget, MAX_CUSTOMER_DROP_BYTES } from '../src/fleet-drop-budget.mjs';

test('current evidence has no 10000-row ceiling while optional context stays bounded', () => {
  const current = Array.from({ length: 10_010 }, (_, i) => ({ id: `current-${i}`, state: 'CA', observedAt: '2026-10-29T16:05:57.931Z' }));
  const history = Array.from({ length: 10_020 }, (_, i) => ({ id: `history-${i}`, state: i % 2 ? 'VA' : 'PA' }));
  const required = new Set(current);
  const result = selectFleetDropBudget([...history, ...current], { isRequired: row => required.has(row) });
  assert.equal(result.length, 20_010);
  assert.deepEqual(result.filter(row => required.has(row)), current);
  assert.equal(result.filter(row => !required.has(row)).length, 10_000);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < MAX_CUSTOMER_DROP_BYTES);
});

test('optional context cannot consume mandatory UTF-8 byte budget or alter source clocks', () => {
  const current = { id: 'fresh', state: 'ID', observedAt: '2026-10-29T16:02:51.747Z', evidence: '🥃' };
  const bytes = Buffer.byteLength(JSON.stringify([current]));
  const result = selectFleetDropBudget([{ id: 'old', state: 'VA', evidence: 'x'.repeat(1000) }, current], { isRequired: row => row === current, maxBytes: bytes + 1 });
  assert.deepEqual(result, [current]);
  assert.equal(result[0], current);
  assert.throws(() => selectFleetDropBudget([current], { maxBytes: JSON.stringify([current]).length }), /no partition was truncated/);
});

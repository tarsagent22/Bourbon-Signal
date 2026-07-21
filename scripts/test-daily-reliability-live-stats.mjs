import assert from 'node:assert/strict';
import { readLiveJson } from '../automation/bourbon-signal/daily-reliability.mjs';

const fallback = { generatedAt: 'fallback', refreshHealth: { staleStateCount: 5 } };
const live = { generatedAt: 'live', refreshHealth: { staleStateCount: 0 } };

assert.deepEqual(await readLiveJson('/api/stats', fallback, async () => ({
  ok: true,
  json: async () => live,
})), live, 'live production stats must replace the committed fallback');

assert.deepEqual(await readLiveJson('/api/stats', fallback, async () => ({ ok: false })), fallback,
  'a failed production read must preserve the local diagnostic fallback');

assert.deepEqual(await readLiveJson('/api/stats', fallback, async () => { throw new Error('offline'); }), fallback,
  'network errors must preserve the local diagnostic fallback');

console.log('Daily reliability live stats contract passed.');
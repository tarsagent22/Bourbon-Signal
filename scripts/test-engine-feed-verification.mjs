import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeEngineFeedVerification, signEngineFeedVerification, engineFeedCountPayload } from '../src/lib/engine-feed-verification.ts';
const key = 'test-only-engine-count-key-1234567890';
const now = 1791954000000;
const url = () => new URL('https://www.bourbonsignal.com/api/drops?state=IN&limit=1&_bs_verify=1791954000000-abcdef');
test('signed counts bind origin, query and freshness', () => {
  const proof = signEngineFeedVerification(url(), key, now);
  assert.equal(authorizeEngineFeedVerification(url(), proof, key, now), true);
  assert.equal(authorizeEngineFeedVerification(url(), proof, key, now + 91000), false);
  assert.equal(authorizeEngineFeedVerification(url(), proof, key, now - 6000), false);
  assert.equal(authorizeEngineFeedVerification(url(), proof, 'wrong-key-1234567890123456789012345', now), false);
  const changed = url(); changed.searchParams.set('state', 'NC');
  assert.equal(authorizeEngineFeedVerification(changed, proof, key, now), false);
  changed.searchParams.set('state', 'IN'); changed.hostname = 'attacker.example';
  assert.equal(authorizeEngineFeedVerification(changed, proof, key, now), false);
});
test('cards, history, detail, extra filters and duplicate parameters cannot be authorized', () => {
  for (const suffix of ['&history=1', '&signalId=123', '&bottle=weller', '&state=NC', '&cursor=123', '&offset=1']) {
    const changed = url(); changed.search += suffix;
    assert.throws(() => signEngineFeedVerification(changed, key, now));
    assert.equal(authorizeEngineFeedVerification(changed, 'v1:1791954000:' + 'a'.repeat(64), key, now), false);
  }
  const changed = url(); changed.searchParams.set('limit', '100');
  assert.throws(() => signEngineFeedVerification(changed, key, now));
  assert.equal(authorizeEngineFeedVerification(url(), null, key, now), false);
  assert.equal(authorizeEngineFeedVerification(url(), 'malformed', key, now), false);
  assert.throws(() => signEngineFeedVerification(url(), '', now));
});
test('verification response contains no cards, customer records, or market details', () => {
  assert.deepEqual(engineFeedCountPayload('IN', 12, 'snapshot-1', '2026-10-14'), {
    contractVersion: 'bourbon-signal/engine-feed-count@1', state: 'IN', total: 12, snapshot: 'snapshot-1', lastUpdated: '2026-10-14',
  });
});

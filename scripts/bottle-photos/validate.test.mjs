import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from './validate.mjs';
import { reconcile } from './inventory.mjs';
const date = '2026-09-09T12:00:00.000Z';
const ledger = () => reconcile({ total: 1, bottles: [{ id: 'exact-id', canonicalName: 'Brand 12 Year', proof: 100 }] }, null, date);
function approved(l) {
  l.items[0].status = 'ready';
  const sha = 'a'.repeat(64), review = { disposition: 'approved', reviewer: 'fixture-only', date, processedSha256: sha };
  return { status: 'ready', artworkId: 'fixture-art', catalogIds: ['exact-id'],
    identity: { ...review, scope: 'Brand 12 Year, 100 proof, 750mL, edition explicitly reviewed', catalogHashes: { 'exact-id': l.items[0].catalogHash } },
    rights: { ...review, evidence: 'PRIVATE fixture permission text', license: 'fixture test only', permitsRedistribution: true, permitsDerivatives: true },
    provenance: { sourcePage: 'https://producer.example/product', sourceAssetUrl: 'https://producer.example/photo.png', publisher: 'Fixture producer', downloadedAt: date, assetType: 'photo' },
    originalSha256: 'b'.repeat(64), processedSha256: sha, recipeVersion: 'rgba-pad-v1',
    image: { valid: true, decoded: true, width: 400, height: 600, format: 'PNG', sha256: sha },
    visualReview: review,
    publication: { verified: true, verifiedAt: date, sha256: sha, url: `https://cdn.example/bottles/${sha}.png` } };
}
const run = (r, l = ledger()) => buildRegistry(l, r, ['cdn.example']);
test('only approved descriptors, explicit exact ID binding, no private fields', () => {
  const l = ledger(), r = approved(l), result = run([r], l);
  assert.deepEqual(Object.keys(result), ['exact-id']);
  assert.deepEqual(Object.keys(result['exact-id']), ['artworkId', 'revision', 'url', 'width', 'height']);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.deepEqual(run([{ status: 'needs_permission', privateCorrespondence: 'secret' }]), {});
});
test('each publication prerequisite fails closed', () => {
  const paths = ['identity', 'identity.scope', 'identity.catalogHashes', 'identity.reviewer', 'rights', 'rights.evidence', 'rights.license',
    'rights.permitsRedistribution', 'rights.permitsDerivatives', 'provenance.sourcePage', 'provenance.sourceAssetUrl',
    'provenance.publisher', 'provenance.downloadedAt', 'provenance.assetType', 'originalSha256', 'processedSha256',
    'recipeVersion', 'image.valid', 'image.decoded', 'image.sha256', 'visualReview', 'publication.verified', 'publication.verifiedAt'];
  for (const path of paths) {
    const l = ledger(), r = approved(l), keys = path.split('.'); let obj = r;
    for (const k of keys.slice(0,-1)) obj = obj[k]; delete obj[keys.at(-1)];
    assert.throws(() => run([r], l), undefined, path);
  }
});
test('reject invalid URLs, hashes, dimensions, reviews and duplicates', () => {
  const cases = [ ['publication.url', 'http://cdn.example/a.png'], ['publication.url', 'https://cdn.example.evil/a.png'],
    ['publication.url', 'https://user:pass@cdn.example/a.png'], ['publication.url', 'https://cdn.example/a.png?token=secret'],
    ['provenance.sourcePage', 'https://127.0.0.1/a'], ['provenance.sourceAssetUrl', 'file:///a.png'],
    ['provenance.sourcePage', 'https://192.168.1.1/a'], ['provenance.sourcePage', 'https://localhost/a'],
    ['processedSha256', 'A'.repeat(64)], ['image.width', 401], ['image.height', 0], ['image.sha256', 'c'.repeat(64)],
    ['publication.sha256', 'c'.repeat(64)], ['visualReview.processedSha256', 'c'.repeat(64)],
    ['rights.disposition', 'pending'], ['identity.date', 'nonsense'], ['provenance.assetType', 'ai_generated'] ];
  for (const [path, value] of cases) {
    const l = ledger(), r = approved(l), keys = path.split('.'); let obj = r;
    for (const k of keys.slice(0,-1)) obj = obj[k]; obj[keys.at(-1)] = value;
    assert.throws(() => run([r], l), undefined, path);
  }
  const l = ledger(), r = approved(l); assert.throws(() => run([r,r], l));
  assert.throws(() => buildRegistry(l, [r], []));
});
test('approval is bound to the exact processed image and ledger workflow', () => {
  for (const field of ['identity', 'rights']) {
    const l = ledger(), r = approved(l); r[field].processedSha256 = 'c'.repeat(64);
    assert.throws(() => run([r], l));
  }
  const l = ledger(), r = approved(l); l.items[0].status = 'unsearched';
  assert.throws(() => run([r], l));
});
test('never infer identity via aliases, punctuation, old/custom IDs or edition names; stale work withheld', () => {
  for (const id of ['old-id', 'custom-entry', 'exact id', 'Brand 10 Year', 'Brand 12 Year Cask Finish', 'Brand 12 Year 2025', 'Brand 12 Year 90 Proof', 'taylor-single-barrel']) {
    const l = ledger(), r = approved(l); r.catalogIds = [id]; assert.throws(() => run([r], l));
  }
  for (const key of ['requiresReview', 'present', 'catalogHash']) {
    const l = ledger(), r = approved(l); l.items[0][key] = key === 'requiresReview' ? true : key === 'present' ? false : 'changed';
    assert.throws(() => run([r], l));
  }
});

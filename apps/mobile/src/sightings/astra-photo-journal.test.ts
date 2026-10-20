import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadWithMocks } from '../astra-test-harness';
import { MobileApiError } from '../api/client';
const file = 'src/sightings/photo-journal.ts';
const photo = { uri: 'file:///owned/A/photo.jpg', width: 100, height: 100, fileName: 'photo.jpg', mimeType: 'image/jpeg', byteSize: 100 };
function setup() {
  assert.ok(fs.existsSync(file), 'durable photo journal must exist');
  const { createPhotoJournal } = loadWithMocks(file, {});
  const store = new Map<string,string>(); const removed: string[] = [];
  let now = 100;
  const journal = (owner: string) => createPhotoJournal({ owner, now: () => now, ownedRoot: `file:///owned/${owner}/`,
    storage: { getItemAsync: async (k: string) => store.get(k) || null, setItemAsync: async (k: string,v: string) => { store.set(k,v); }, deleteItemAsync: async (k: string) => { store.delete(k); } },
    removeFile: (uri: string) => removed.push(uri) });
  return { store, removed, journal, expire: () => { now += 8 * 86400000; } };
}
test('M08: durable submission/photo intent survives restart and isolates users', async () => {
  const { journal } = setup();
  await journal('A').prepare({ bottleName: 'Fixture' }, 'idempotent-1', photo);
  assert.equal((await journal('A').load()).request.key, 'idempotent-1');
  assert.equal(await journal('B').load(), null);
});
test('M08: restart after each ambiguous phase reconciles existing sighting before retransmission', async () => {
  for (const phase of ['created', 'staged', 'uploaded', 'attached']) {
    const { journal } = setup(); const calls: string[] = []; let uploaded = false; let attached = false; let failed = false;
    const api = {
      submitSighting: async (_: unknown, key: string) => { calls.push(`submit:${key}`); if (phase === 'created' && !failed) { failed = true; throw new Error('lost create response'); } return { sighting: { id: 'sighting_a' } }; },
      uploadSightingPhoto: async () => { calls.push('upload'); if (phase === 'staged' && !failed) { failed = true; throw new Error('before bytes'); } uploaded = true; if (phase === 'uploaded' && !failed) { failed = true; throw new Error('lost upload response'); } return { pathname: 'sighting-proofs/sighting_a/100.jpg', url: 'https://blob.invalid/a' }; },
      attachSightingPhoto: async () => { calls.push('reconcile'); if (!uploaded) throw new MobileApiError('missing',404,'NOT_FOUND'); attached = true; if (phase === 'attached' && !failed) { failed = true; throw new Error('lost attach response'); } return { ok: true }; },
    };
    await journal('A').prepare({ bottleName: 'Fixture' }, 'same-key', photo);
    await assert.rejects(journal('A').resume(api, () => new Blob(['photo'])));
    await journal('A').resume(api, () => new Blob(['photo']));
    assert.equal(attached, true); assert.equal(await journal('A').load(), null);
    assert.ok(calls.filter(c => c.startsWith('submit:')).every(c => c === 'submit:same-key'));
    if (phase === 'uploaded' || phase === 'attached') assert.equal(calls.filter(c => c === 'upload').length, 1);
  }
});
test('M08: expiry cleans owned files; corrupt/out-of-scope file references are never used', async () => {
  const { journal, expire, removed, store } = setup();
  await journal('A').prepare({}, 'k', photo); expire(); assert.equal(await journal('A').load(), null); assert.deepEqual(removed, [photo.uri]);
  await assert.rejects(journal('A').prepare({}, 'k', { ...photo, uri: 'file:///private/other.jpg' }));
  for (const key of store.keys()) store.set(key, '{}');
});

test('photo recovery keeps the same Signal and stops uploading after a terminal attachment failure', async () => {
  const { journal, removed } = setup();
  const retry = journal('A');
  let creates = 0, uploads = 0;
  const api = {
    submitSighting: async () => { creates++; return { sighting: { id: 'sighting_a' } }; },
    uploadSightingPhoto: async () => { uploads++; throw new Error('permanent upload rejection'); },
    attachSightingPhoto: async () => { throw new MobileApiError('missing', 404, 'NOT_FOUND'); },
  };
  await retry.prepare({ bottleName: 'Fixture' }, 'original-key', photo);
  await assert.rejects(retry.resume(api, () => new Blob(['photo'])));
  assert.deepEqual(await journal('A').finishWithoutPhoto(api), { sightingId: 'sighting_a', payload: { bottleName: 'Fixture' } });
  assert.equal(creates, 1); assert.equal(uploads, 1);
  assert.equal(await retry.load(), null); assert.deepEqual(removed, [photo.uri]);
});

test('stopping an ambiguous photo request reuses its original key and preserves intent on a network failure', async () => {
  const { journal, removed } = setup();
  const retry = journal('A');
  const keys: string[] = []; let offline = true;
  const api = { submitSighting: async (_: unknown, key: string) => {
    keys.push(key); if (offline) throw new Error('offline'); return { sighting: { id: 'sighting_existing' } };
  } };
  await retry.prepare({ bottleName: 'Fixture' }, 'same-key', photo);
  await assert.rejects(retry.finishWithoutPhoto(api));
  assert.ok(await retry.load()); assert.equal(removed.length, 0);
  offline = false;
  assert.equal((await retry.finishWithoutPhoto(api)).sightingId, 'sighting_existing');
  assert.deepEqual(keys, ['same-key', 'same-key']); assert.equal(await retry.load(), null);
});

test('photo completion cannot race an active upload or discard another account’s retry', async () => {
  const { journal } = setup(); const retry = journal('A');
  await retry.prepare({}, 'key', photo);
  let resolve!: (value: unknown) => void;
  const finishing = retry.finishWithoutPhoto({ submitSighting: () => new Promise(done => { resolve = done; }) });
  for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
  await assert.rejects(retry.finishWithoutPhoto({}), /already running/);
  await assert.rejects(journal('B').finishWithoutPhoto({}), /No saved photo/);
  resolve({ sighting: { id: 'sighting_a' } }); await finishing;
});

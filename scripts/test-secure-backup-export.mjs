import assert from 'node:assert/strict';
import { createDecipheriv, constants, generateKeyPairSync, privateDecrypt, randomBytes, sign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

import {
  BACKUP_TABLES,
  assertBackupResponseBudget,
  backupRequestMessage,
  encryptBackupPayload,
  requiredBackupTablesForExisting,
  verifyBackupRequest,
} from '../src/lib/secure-backup-export.ts';
import {
  decryptEnvelope,
  persistedSignatureMessage,
  verifyPersistedArtifact,
} from './backup-neon-secure-http.mjs';

const REQUIRED_TABLES = BACKUP_TABLES;

function keyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function signedRequest(privateKey, now = Date.now()) {
  const timestamp = String(now);
  const nonce = randomBytes(16).toString('hex');
  const signature = sign('sha256', backupRequestMessage(timestamp, nonce), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString('base64url');
  return { timestamp, nonce, signature };
}

test('backup request requires a fresh target-bound RSA-PSS signature', () => {
  const { publicKey, privateKey } = keyPair();
  const now = Date.now();
  const request = signedRequest(privateKey, now);
  assert.equal(verifyBackupRequest({ ...request, publicKey, now }), true);
  assert.match(backupRequestMessage(request.timestamp, request.nonce).toString('utf8'), /POST\nhttps:\/\/www\.bourbonsignal\.com\/api\/ops\/encrypted-backup/);
  const tamperedNonce = `${request.nonce.slice(0, -1)}${request.nonce.endsWith('0') ? '1' : '0'}`;
  assert.equal(verifyBackupRequest({ ...request, nonce: tamperedNonce, publicKey, now }), false);
  assert.equal(verifyBackupRequest({ ...request, publicKey, now: now + 301_000 }), false);
});

test('backup envelope contains no plaintext and decrypts only with the matching private key', () => {
  const { publicKey, privateKey } = keyPair();
  const payload = { schemaVersion: 2, generatedAt: new Date().toISOString(), tables: { customers: { columns: [{ column_name: 'email' }], rows: [{ email: 'private@example.test' }] } } };
  const envelope = encryptBackupPayload(payload, publicKey);
  assert.equal(JSON.stringify(envelope).includes('private@example.test'), false);
  const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(envelope.wrappedKey, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64url'));
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]);
  assert.deepEqual(JSON.parse(gunzipSync(compressed).toString('utf8')), payload);
  const other = keyPair();
  assert.throws(() => privateDecrypt({ key: other.privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(envelope.wrappedKey, 'base64url')));
});

test('persisted backup requires a local signature from a separate authentication key', () => {
  const authentication = keyPair();
  const encryption = keyPair();
  const payload = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    snapshotId: '1:1:',
    applicationSchemaCommit: 'a'.repeat(40),
    recoveryContract: 'restore-application-schema-at-commit-then-import-rows',
    tables: Object.fromEntries(REQUIRED_TABLES.map((table) => [table, { columns: [], rows: [] }])),
  };
  const envelope = encryptBackupPayload(payload, encryption.publicKey);
  const localSignature = sign('sha256', persistedSignatureMessage(envelope), {
    key: authentication.privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString('base64url');
  const artifact = { ...envelope, localSignatureAlgorithm: 'rsa-pss-sha256', localSignature };
  assert.deepEqual(decryptEnvelope(verifyPersistedArtifact(artifact, authentication.publicKey), encryption.privateKey), payload);
  assert.throws(() => verifyPersistedArtifact(artifact, keyPair().publicKey), /signature/);
  assert.throws(() => decryptEnvelope(envelope, keyPair().privateKey));
  const tamperedCiphertext = `${artifact.ciphertext.slice(0, -1)}${artifact.ciphertext.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => verifyPersistedArtifact({ ...artifact, ciphertext: tamperedCiphertext }, authentication.publicKey), /signature/);
  assert.throws(() => decryptEnvelope({ ...envelope, ciphertext: tamperedCiphertext }, encryption.privateKey));
});

test('backup table guard fails closed on an incomplete production schema', () => {
  const complete = new Set(REQUIRED_TABLES);
  assert.deepEqual(requiredBackupTablesForExisting(complete), [...complete].sort());
  complete.delete('gift_orders');
  assert.throws(() => requiredBackupTablesForExisting(complete), /gift_orders/);
  complete.add('gift_orders');
  complete.delete('coverage_requests');
  assert.throws(() => requiredBackupTablesForExisting(complete), /coverage_requests/);
});

test('serialized envelope budget accounts for base64 and JSON overhead', () => {
  assert.doesNotThrow(() => assertBackupResponseBudget({ ciphertext: 'a'.repeat(4_300_000) }));
  assert.throws(() => assertBackupResponseBudget({ ciphertext: 'a'.repeat(4_400_000) }), /Vercel response budget/);
});

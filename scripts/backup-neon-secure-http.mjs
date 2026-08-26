#!/usr/bin/env node
import {
  constants,
  createDecipheriv,
  createPrivateKey,
  privateDecrypt,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import {
  BACKUP_AUTH_PUBLIC_KEY_PEM,
  BACKUP_KEY_ID,
  SECURE_BACKUP_CONTRACT,
  backupRequestMessage,
  requiredBackupTablesForExisting,
} from '../src/lib/secure-backup-export.ts';

const endpoint = 'https://www.bourbonsignal.com/api/ops/encrypted-backup';
const localAppData = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
const keyDirectory = path.join(localAppData, 'BourbonSignal');
const authPrivateKeyPath = path.join(keyDirectory, 'backup-auth-private-key.dpapi');
const encryptionPrivateKeyPath = path.join(keyDirectory, 'backup-export-private-key.dpapi');
const backupDirectory = path.resolve(process.env.BOURBON_LOCAL_BACKUP_DIR || path.join(homedir(), 'BourbonSignalBackups'));
const configuredRetention = Number(process.env.BOURBON_LOCAL_BACKUP_RETENTION || 30);
const retention = Number.isInteger(configuredRetention) && configuredRetention > 0 ? Math.max(7, Math.min(180, configuredRetention)) : 30;

function trustedPowerShell() {
  const expected = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const resolved = realpathSync.native(expected);
  if (resolved.toLowerCase() !== expected.toLowerCase()) throw new Error('Trusted Windows PowerShell path was redirected.');
  return resolved;
}

function unprotectDpapi(protectedBase64) {
  const script = 'Add-Type -AssemblyName System.Security; $raw=[Console]::In.ReadToEnd(); $bytes=[Convert]::FromBase64String($raw); $result=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))';
  const result = spawnSync(trustedPowerShell(), ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: protectedBase64,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error('Windows DPAPI private-key unlock failed.');
  return Buffer.from(result.stdout.trim(), 'base64');
}

async function loadPrivateKey(file) {
  const protectedBytes = Buffer.from((await readFile(file, 'utf8')).trim(), 'base64');
  const privateDer = unprotectDpapi(protectedBytes.toString('base64'));
  return createPrivateKey({ key: privateDer, format: 'der', type: 'pkcs8' });
}

export function persistedSignatureMessage(envelope) {
  return Buffer.from(`${SECURE_BACKUP_CONTRACT}\nlocal-verified\n${JSON.stringify(envelope)}`, 'utf8');
}

export function decryptEnvelope(envelope, privateKey) {
  if (envelope?.contractVersion !== SECURE_BACKUP_CONTRACT || envelope?.schemaVersion !== 2 || envelope?.keyId !== BACKUP_KEY_ID || envelope?.algorithm !== 'rsa-oaep-sha256+aes-256-gcm' || envelope?.compression !== 'gzip') {
    throw new Error('Unsupported encrypted backup envelope.');
  }
  const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(envelope.wrappedKey, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64url'));
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]);
  const payload = JSON.parse(gunzipSync(compressed).toString('utf8'));
  if (payload?.schemaVersion !== 2 || !payload?.generatedAt || !payload?.snapshotId || !/^[a-f0-9]{40}$/.test(payload?.applicationSchemaCommit || '') || payload?.recoveryContract !== 'restore-application-schema-at-commit-then-import-rows' || !payload?.tables || typeof payload.tables !== 'object') {
    throw new Error('Decrypted backup payload is invalid.');
  }
  requiredBackupTablesForExisting(new Set(Object.keys(payload.tables)));
  for (const [table, value] of Object.entries(payload.tables)) {
    if (!Array.isArray(value?.columns) || !Array.isArray(value?.rows) || !value.rows.every((row) => typeof row === 'string')) throw new Error(`Decrypted backup table ${table} is invalid.`);
  }
  return payload;
}

export function verifyPersistedArtifact(artifact, authPublicKey = BACKUP_AUTH_PUBLIC_KEY_PEM) {
  const { localSignature, localSignatureAlgorithm, ...envelope } = artifact || {};
  if (localSignatureAlgorithm !== 'rsa-pss-sha256' || typeof localSignature !== 'string') throw new Error('Backup artifact local signature is missing.');
  const valid = verify('sha256', persistedSignatureMessage(envelope), {
    key: authPublicKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }, Buffer.from(localSignature, 'base64url'));
  if (!valid) throw new Error('Backup artifact local signature is invalid.');
  return envelope;
}

async function main() {
  const [authPrivateKey, encryptionPrivateKey] = await Promise.all([
    loadPrivateKey(authPrivateKeyPath),
    loadPrivateKey(encryptionPrivateKeyPath),
  ]);
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('hex');
  const signature = sign('sha256', backupRequestMessage(timestamp, nonce), {
    key: authPrivateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString('base64url');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-backup-timestamp': timestamp,
      'x-backup-nonce': nonce,
      'x-backup-signature': signature,
      'user-agent': 'BourbonSignal-encrypted-backup/2.0',
    },
    signal: AbortSignal.timeout(330_000),
  });
  if (!response.ok) throw new Error(`Production encrypted backup endpoint returned HTTP ${response.status}.`);
  const envelope = await response.json();
  const payload = decryptEnvelope(envelope, encryptionPrivateKey);
  if (envelope.generatedAt !== payload.generatedAt) throw new Error('Backup envelope timestamp does not match decrypted payload.');
  const localSignature = sign('sha256', persistedSignatureMessage(envelope), {
    key: authPrivateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString('base64url');
  const artifact = { ...envelope, localSignatureAlgorithm: 'rsa-pss-sha256', localSignature };

  await mkdir(backupDirectory, { recursive: true });
  const stamp = payload.generatedAt.replace(/[:.]/g, '-');
  const file = path.join(backupDirectory, `bourbon-signal-neon-${stamp}.bsbackup`);
  const temporary = `${file}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(artifact)}\n`, { mode: 0o600, flag: 'wx' });
    const persisted = JSON.parse(await readFile(temporary, 'utf8'));
    const persistedEnvelope = verifyPersistedArtifact(persisted);
    const verified = decryptEnvelope(persistedEnvelope, encryptionPrivateKey);
    if (verified.generatedAt !== payload.generatedAt || Object.keys(verified.tables).length !== Object.keys(payload.tables).length) throw new Error('Persisted encrypted backup verification failed.');
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }

  const currentName = path.basename(file);
  const olderFiles = (await readdir(backupDirectory))
    .filter((name) => name !== currentName && /^bourbon-signal-neon-.*\.bsbackup$/.test(name))
    .sort()
    .reverse();
  for (const stale of olderFiles.slice(Math.max(0, retention - 1))) await unlink(path.join(backupDirectory, stale)).catch(() => undefined);
  await stat(file);
}

if (import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, '/')}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

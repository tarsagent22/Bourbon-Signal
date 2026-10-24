import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

for (const kind of ['typed', 'generic']) test(`actual capture CLI safely reports ${kind} rejection without private details`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'canonical-cli-privacy-'));
  try {
    const source = await readFile(new URL('./capture-shopify-canonical-context.mts', import.meta.url), 'utf8');
    const outfile = join(directory, 'capture.mjs');
    await build({ stdin: { contents: source, loader: 'ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'capture-shopify-canonical-context.mts' },
      outfile, format: 'esm', platform: 'node', bundle: true,
      plugins: [{ name: 'offline-adapters', setup(builder) {
        builder.onResolve({ filter: /shopify-canonical-context-capture\.mts$/ }, () => ({ path: 'capture', namespace: 'offline' }));
        builder.onResolve({ filter: /vercel-blob-snapshot-storage\.ts$/ }, () => ({ path: 'storage', namespace: 'offline' }));
        builder.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ loader: 'js', contents: args.path === 'storage'
          ? 'export class VercelBlobSnapshotStorage {}'
          : `export const CANONICAL_CONTEXT_DEPENDENCY_FILES = {};
             export const CANONICAL_CONTEXT_CAPTURE_LIMITS = {outputBytes:65536};
             export class CanonicalContextCaptureError extends Error { constructor(code) { super('PRIVATE_CANARY'); this.code=code; } }
             export async function captureShopifyCanonicalContext() { throw ${kind === 'typed'
                ? "new CanonicalContextCaptureError('selected_state_policy_missing_or_blocked')"
                : "new Error('PRIVATE_CANARY https://private.example/credential')"}; }` }));
      } }] });
    const child = spawnSync(process.execPath, [outfile], { encoding: 'utf8', cwd: directory, env: {
      GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'f'.repeat(40), CONTEXT_EXPECTED_COMMIT: 'f'.repeat(40),
      BLOB_READ_WRITE_TOKEN: 'synthetic-test-only', ENGINE_SNAPSHOT_ENCRYPTION_KEY: 'synthetic-test-only',
    } });
    assert.equal(child.status, 1); assert.equal(child.stdout, '');
    assert.ok(!child.stderr.includes('PRIVATE_CANARY')); assert.ok(!child.stderr.includes('private.example'));
    const message = JSON.parse(child.stderr.split('\n')[0]);
    assert.deepEqual(message, { status: 'rejected', code: kind === 'typed' ? 'selected_state_policy_missing_or_blocked' : 'capture_failed_closed',
      scope: 'read_only_canonical_context_no_inventory_or_admission' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

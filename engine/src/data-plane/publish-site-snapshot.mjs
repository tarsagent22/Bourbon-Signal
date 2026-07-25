#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { createSiteSnapshotManifest } from './site-snapshot-contract.mjs';
import { publishSiteSnapshot, rollbackSiteSnapshot } from './site-snapshot-publisher.mjs';
import { VercelBlobObjectStorage } from './vercel-blob-object-storage.mjs';

const execFileAsync = promisify(execFile);

async function walkJson(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkJson(root, fullPath));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(fullPath);
  }
  return files;
}

export async function collectSiteFiles(siteDir) {
  const result = {};
  for (const fullPath of (await walkJson(siteDir)).sort()) {
    const relative = path.relative(siteDir, fullPath).replaceAll('\\', '/');
    result[relative] = await readFile(fullPath, 'utf8');
  }
  return result;
}

export function siteSnapshotMetadata({ stats, appCommit, engineCommit, collectionRunId }) {
  const states = Array.isArray(stats?.stateCoverage?.states) ? stats.stateCoverage.states : [];
  return {
    generatedAt: stats?.generatedAt,
    appCommit,
    engineCommit,
    collectionRunId,
    stateHealth: Object.fromEntries(states.map((state) => [state.state, {
      status: state.status || state.publicStatus || 'unknown',
      signalCount: Number(state.signalCount || 0),
      coverageTier: state.coverageTier || null,
      bestLocationPrecision: state.bestLocationPrecision || null,
    }])),
  };
}

async function gitOutput(projectRoot, args, fallback) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, ...args], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function deriveGitProvenance(projectRoot) {
  const appCommit = process.env.BOURBON_SIGNAL_APP_COMMIT || await gitOutput(projectRoot, ['rev-parse', 'origin/main'], 'unknown-app-commit');
  const head = await gitOutput(projectRoot, ['rev-parse', 'HEAD'], 'unknown-engine-commit');
  const dirtyDiff = await gitOutput(projectRoot, ['diff', '--binary', '--', 'engine/src', 'engine/*.ps1', 'engine/package.json'], '');
  const engineCommit = dirtyDiff ? `${head}-dirty-${createHash('sha256').update(dirtyDiff).digest('hex').slice(0, 12)}` : head;
  return { appCommit, engineCommit };
}

export function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  const guardedRollback = argv.includes('--rollback-if-active');
  const rollbackIfActive = valueAfter('--rollback-if-active');
  if (guardedRollback && (!rollbackIfActive || rollbackIfActive.startsWith('--'))) {
    throw new Error('--rollback-if-active requires a non-empty snapshot identity');
  }
  return {
    siteDir: path.resolve(valueAfter('--site-dir') || path.join(process.cwd(), 'out', 'site')),
    dryRun: argv.includes('--dry-run'),
    rollback: argv.includes('--rollback'),
    guardedRollback,
    rollbackIfActive,
    activate: !argv.includes('--stage'),
  };
}

export async function runPublisher(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.rollback || options.guardedRollback) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required to rollback');
    const storage = new VercelBlobObjectStorage();
    return rollbackSiteSnapshot(storage, options.rollbackIfActive ? { expectedActive: options.rollbackIfActive } : {});
  }
  const files = await collectSiteFiles(options.siteDir);
  const stats = JSON.parse(files['stats.json'] || '{}');
  const projectRoot = path.resolve(options.siteDir, '..', '..', '..');
  const provenance = await deriveGitProvenance(projectRoot);
  const metadata = siteSnapshotMetadata({
    stats,
    ...provenance,
    collectionRunId: process.env.BOURBON_SIGNAL_COLLECTION_RUN_ID || stats.engineGeneratedAt || stats.generatedAt,
  });
  const manifest = createSiteSnapshotManifest(files, metadata);
  if (options.dryRun) return { status: 'dry_run', manifest, fileCount: Object.keys(files).length };
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `snapshot_id=${manifest.snapshotId}\n`, 'utf8');
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required to publish');
  if (!process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY) throw new Error('ENGINE_SNAPSHOT_ENCRYPTION_KEY is required to publish');
  const storage = new VercelBlobObjectStorage();
  const result = await publishSiteSnapshot(storage, files, metadata, {
    encryptionKey: process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY,
    activate: options.activate,
  });
  return { ...result, fileCount: Object.keys(files).length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runPublisher()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exit(1); });
}

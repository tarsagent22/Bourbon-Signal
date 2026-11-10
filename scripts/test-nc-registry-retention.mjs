import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = mkdtempSync(path.join(tmpdir(), 'nc-registry-retention-'));
const source = JSON.parse(readFileSync('src/config/nc-abc-boards.json', 'utf8'));
const registry = path.join(root, 'src/config/nc-abc-boards.json');
const htmlPath = path.join(root, 'official.html');
const mock = path.join(root, 'fetch.mjs');
mkdirSync(path.dirname(registry), { recursive: true });
writeFileSync(mock, `import {readFileSync} from 'node:fs'; globalThis.fetch=async()=>new Response(readFileSync(process.env.NC_REGISTRY_FIXTURE,'utf8'));`);
const official = source.boards.filter(b => b.id !== 'nc-abc-board-261');
function run(boards, stored = source, args = []) {
  writeFileSync(registry, JSON.stringify(stored));
  writeFileSync(htmlPath, '<select name="StoreLocatorBoard">' + boards.map(b => `<option value="${b.sourceId}">${b.label}</option>`).join('') + '</select>');
  return spawnSync(process.execPath, ['--import', mock, path.resolve('scripts/sync-nc-abc-board-registry.mjs'), ...args], { cwd: root, env: { ...process.env, NC_REGISTRY_FIXTURE: htmlPath }, encoding: 'utf8' });
}
try {
  assert.equal(run(official).status, 0, 'reviewed missing Stanley ID is retained');
  assert.notEqual(run(official.slice(1)).status, 0, 'another missing board still blocks validation');
  assert.notEqual(run(official.map((b, i) => i ? b : { ...b, label: 'Changed ABC Board' })).status, 0, 'source label drift still blocks validation');
  assert.notEqual(run(official, { ...source, retainedMissingBoards: [] }).status, 0, 'unreviewed extra registry entries still block validation');
  assert.equal(run(official, source, ['--write']).status, 0);
  const updated = JSON.parse(readFileSync(registry, 'utf8'));
  assert.equal(updated.boards.length, source.boards.length, 'updating cannot discard saved historical IDs');
  assert.deepEqual(updated.retainedMissingBoards, source.retainedMissingBoards);
  console.log('NC registry retention preserves saved IDs and rejects all other source drift.');
} finally { rmSync(root, { recursive: true, force: true }); }

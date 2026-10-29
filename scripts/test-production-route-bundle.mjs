import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Run after next build. Source imports and a successful build cannot detect a
// createRequire(import.meta.url) whose relative JSON file is absent in hosting.
const root = path.resolve(process.argv.find(arg => arg.startsWith('--build-root='))?.slice('--build-root='.length) || process.cwd());
const server = path.join(root, '.next', 'server');
const routes = ['api/coverage', 'api/alerts', 'api/ops/source-scheduler'];
const staging = path.join(root, '.operator', `production-route-bundle-${randomUUID()}`);
const relocated = path.join(staging, 'server');
const sourceData = path.join(root, 'engine', 'data');
const hiddenData = path.join(staging, 'source-data');
assert.equal(path.relative(root, sourceData), path.join('engine', 'data'));
assert.ok(!path.relative(root, hiddenData).startsWith('..'));
assert.equal((await stat(sourceData)).isDirectory(), true);
await mkdir(relocated, { recursive: true });
await cp(path.join(server, 'chunks'), path.join(relocated, 'chunks'), { recursive: true });
await cp(path.join(server, 'webpack-runtime.js'), path.join(relocated, 'webpack-runtime.js'));
for (const route of routes) {
  const destination = path.join(relocated, 'app', route, 'route.js');
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(server, 'app', route, 'route.js'), destination);
}
// Link only installed third-party dependencies, never the engine or source tree.
const { symlink } = await import('node:fs/promises');
await symlink(path.join(root, 'node_modules'), path.join(staging, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const results = [];
let hidden = false;
try {
  // This test must run in an exclusive build checkout (as CI does). Moving the
  // source-data directory also catches absolute source paths left in bundles.
  await rename(sourceData, hiddenData);
  hidden = true;
  for (const route of routes) {
    const target = path.join(relocated, 'app', route, 'route.js');
    const child = spawnSync(process.execPath, ['-e', `
      global.fetch = () => { throw new Error('Route import attempted a network request'); };
      (async () => {
      const route = await require(process.argv[1]);
      const userland = route.routeModule?.userland || route;
      if (typeof userland.GET !== 'function') throw new Error('Built route does not export GET');
      process.stdout.write(JSON.stringify({ imported: true, hasGet: true }));
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `, target], { cwd: staging, env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 });
    results.push({ route: `/${route}`, status: child.status, output: child.stdout.trim(), error: child.stderr.trim() });
  }
} finally {
  if (hidden) await rename(hiddenData, sourceData);
}
assert.equal((await stat(sourceData)).isDirectory(), true, 'Source data was not restored');
const evidence = { checkedAt: new Date().toISOString(), buildId: await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8').catch(() => null),
  relocatedWithoutEngineData: true, originalSourceDataUnavailableDuringImports: true, sourceDataRestored: true, results };
await mkdir(path.join(root, '.operator', 'evidence'), { recursive: true });
await writeFile(path.join(root, '.operator', 'evidence', 'production-route-bundle-smoke.json'), JSON.stringify(evidence, null, 2));
for (const result of results) assert.equal(result.status, 0, `${result.route} failed as a relocated production bundle:\n${result.error}`);
console.log(`Relocated production route imports passed: ${routes.map(route => `/${route}`).join(', ')}; source engine/data was unavailable.`);

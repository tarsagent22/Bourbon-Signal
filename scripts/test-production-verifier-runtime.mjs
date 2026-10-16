import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ENGINE_FEED_COUNT_CONTRACT, ENGINE_FEED_VERIFICATION_HEADER, authorizeEngineFeedVerification } from '../src/lib/engine-feed-verification.ts';

test('production verifier launches through tsx and performs signed public-state probes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-verifier-'));
  const key = 'runtime-fixture-secret'.repeat(2);
  const generatedAt = new Date().toISOString();
  const stats = { generatedAt, stateCount: 2, alertCandidateCount: 0, refreshHealth: { failedStateCount: 0 } };
  const scopes = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/stats') return response.end(JSON.stringify(stats));
    if (url.pathname !== '/api/drops' || !authorizeEngineFeedVerification(url, request.headers[ENGINE_FEED_VERIFICATION_HEADER], key)) {
      response.statusCode = 403; return response.end('{}');
    }
    scopes.push(url.searchParams.get('state'));
    response.end(JSON.stringify({ contractVersion: ENGINE_FEED_COUNT_CONTRACT, state: url.searchParams.get('state'), total: 2 }));
  });
  try {
    await mkdir(path.join(root, 'src/config'), { recursive: true });
    await mkdir(path.join(root, 'engine/out/site'), { recursive: true });
    await writeFile(path.join(root, 'src/config/state-lifecycle.json'), JSON.stringify({ activeStates: ['PA', 'MD-MONTGOMERY'], states: { PA: { publicStatus: 'active' }, 'MD-MONTGOMERY': { publicStatus: 'active' } } }));
    await writeFile(path.join(root, 'engine/out/site/stats.json'), JSON.stringify(stats));
    await writeFile(path.join(root, 'engine/out/site/drops.json'), JSON.stringify({ drops: [] }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const [launcher, script] = packageJson.scripts['verify:production-engine'].split(' ');
    assert.equal(launcher, 'tsx');
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)), fileURLToPath(new URL(`../${script}`, import.meta.url)), '--json'], {
        cwd: root, windowsHide: true, env: { ...process.env, ENGINE_SNAPSHOT_ENCRYPTION_KEY: key,
          BOURBON_SIGNAL_LIVE_BASE_URL: `http://127.0.0.1:${server.address().port}`,
          BOURBON_SIGNAL_VERIFY_STATES: '', BOURBON_SIGNAL_PRODUCTION_VERIFY_ATTEMPTS: '1' },
      });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).ok, true);
    assert.deepEqual(scopes.sort(), ['MD', 'PA']);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

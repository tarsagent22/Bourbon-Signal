import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evaluateCronRegistration } from './lib/release-orchestrator-core.mjs';

const expected = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url))).crons.map(cron => ({ ...cron, host: 'approved.vercel.app' }));
const payload = () => ({ enabled: true, crons: structuredClone(expected), modified: [], undeployed: [] });
test('release admits exactly the complete approved cron set', () => {
  assert.equal(evaluateCronRegistration(payload(), expected).ok, true);
  for (const cron of expected) {
    const missing = payload(); missing.crons = missing.crons.filter(row => row.path !== cron.path);
    assert.equal(evaluateCronRegistration(missing, expected).ok, false, cron.path);
    for (const field of ['schedule', 'host']) {
      const changed = payload(); changed.crons.find(row => row.path === cron.path)[field] = 'wrong';
      assert.equal(evaluateCronRegistration(changed, expected).ok, false);
    }
  }
});
test('release rejects duplicate, unexpected, pending and disabled registrations', () => {
  for (const mutate of [
    p => p.crons.push(p.crons[0]), p => p.crons.push({ path: '/api/unapproved', schedule: '* * * * *' }),
    p => p.modified.push({ path: '/unknown' }), p => p.undeployed.push(expected[1]), p => p.enabled = false,
  ]) { const p = payload(); mutate(p); assert.equal(evaluateCronRegistration(p, expected).ok, false); }
});
for (const file of ['send-approved-newsletter.mjs', 'sync-clerk-members-to-resend.mjs']) {
  test(`${file} is unconditionally retired before reads or network, including apply/replay`, async () => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
    for (const args of [[], ['--apply'], ['--apply', '--limit=999']]) {
      const calls = [];
      const context = vm.createContext({
        process: { argv: ['node', file, ...args], env: { RESEND_API_KEY: 'fixture', CLERK_SECRET_KEY: 'fixture' }, exitCode: 0 },
        console: { error: () => {}, log: () => {} },
        fs: { existsSync: () => { calls.push('read'); return false; } },
        fetch: () => { calls.push('network'); throw new Error('forbidden fixture network'); },
      });
      await vm.runInContext(`(async () => { ${source}\n })()`, context).catch(() => {});
      assert.deepEqual(calls, [], 'retirement must precede environment-file and provider access');
      assert.equal(context.process.exitCode, 1);
    }
  });
}
test('legacy deploy refuses before any executable or credential access', () => {
  const source = readFileSync(new URL('deploy.sh', import.meta.url), 'utf8');
  const run = spawnSync('bash', ['-c', `npm() { printf 'FORBIDDEN npm\\n'; return 87; }; git() { printf 'FORBIDDEN git\\n'; return 87; }; npx() { printf 'FORBIDDEN npx\\n'; return 87; }; export VERCEL_TOKEN=fixture; source scripts/deploy.sh`], { encoding: 'utf8' });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 1);
  assert.doesNotMatch(run.stdout + run.stderr, /FORBIDDEN/);
  assert.match(run.stdout + run.stderr, /retired/i);
  assert.match(source, /retired/i);
  assert.doesNotMatch(source, /git (add|commit|push)|npx|VERCEL_TOKEN|\.vercel-token/);
});

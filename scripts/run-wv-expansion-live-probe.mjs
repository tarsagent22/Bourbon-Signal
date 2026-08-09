import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { calculateStateExpansionMetrics } from './lib/state-expansion-runtime.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const engine = path.join(root, 'engine');
const packetPath = path.join(root, '.operator', 'engine-expansions', 'WV', 'task-packet.json');
const packet = JSON.parse(await readFile(packetPath, 'utf8'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: options.timeout || 30 * 60_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

let reusableLiveProbe = false;
try {
  const priorReport = JSON.parse(await readFile(path.join(engine, 'out', 'states', 'WV.json'), 'utf8'));
  const priorDrops = JSON.parse(await readFile(path.join(engine, 'out', 'site', 'drops.json'), 'utf8'));
  const observedAt = Math.max(...priorReport.signals.filter((row) => row.eventType === 'barrel_pick_signal').map((row) => Date.parse(row.observedAt || '')));
  reusableLiveProbe = priorReport.status === 'useful'
    && Date.now() - observedAt <= 10 * 60_000
    && (priorDrops.drops || priorDrops).filter((row) => row.state === 'WV').length === 6;
} catch {}

if (!reusableLiveProbe) {
  run(process.execPath, ['src/build-bible.mjs'], { cwd: engine, timeout: 5 * 60_000 });
  run(process.execPath, ['src/refresh-site.mjs'], {
    cwd: engine,
    timeout: 30 * 60_000,
    env: {
      BOURBON_SIGNAL_RUN_STATES: 'WV',
      BOURBON_SIGNAL_STATE_SCHEDULER: '0',
      BOURBON_SIGNAL_FORCE_SOURCE_RUN: '1',
      BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0',
      BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS: '1',
      BOURBON_SIGNAL_AUTO_DEPLOY: '0',
    },
  });
}

const report = JSON.parse(await readFile(path.join(engine, 'out', 'states', 'WV.json'), 'utf8'));
const siteDropsPayload = JSON.parse(await readFile(path.join(engine, 'out', 'site', 'drops.json'), 'utf8'));
const siteDrops = (siteDropsPayload.drops || siteDropsPayload).filter((row) => row.state === 'WV');
const barrelSignals = report.signals.filter((row) => row.eventType === 'barrel_pick_signal');
const directorySignals = report.signals.filter((row) => row.eventType === 'retailer_store_location');

assert.equal(report.status, 'useful');
assert.equal(barrelSignals.length, 6);
assert.equal(directorySignals.length, 180);
assert.equal(report.signals.filter((row) => row.canAlertAsInventory || row.canAlertAsWatch).length, 0);
assert.equal(siteDrops.length, 6);
assert.equal(siteDrops.filter((row) => row.canAlertAsInventory || row.canAlertAsWatch || row.eligibleForDelivery || row.eligibleForEmail || row.eligibleForSms).length, 0);
assert.equal(siteDrops.filter((row) => row.sourceStale || row.stale).length, 0);
assert.ok(siteDrops.every((row) => /not live shelf inventory/i.test(row.inventoryCaveat || '')));

const metrics = calculateStateExpansionMetrics({
  stateCode: 'WV',
  stateReport: report,
  siteDrops: siteDropsPayload,
  coverageState: { layers: { known: 180 }, representedAreaCount: 1 },
  knownStoreFloor: 180,
  representedAreasFloor: 1,
});
assert.ok(metrics.knownStores >= 180);
assert.equal(metrics.liveStores, 0);
assert.equal(metrics.alertGradeStores, 0);
assert.ok(metrics.representedAreas >= 1);
assert.equal(metrics.freshExactStoreDrops, 0);
assert.equal(metrics.alertableStaleRows, 0);

const outPath = path.resolve(root, packet.artifacts.acceptanceEvidence);
await mkdir(path.dirname(outPath), { recursive: true });
const timings = (await readFile(path.join(root, '.operator', 'engine-expansions', 'WV', 'timings.jsonl'), 'utf8'))
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const reservation = [...timings].reverse().find((row) => row.runId === packet.runId && row.phase === 'live-probe' && row.outcome === 'running');
assert.ok(reservation, 'Live-probe phase reservation is missing.');
const evidence = {
  schemaVersion: 'bourbon-signal-engine-expansion-acceptance-v1',
  evidenceId: randomUUID(),
  state: 'WV',
  runId: packet.runId,
  packetDigest: reservation.packetDigest,
  phase: 'live-probe',
  headCommit: reservation.headCommit,
  diffDigest: reservation.diffDigest,
  capturedAt: new Date().toISOString(),
  ...metrics,
};
await writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ state: 'WV', metrics, evidence: path.relative(root, outPath) })}\n`);

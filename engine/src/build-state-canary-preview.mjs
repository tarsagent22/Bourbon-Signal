#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function asArray(value) { return Array.isArray(value) ? value : []; }
function clone(value) { return structuredClone(value || {}); }

export function buildCanaryPreviewPayload({ base, state, candidateDrops }) {
  const normalizedState = String(state || '').toUpperCase();
  const candidateRows = asArray(candidateDrops);
  if (!normalizedState || candidateRows.some((row) => String(row?.state || '').toUpperCase() !== normalizedState)) {
    throw new Error('Candidate preview drops must all use the requested state.');
  }
  const drops = clone(base?.drops);
  drops.drops = [...asArray(drops.drops), ...candidateRows];
  drops.count = drops.drops.length;
  const stateIndex = clone(base?.stateIndex);
  const states = asArray(stateIndex.states).filter((entry) => entry.state !== normalizedState);
  states.push({ state: normalizedState, file: `states/${normalizedState}/drops.json`, count: candidateRows.length });
  states.sort((a, b) => String(a.state).localeCompare(String(b.state)));
  stateIndex.states = states;
  stateIndex.stateCount = states.length;
  stateIndex.totalCount = drops.drops.length;
  const manifest = clone(base?.manifest);
  manifest.files = { ...(manifest.files || {}), stateDrops: manifest.files?.stateDrops || 'states/index.json' };
  manifest.statePartitions = states;
  const alerts = clone(base?.alerts);
  alerts.alerts = asArray(alerts.alerts).filter((row) => String(row?.state || '').toUpperCase() !== normalizedState);
  alerts.previewAlertDeliveryDisabled = true;
  const stats = clone(base?.stats);
  const coverage = clone(stats.stateCoverage);
  const coverageStates = asArray(coverage.states).filter((entry) => entry.state !== normalizedState);
  coverageStates.push({ state: normalizedState, status: 'canary_preview', signalCount: candidateRows.length, previewOnly: true });
  coverage.states = coverageStates;
  stats.stateCoverage = coverage;
  stats.stateCount = coverageStates.length;
  return {
    manifest,
    drops,
    stateIndex,
    stateDrops: { state: normalizedState, count: candidateRows.length, drops: candidateRows },
    alerts,
    stats,
    previewPolicy: {
      schemaVersion: 1,
      state: normalizedState,
      mode: 'canary_preview',
      alertDeliveryEnabled: false,
      productionSnapshotPublicationEnabled: false,
      productionDeploymentEnabled: false,
    },
  };
}

async function readJson(file, fallback = {}) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

export async function buildStateCanaryPreview({ state, candidateDrops, lifecycleConfig = null, siteDir = path.resolve('out', 'site'), outDir = path.resolve('out', 'canary', String(state || '').toUpperCase()) } = {}) {
  const base = {
    manifest: await readJson(path.join(siteDir, 'manifest.json')),
    drops: await readJson(path.join(siteDir, 'drops.json'), { drops: [] }),
    stateIndex: await readJson(path.join(siteDir, 'states', 'index.json'), { states: [], totalCount: 0, stateCount: 0 }),
    alerts: await readJson(path.join(siteDir, 'alerts.json'), { alerts: [] }),
    stats: await readJson(path.join(siteDir, 'stats.json'), {}),
  };
  const preview = buildCanaryPreviewPayload({ base, state, candidateDrops });
  const lifecyclePreview = lifecycleConfig ? clone(lifecycleConfig) : null;
  if (lifecyclePreview?.states?.[preview.stateDrops.state]) {
    lifecyclePreview.activeStates = Array.from(new Set([...(lifecyclePreview.activeStates || []), preview.stateDrops.state]));
    lifecyclePreview.states[preview.stateDrops.state] = {
      ...lifecyclePreview.states[preview.stateDrops.state],
      publicStatus: 'active',
      promotionStage: 'canary',
    };
  }
  await cp(siteDir, outDir, { recursive: true });
  await mkdir(path.join(outDir, 'states', preview.stateDrops.state), { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(preview.manifest, null, 2)),
    writeFile(path.join(outDir, 'drops.json'), JSON.stringify(preview.drops, null, 2)),
    writeFile(path.join(outDir, 'states', 'index.json'), JSON.stringify(preview.stateIndex, null, 2)),
    writeFile(path.join(outDir, 'states', preview.stateDrops.state, 'drops.json'), JSON.stringify(preview.stateDrops, null, 2)),
    writeFile(path.join(outDir, 'alerts.json'), JSON.stringify(preview.alerts, null, 2)),
    writeFile(path.join(outDir, 'stats.json'), JSON.stringify(preview.stats, null, 2)),
    writeFile(path.join(outDir, 'canary-preview-policy.json'), JSON.stringify(preview.previewPolicy, null, 2)),
    ...(lifecyclePreview ? [writeFile(path.join(outDir, 'lifecycle-preview.json'), JSON.stringify(lifecyclePreview, null, 2))] : []),
  ]);
  return { outDir, preview };
}

function argValue(flag) {
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const state = String(argValue('--state') || '').toUpperCase();
  const candidateFile = argValue('--candidate-drops');
  if (!state || !candidateFile) throw new Error('Usage: build-state-canary-preview --state=<STATE> --candidate-drops=<site-drop-json>');
  const payload = await readJson(path.resolve(candidateFile), []);
  const candidateDrops = asArray(payload?.drops || payload);
  const lifecycleConfig = await readJson(path.resolve(argValue('--config') || path.join('..', 'src', 'config', 'state-lifecycle.json')), null);
  const result = await buildStateCanaryPreview({ state, candidateDrops, lifecycleConfig, siteDir: path.resolve(argValue('--site-dir') || path.join('out', 'site')), outDir: path.resolve(argValue('--out-dir') || path.join('out', 'canary', state, 'site')) });
  console.log(JSON.stringify({ state, outDir: result.outDir, alertsDisabled: true, productionSnapshotTouched: false, productionDeploymentEnabled: false }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });

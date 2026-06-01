import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';
import { bestPrecision, LOCATION_PROFILES } from './location-precision.mjs';

const OUT = path.resolve('out');
const STATES_OUT = path.join(OUT, 'states');
const STATE_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_STATE_TIMEOUT_MS || 180_000);

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function markStaleReport(report, config, reason) {
  const now = new Date().toISOString();
  const priorStatus = String(report.status || '').replace(/^(stale_)+/, '') || 'previous_report';
  const staleSignals = (report.signals || []).map((signal) => ({
    ...signal,
    stale: true,
    staleReason: reason,
    raw: { ...(signal.raw || {}), staleFallback: true, staleReason: reason, staleFallbackAt: now }
  }));
  const roadblocks = [
    ...(report.roadblocks || []).filter((r) => String(r.status || '') !== 'stale_previous_report'),
    {
      state: config.id,
      source: `${config.label} refresh fallback`,
      url: `out/states/${config.id}.json`,
      status: 'stale_previous_report',
      error: reason,
      nextRoute: 'Keep last known good state report in the site export, then inspect/fix the timed-out source without blocking other states.'
    }
  ];
  return {
    ...report,
    state: report.state || config.id,
    label: report.label || config.label,
    tier: report.tier || config.tier,
    strategy: report.strategy || config.strategy,
    cadence: report.cadence || config.cadence,
    value: report.value || config.value,
    stale: true,
    staleReason: reason,
    staleFallbackAt: now,
    previousFinishedAt: report.previousFinishedAt || report.finishedAt || null,
    startedAt: report.startedAt || now,
    finishedAt: now,
    signals: staleSignals,
    roadblocks,
    status: `stale_${priorStatus}`
  };
}

function failedReport(config, reason) {
  const now = new Date().toISOString();
  return {
    state: config.id,
    label: config.label,
    tier: config.tier,
    strategy: config.strategy,
    cadence: config.cadence,
    value: config.value,
    locationProfile: LOCATION_PROFILES[config.id] || null,
    startedAt: now,
    finishedAt: now,
    sources: [],
    signals: [],
    roadblocks: [{
      state: config.id,
      source: `${config.label} refresh`,
      url: null,
      status: 'failed_no_previous_report',
      error: reason,
      nextRoute: 'Collector failed and no previous state report exists; fix this source before relying on state coverage.'
    }],
    status: 'failed_no_previous_report'
  };
}

function runStateChild(config) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    let settled = false;
    const child = spawn(process.execPath, ['src/run-state.mjs', config.id], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      fn(value);
    };
    const timeout = STATE_TIMEOUT_MS > 0 ? setTimeout(() => {
      try { child.kill(); } catch {}
      const error = new Error(`${config.id} timed out after ${Math.round(STATE_TIMEOUT_MS / 1000)}s`);
      error.result = { state: config.id, startedAt, finishedAt: new Date().toISOString(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) };
      finish(reject, error);
    }, STATE_TIMEOUT_MS) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', (error) => finish(reject, error));
    child.on('close', async (code) => {
      if (code !== 0) {
        const error = new Error(`${config.id} collector exited ${code}`);
        error.result = { state: config.id, startedAt, finishedAt: new Date().toISOString(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) };
        finish(reject, error);
        return;
      }
      finish(resolve);
    });
  });
}

async function collectStateResilient(config) {
  const statePath = path.join(STATES_OUT, `${config.id}.json`);
  try {
    await runStateChild(config);
    const report = await readJson(statePath, null);
    if (!report) throw new Error(`${config.id} collector finished but did not write ${statePath}`);
    return report;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const previous = await readJson(statePath, null);
    const report = previous ? markStaleReport(previous, config, reason) : failedReport(config, reason);
    await writeFile(statePath, JSON.stringify(report, null, 2));
    return report;
  }
}

function signalScore(report) {
  const useful = report.sources.filter((s) => s.ok && (s.matchedBottleCount || s.pdfLinkCount)).length;
  const reachable = report.sources.filter((s) => s.ok).length;
  if (report.status === 'useful') return `useful (${useful}/${report.sources.length} sources produced bottle/doc signals)`;
  if (reachable) return `reachable; needs deeper parser (${reachable}/${report.sources.length} reachable)`;
  return 'blocked by fetch/API access';
}

function stateMarkdown(report) {
  const sourceLines = report.sources.map((s) => {
    const bits = [`${s.ok ? '✅' : '⚠️'} ${s.label}`, `${s.status}`, `${s.bytes} bytes`];
    if (s.matchedBottleCount) bits.push(`${s.matchedBottleCount} bottle matches`);
    if (s.pdfLinkCount) bits.push(`${s.pdfLinkCount} docs`);
    if (s.error) bits.push(`error: ${s.error}`);
    return `  - ${bits.join(' · ')}\n    ${s.url}`;
  }).join('\n');

  const topSignals = report.signals.slice(0, 8).map((s) => {
    const bottle = s.canonicalName ? ` — ${s.canonicalName}` : '';
    const docs = s.documentLinks?.length ? ` (${s.documentLinks.length} linked docs)` : '';
    const summary = s.readableSummary ? `\n    ${s.readableSummary.replace(/\s+/g, ' ').slice(0, 500)}` : '';
    return `  - ${s.eventType}${bottle}${docs}\n    ${s.sourceLabel}: ${s.sourceUrl}${summary}`;
  }).join('\n') || '  - No normalized signals yet.';

  const roadblocks = report.roadblocks.map((r) => `  - ${r.source}: ${r.status || ''} ${r.error || ''}\n    ${r.url}\n    Next: ${r.nextRoute}`).join('\n') || '  - None logged.';

  return `## ${report.label} (${report.state})\n\n- Tier: ${report.tier}\n- Strategy: ${report.strategy}\n- Recommended cadence: ${report.cadence}\n- Status: ${signalScore(report)}\n- User value: ${report.value}\n\nSources checked:\n${sourceLines}\n\nTop normalized signals:\n${topSignals}\n\nRoadblocks / next routes:\n${roadblocks}\n`;
}

async function main() {
  await mkdir(STATES_OUT, { recursive: true });
  const allReports = [];
  const allSignals = [];
  const allRoadblocks = [];

  for (const config of STATE_SOURCES) {
    console.log(`Collecting ${config.id} — ${config.label}`);
    const report = await collectStateResilient(config);
    allReports.push(report);
    allSignals.push(...report.signals);
    allRoadblocks.push(...report.roadblocks);
    console.log(`  ${report.status}: ${report.signals.length} signals, ${report.roadblocks.length} roadblocks${report.stale ? ' (stale fallback)' : ''}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    stateCount: allReports.length,
    signalCount: allSignals.length,
    roadblockCount: allRoadblocks.length,
    degradedStateCount: allReports.filter((r) => r.stale || /^failed_/.test(String(r.status || ''))).length,
    staleStateCount: allReports.filter((r) => r.stale).length,
    failedStateCount: allReports.filter((r) => /^failed_/.test(String(r.status || ''))).length,
    states: allReports.map((r) => ({
      state: r.state,
      label: r.label,
      tier: r.tier,
      status: r.status,
      stale: Boolean(r.stale),
      staleReason: r.staleReason || null,
      staleFallbackAt: r.staleFallbackAt || null,
      previousFinishedAt: r.previousFinishedAt || null,
      sourceCount: r.sources.length,
      reachableSourceCount: r.sources.filter((s) => s.ok).length,
      signalCount: r.signals.length,
      roadblockCount: r.roadblocks.length,
      targetLocationPrecision: LOCATION_PROFILES[r.state]?.target || null,
      bestLocationPrecision: bestPrecision(r.signals),
      strategy: r.strategy
    }))
  };

  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(OUT, 'signals.json'), JSON.stringify({ generatedAt: summary.generatedAt, signals: allSignals }, null, 2));
  await writeFile(path.join(OUT, 'roadblocks.json'), JSON.stringify({ generatedAt: summary.generatedAt, roadblocks: allRoadblocks }, null, 2));

  const readable = `# Bourbon Signal Standalone Engine Run\n\nGenerated: ${summary.generatedAt}\n\nStates covered: ${summary.stateCount}\nNormalized signals: ${summary.signalCount}\nRoadblocks logged: ${summary.roadblockCount}\n\n${allReports.map(stateMarkdown).join('\n')}\n`;
  await writeFile(path.join(OUT, 'readable.md'), readable);

  const roadblocksMd = `# Bourbon Signal Engine Roadblocks\n\nGenerated: ${summary.generatedAt}\n\n${allRoadblocks.map((r) => `## ${r.state} — ${r.source}\n\n- URL: ${r.url}\n- Status: ${r.status}\n- Error: ${r.error}\n- Next route: ${r.nextRoute}\n`).join('\n') || 'No roadblocks logged.'}\n`;
  await writeFile(path.join(OUT, 'roadblocks.md'), roadblocksMd);
  console.log(`Done: ${summary.stateCount} states, ${summary.signalCount} signals, ${summary.roadblockCount} roadblocks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

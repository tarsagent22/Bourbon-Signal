import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';
import { bestPrecision, LOCATION_PROFILES } from './location-precision.mjs';
import { customerStateLabel, getStateLifecycle, sourceStateLabel } from './state-lifecycle.mjs';
import { ensureBrowserCdp, DEFAULT_CDP_URL } from './core/browser-session.mjs';
import { confidenceForSignal } from './confidence-policy.mjs';

const OUT = path.resolve('out');
const STATES_OUT = path.join(OUT, 'states');
const STATE_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_STATE_TIMEOUT_MS || 180_000);
const STATE_TIMEOUT_OVERRIDES_MS = {
  // VA and IN can legitimately do broad store-level inventory work. Give them
  // enough room in the full scheduled run so they do not regress to stale
  // fallback while still keeping hard failure bounds.
  VA: Number(process.env.BOURBON_SIGNAL_VA_STATE_TIMEOUT_MS || 420_000),
  IN: Number(process.env.BOURBON_SIGNAL_IN_STATE_TIMEOUT_MS || 420_000),
  // NC board intelligence + county inventory probes can cross the generic
  // timeout during normal successful runs. Give it the same scheduled-run
  // budget as other broad inventory states so stale fallback only indicates a
  // real collector problem, not a too-short parent watchdog.
  NC: Number(process.env.BOURBON_SIGNAL_NC_STATE_TIMEOUT_MS || 420_000),
  // New control/county expansion states can fan out across official CSV/API rows.
  IA: Number(process.env.BOURBON_SIGNAL_IA_STATE_TIMEOUT_MS || 300_000),
  UT: Number(process.env.BOURBON_SIGNAL_UT_STATE_TIMEOUT_MS || 300_000),
  ID: Number(process.env.BOURBON_SIGNAL_ID_STATE_TIMEOUT_MS || 240_000),
  'MD-MONTGOMERY': Number(process.env.BOURBON_SIGNAL_MD_MONTGOMERY_STATE_TIMEOUT_MS || 300_000),
  // TN/SC retailer meshes occasionally need longer than the generic 180s
  // parent watchdog, especially when CityHive/backing retailer endpoints are
  // slow or retrying. Let them finish instead of publishing stale fallbacks.
  TN: Number(process.env.BOURBON_SIGNAL_TN_STATE_TIMEOUT_MS || 420_000),
  SC: Number(process.env.BOURBON_SIGNAL_SC_STATE_TIMEOUT_MS || 420_000),
  // Kentucky official distillery/release-watch probes can cross the generic
  // 180s scheduled-run watchdog during normal successful runs. Give it enough
  // room so a slow official-source pass does not publish a stale fallback.
  KY: Number(process.env.BOURBON_SIGNAL_KY_STATE_TIMEOUT_MS || 300_000)
};
const BROWSER_PREFLIGHT_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_BROWSER_PREFLIGHT_MAX_AGE_MS || 6 * 60 * 60_000);
const BROWSER_PREFLIGHT_ENABLED = process.env.BOURBON_SIGNAL_BROWSER_PREFLIGHT !== '0' && !process.argv.includes('--skip-browser-preflight');

const BROWSER_PREFLIGHT_JOBS = [
  {
    id: 'ohlq',
    label: 'Ohio OHLQ browser availability bootstrap',
    artifact: path.join(OUT, 'browser', 'ohlq-availability.json'),
    command: ['src/ohlq-browser-collector.mjs'],
    outEnv: 'OHLQ_OUT_FILE',
    validateArtifact: validateOhlqArtifact
  },
  {
    id: 'pa-fwgs',
    label: 'Pennsylvania FWGS browser/store inventory bootstrap',
    artifact: path.join(OUT, 'browser', 'fwgs-store-inventory.json'),
    command: ['src/fwgs-browser-full.mjs'],
    timeoutMs: Number(process.env.BOURBON_SIGNAL_FWGS_FULL_PREFLIGHT_TIMEOUT_MS || 900_000),
    outEnv: 'FWGS_OUT_FILE',
    validateArtifact: validateFwgsArtifact
  },
  {
    id: 'browser-discovery',
    label: 'Generic difficult-source browser/API discovery bootstrap',
    artifact: path.join(OUT, 'browser', 'browser-discovery-summary.json'),
    command: ['src/browser-source-discovery.mjs']
  }
];

const MIN_FWGS_POSITIVE_ROWS = Number(process.env.BOURBON_SIGNAL_MIN_FWGS_POSITIVE_ROWS || 1000);
const MIN_OHLQ_OK_PRODUCTS = Number(process.env.BOURBON_SIGNAL_MIN_OHLQ_OK_PRODUCTS || 1);

function stateTimeoutMs(config) {
  return STATE_TIMEOUT_OVERRIDES_MS[config.id] || STATE_TIMEOUT_MS;
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function fileFreshEnough(file, maxAgeMs) {
  try {
    const { stat } = await import('node:fs/promises');
    const info = await stat(file);
    return Date.now() - info.mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}

function validateFwgsArtifact(payload) {
  const positiveRows = Number(payload?.summary?.positiveInventoryRowCount || 0);
  const locations = Number(payload?.summary?.locationCount || 0);
  if (positiveRows < MIN_FWGS_POSITIVE_ROWS) {
    return { ok: false, reason: `FWGS artifact has ${positiveRows} positive rows across ${locations} stores; minimum is ${MIN_FWGS_POSITIVE_ROWS}. Keeping previous full artifact.` };
  }
  return { ok: true, reason: `FWGS artifact accepted: ${positiveRows} positive rows across ${locations} stores.` };
}

function validateOhlqArtifact(payload) {
  const okProducts = Number(payload?.summary?.okProductCount || 0);
  const inventoryRows = Number(payload?.summary?.inventoryRowCount || 0);
  if (okProducts < MIN_OHLQ_OK_PRODUCTS || inventoryRows <= 0) {
    return { ok: false, reason: `OHLQ artifact has ${okProducts} successful products and ${inventoryRows} inventory rows; likely blocked by Cloudflare/session. Keeping previous artifact.` };
  }
  return { ok: true, reason: `OHLQ artifact accepted: ${okProducts} successful products, ${inventoryRows} inventory rows.` };
}

function runNodeScript(command, timeoutMs = Number(process.env.BOURBON_SIGNAL_BROWSER_PREFLIGHT_TIMEOUT_MS || 180_000), extraEnv = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(process.execPath, command, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = timeoutMs > 0 ? setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve({ ok: false, startedAt, finishedAt: new Date().toISOString(), code: 'timeout', stdout: stdout.slice(-4000), stderr: stderr.slice(-4000), error: `Timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ok: false, startedAt, finishedAt: new Date().toISOString(), code: 'error', stdout: stdout.slice(-4000), stderr: stderr.slice(-4000), error: error.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ok: code === 0, startedAt, finishedAt: new Date().toISOString(), code, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000), error: code === 0 ? null : `Exited ${code}` });
    });
  });
}

async function runGuardedBrowserPreflightJob(job) {
  const artifactLabel = path.relative(process.cwd(), job.artifact).replace(/\/g, '/');
  const needsBrowser = /browser|ohlq|fwgs/i.test(`${job.id} ${job.label}`);
  let browser = null;
  if (needsBrowser) browser = await ensureBrowserCdp(DEFAULT_CDP_URL);
  if (!job.outEnv || !job.validateArtifact) {
    const result = await runNodeScript(job.command, job.timeoutMs);
    return { id: job.id, label: job.label, artifact: artifactLabel, browser, status: result.ok ? 'refreshed' : 'failed_non_blocking', ...result };
  }

  const tempArtifact = `${job.artifact}.candidate-${Date.now()}.json`;
  const result = await runNodeScript(job.command, job.timeoutMs, { [job.outEnv]: tempArtifact });
  if (!result.ok) {
    await rm(tempArtifact, { force: true }).catch(() => {});
    return { id: job.id, label: job.label, artifact: artifactLabel, browser, status: 'failed_non_blocking', preservedPreviousArtifact: true, ...result };
  }

  const candidate = await readJson(tempArtifact, null);
  const validation = job.validateArtifact(candidate);
  if (!validation.ok) {
    await rm(tempArtifact, { force: true }).catch(() => {});
    return {
      id: job.id,
      label: job.label,
      artifact: artifactLabel,
      browser,
      ...result,
      status: 'rejected_candidate_preserved_previous',
      ok: false,
      preservedPreviousArtifact: true,
      validation: validation.reason
    };
  }

  await writeFile(job.artifact, JSON.stringify(candidate, null, 2));
  await rm(tempArtifact, { force: true }).catch(() => {});
  return {
    id: job.id,
    label: job.label,
    artifact: artifactLabel,
    browser,
    status: 'refreshed',
    validation: validation.reason,
    ...result
  };
}

async function runBrowserPreflight() {
  const results = [];
  if (!BROWSER_PREFLIGHT_ENABLED) {
    return { generatedAt: new Date().toISOString(), enabled: false, results };
  }
  await mkdir(path.join(OUT, 'browser'), { recursive: true });
  for (const job of BROWSER_PREFLIGHT_JOBS) {
    const fresh = await fileFreshEnough(job.artifact, BROWSER_PREFLIGHT_MAX_AGE_MS);
    if (fresh && process.env.BOURBON_SIGNAL_FORCE_BROWSER_PREFLIGHT !== '1') {
      results.push({ id: job.id, label: job.label, artifact: path.relative(process.cwd(), job.artifact).replace(/\\/g, '/'), status: 'fresh_artifact_reused' });
      continue;
    }
    console.log(`Browser preflight: ${job.label}`);
    results.push(await runGuardedBrowserPreflightJob(job));
  }
  const payload = { generatedAt: new Date().toISOString(), enabled: true, maxAgeMs: BROWSER_PREFLIGHT_MAX_AGE_MS, results };
  await writeFile(path.join(OUT, 'browser-refresh-status.json'), JSON.stringify(payload, null, 2));
  return payload;
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
    const timeoutMs = stateTimeoutMs(config);
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
    const timeout = timeoutMs > 0 ? setTimeout(() => {
      try { child.kill(); } catch {}
      const error = new Error(`${config.id} timed out after ${Math.round(timeoutMs / 1000)}s`);
      error.result = { state: config.id, startedAt, finishedAt: new Date().toISOString(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) };
      finish(reject, error);
    }, timeoutMs) : null;
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

function buildSourceHealth(summary, reports, browserPreflight) {
  const states = reports.map((report) => {
    const sourceCount = report.sources?.length || 0;
    const reachable = (report.sources || []).filter((s) => s.ok).length;
    const signalProducing = (report.sources || []).filter((s) => s.ok && ((s.matchedBottleCount || 0) > 0 || (s.pdfLinkCount || 0) > 0 || (s.documentLinkCount || 0) > 0 || /inventory|release|catalog|health|location/i.test(String(s.signalType || '')))).length;
    const storeLevelSignals = (report.signals || []).filter((s) => s.locationPrecision === 'store_level').length;
    const actionableInventorySignals = (report.signals || []).filter((s) => s.locationPrecision === 'store_level' && (s.canAlertAsInventory || confidenceForSignal(s).canAlertAsInventory)).length;
    return {
      state: report.state,
      label: report.label,
      status: report.status,
      stale: Boolean(report.stale),
      staleReason: report.staleReason || null,
      sourceCount,
      reachableSourceCount: reachable,
      signalProducingSourceCount: signalProducing,
      signalCount: report.signals?.length || 0,
      storeLevelSignalCount: storeLevelSignals,
      actionableInventorySignalCount: actionableInventorySignals,
      roadblockCount: report.roadblocks?.length || 0,
      targetLocationPrecision: LOCATION_PROFILES[report.state]?.target || null,
      bestLocationPrecision: bestPrecision(report.signals || []),
      topRoadblocks: (report.roadblocks || []).slice(0, 5).map((r) => ({ source: r.source, status: r.status, error: r.error, nextRoute: r.nextRoute }))
    };
  });
  const health = {
    generatedAt: summary.generatedAt,
    status: summary.failedStateCount ? 'failed_states_present' : summary.staleStateCount ? 'degraded_with_stale_fallbacks' : 'healthy',
    browserPreflight,
    totals: {
      stateCount: states.length,
      degradedStateCount: summary.degradedStateCount,
      staleStateCount: summary.staleStateCount,
      failedStateCount: summary.failedStateCount,
      signalCount: summary.signalCount,
      roadblockCount: summary.roadblockCount,
      actionableInventorySignalCount: states.reduce((sum, state) => sum + state.actionableInventorySignalCount, 0)
    },
    states
  };
  const markdown = `# Bourbon Signal Engine Source Health\n\nGenerated: ${health.generatedAt}\n\nStatus: ${health.status}\n\n## Browser preflight\n\n${(browserPreflight?.results || []).map((r) => `- ${r.label}: ${r.status}${r.error ? ` — ${r.error}` : ''}`).join('\n') || '- Disabled or not run.'}\n\n## State health\n\n${states.map((s) => `### ${s.state} — ${s.label}\n\n- Status: ${s.status}${s.stale ? ` (${s.staleReason})` : ''}\n- Sources: ${s.reachableSourceCount}/${s.sourceCount} reachable, ${s.signalProducingSourceCount} signal-producing\n- Signals: ${s.signalCount}; store-level: ${s.storeLevelSignalCount}; actionable inventory: ${s.actionableInventorySignalCount}\n- Precision: ${s.bestLocationPrecision || 'blocked'} / target ${s.targetLocationPrecision || 'unknown'}\n- Roadblocks: ${s.roadblockCount}\n`).join('\n')}`;
  return { health, markdown };
}

async function main() {
  await mkdir(STATES_OUT, { recursive: true });
  const browserPreflight = await runBrowserPreflight();
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
    states: allReports.map((r) => {
      const lifecycle = getStateLifecycle(r.state);
      return {
        state: r.state,
        label: customerStateLabel(r.state, r.label),
        sourceLabel: sourceStateLabel(r.state, r.label),
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
        strategy: r.strategy,
        publicStatus: lifecycle?.publicStatus || null,
        lifecycle: lifecycle?.lifecycle || null,
        coverageTier: lifecycle?.coverageTier || null,
        refinementLevel: lifecycle?.refinementLevel || null,
        customerAreaLabel: lifecycle?.customerAreaLabel || null,
        customerSummary: lifecycle?.customerSummary || null
      };
    })
  };

  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(OUT, 'signals.json'), JSON.stringify({ generatedAt: summary.generatedAt, signals: allSignals }, null, 2));
  await writeFile(path.join(OUT, 'roadblocks.json'), JSON.stringify({ generatedAt: summary.generatedAt, roadblocks: allRoadblocks }, null, 2));
  const sourceHealth = buildSourceHealth(summary, allReports, browserPreflight);
  await writeFile(path.join(OUT, 'source-health.json'), JSON.stringify(sourceHealth.health, null, 2));
  await writeFile(path.join(OUT, 'source-health.md'), sourceHealth.markdown);

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

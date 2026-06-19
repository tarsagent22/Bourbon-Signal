import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';
import { bestPrecision, LOCATION_PROFILES } from './location-precision.mjs';
import { customerStateLabel, getStateLifecycle, sourceStateLabel } from './state-lifecycle.mjs';

const OUT = path.resolve('out');
const STATES_OUT = path.join(OUT, 'states');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function sourceSignalProducing(source = {}) {
  return Boolean(
    source.ok && (
      Number(source.matchedBottleCount || 0) > 0
      || Number(source.pdfLinkCount || 0) > 0
      || Number(source.documentLinkCount || 0) > 0
      || /inventory|release|catalog|health|location/i.test(String(source.signalType || ''))
    )
  );
}

function stateSummary(report) {
  const lifecycle = getStateLifecycle(report.state);
  const sources = report.sources || [];
  const signals = report.signals || [];
  const roadblocks = report.roadblocks || [];
  return {
    state: report.state,
    label: customerStateLabel(report.state, report.label),
    sourceLabel: sourceStateLabel(report.state, report.label),
    tier: report.tier,
    status: report.status,
    stale: Boolean(report.stale),
    staleReason: report.staleReason || null,
    staleFallbackAt: report.staleFallbackAt || null,
    previousFinishedAt: report.previousFinishedAt || null,
    sourceCount: sources.length,
    reachableSourceCount: sources.filter((s) => s.ok).length,
    signalProducingSourceCount: sources.filter(sourceSignalProducing).length,
    signalCount: signals.length,
    storeLevelSignalCount: signals.filter((s) => s.locationPrecision === 'store_level').length,
    actionableInventorySignalCount: signals.filter((s) => s.canAlertAsInventory && s.locationPrecision === 'store_level').length,
    roadblockCount: roadblocks.length,
    targetLocationPrecision: LOCATION_PROFILES[report.state]?.target || null,
    bestLocationPrecision: bestPrecision(signals),
    strategy: report.strategy,
    publicStatus: lifecycle?.publicStatus || null,
    lifecycle: lifecycle?.lifecycle || null,
    coverageTier: lifecycle?.coverageTier || null,
    refinementLevel: lifecycle?.refinementLevel || null,
    customerAreaLabel: lifecycle?.customerAreaLabel || null,
    customerSummary: lifecycle?.customerSummary || null
  };
}

function stateMarkdown(report) {
  const sources = report.sources || [];
  const signals = report.signals || [];
  const roadblocks = report.roadblocks || [];
  const sourceLines = sources.slice(0, 20).map((source) => {
    const bits = [`${source.ok ? '✅' : '⚠️'} ${source.label}`, `${source.status}`, `${source.bytes || 0} bytes`];
    if (source.matchedBottleCount) bits.push(`${source.matchedBottleCount} bottle matches`);
    if (source.pdfLinkCount) bits.push(`${source.pdfLinkCount} docs`);
    if (source.signalType) bits.push(`${source.signalType}`);
    if (source.error) bits.push(`error: ${source.error}`);
    return `  - ${bits.join(' · ')}\n    ${source.url}`;
  }).join('\n') || '  - No sources recorded.';
  const topSignals = signals.slice(0, 8).map((signal) => {
    const bottle = signal.canonicalName || signal.rawName ? ` — ${signal.canonicalName || signal.rawName}` : '';
    return `  - ${signal.eventType}${bottle}\n    ${signal.sourceLabel}: ${signal.sourceUrl}`;
  }).join('\n') || '  - No normalized signals yet.';
  const roadblockLines = roadblocks.slice(0, 12).map((r) => `  - ${r.source}: ${r.status || ''} ${r.error || ''}\n    ${r.url}\n    Next: ${r.nextRoute}`).join('\n') || '  - None logged.';
  return `## ${report.label} (${report.state})\n\n- Tier: ${report.tier}\n- Strategy: ${report.strategy}\n- Recommended cadence: ${report.cadence}\n- Status: ${report.status}\n- User value: ${report.value}\n\nSources checked:\n${sourceLines}\n\nTop normalized signals:\n${topSignals}\n\nRoadblocks / next routes:\n${roadblockLines}\n`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const generatedAt = new Date().toISOString();
  const reports = [];

  for (const config of STATE_SOURCES) {
    const report = await readJson(path.join(STATES_OUT, `${config.id}.json`));
    if (!report) throw new Error(`Missing state report for ${config.id}; run node src/run-state.mjs ${config.id} first.`);
    reports.push(report);
  }

  const allSignals = reports.flatMap((report) => report.signals || []);
  const allRoadblocks = reports.flatMap((report) => report.roadblocks || []);
  const stateSummaries = reports.map(stateSummary);
  const summary = {
    generatedAt,
    stateCount: reports.length,
    signalCount: allSignals.length,
    roadblockCount: allRoadblocks.length,
    degradedStateCount: reports.filter((r) => r.stale || /^failed_/.test(String(r.status || ''))).length,
    staleStateCount: reports.filter((r) => r.stale).length,
    failedStateCount: reports.filter((r) => /^failed_/.test(String(r.status || ''))).length,
    states: stateSummaries
  };

  const sourceHealth = {
    generatedAt,
    status: summary.failedStateCount ? 'failed_states_present' : summary.staleStateCount ? 'degraded_with_stale_fallbacks' : 'healthy',
    browserPreflight: { skipped: true, reason: 'aggregate-state-reports reuses existing per-state artifacts' },
    totals: {
      stateCount: summary.stateCount,
      degradedStateCount: summary.degradedStateCount,
      staleStateCount: summary.staleStateCount,
      failedStateCount: summary.failedStateCount,
      signalCount: summary.signalCount,
      roadblockCount: summary.roadblockCount,
      actionableInventorySignalCount: stateSummaries.reduce((sum, state) => sum + state.actionableInventorySignalCount, 0)
    },
    states: stateSummaries.map((state) => ({
      state: state.state,
      label: state.label,
      status: state.status,
      stale: state.stale,
      staleReason: state.staleReason,
      sourceCount: state.sourceCount,
      reachableSourceCount: state.reachableSourceCount,
      signalProducingSourceCount: state.signalProducingSourceCount,
      signalCount: state.signalCount,
      storeLevelSignalCount: state.storeLevelSignalCount,
      actionableInventorySignalCount: state.actionableInventorySignalCount,
      roadblockCount: state.roadblockCount,
      targetLocationPrecision: state.targetLocationPrecision,
      bestLocationPrecision: state.bestLocationPrecision
    }))
  };

  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(OUT, 'signals.json'), JSON.stringify({ generatedAt, signals: allSignals }, null, 2));
  await writeFile(path.join(OUT, 'roadblocks.json'), JSON.stringify({ generatedAt, roadblocks: allRoadblocks }, null, 2));
  await writeFile(path.join(OUT, 'source-health.json'), JSON.stringify(sourceHealth, null, 2));
  await writeFile(path.join(OUT, 'source-health.md'), `# Bourbon Signal Engine Source Health\n\nGenerated: ${generatedAt}\n\nStatus: ${sourceHealth.status}\n\n${sourceHealth.states.map((s) => `## ${s.state} — ${s.label}\n\n- Status: ${s.status}${s.stale ? ` (${s.staleReason || 'stale'})` : ''}\n- Sources: ${s.reachableSourceCount}/${s.sourceCount} reachable, ${s.signalProducingSourceCount} signal-producing\n- Signals: ${s.signalCount}; store-level: ${s.storeLevelSignalCount}; actionable inventory: ${s.actionableInventorySignalCount}\n- Precision: ${s.bestLocationPrecision || 'blocked'} / target ${s.targetLocationPrecision || 'unknown'}\n- Roadblocks: ${s.roadblockCount}\n`).join('\n')}`);
  await writeFile(path.join(OUT, 'readable.md'), `# Bourbon Signal Aggregated Engine Reports\n\nGenerated: ${generatedAt}\n\nStates covered: ${summary.stateCount}\nNormalized signals: ${summary.signalCount}\nRoadblocks logged: ${summary.roadblockCount}\n\n${reports.map(stateMarkdown).join('\n')}\n`);
  await writeFile(path.join(OUT, 'roadblocks.md'), `# Bourbon Signal Engine Roadblocks\n\nGenerated: ${generatedAt}\n\n${allRoadblocks.map((r) => `## ${r.state} — ${r.source}\n\n- URL: ${r.url}\n- Status: ${r.status}\n- Error: ${r.error}\n- Next route: ${r.nextRoute}\n`).join('\n') || 'No roadblocks logged.'}\n`);
  console.log(`Aggregated ${summary.stateCount} states, ${summary.signalCount} signals, ${summary.roadblockCount} roadblocks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

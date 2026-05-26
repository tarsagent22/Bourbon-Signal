import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';
import { BourbonBible } from './core/bible.mjs';
import { collectState } from './collectors/generic-state.mjs';
import { bestPrecision, LOCATION_PROFILES } from './location-precision.mjs';

const OUT = path.resolve('out');
const STATES_OUT = path.join(OUT, 'states');

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
  const bible = await BourbonBible.load();
  const allReports = [];
  const allSignals = [];
  const allRoadblocks = [];

  for (const config of STATE_SOURCES) {
    console.log(`Collecting ${config.id} — ${config.label}`);
    const report = await collectState(config, bible);
    allReports.push(report);
    allSignals.push(...report.signals);
    allRoadblocks.push(...report.roadblocks);
    await writeFile(path.join(STATES_OUT, `${config.id}.json`), JSON.stringify(report, null, 2));
    console.log(`  ${report.status}: ${report.signals.length} signals, ${report.roadblocks.length} roadblocks`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    stateCount: allReports.length,
    signalCount: allSignals.length,
    roadblockCount: allRoadblocks.length,
    states: allReports.map((r) => ({
      state: r.state,
      label: r.label,
      tier: r.tier,
      status: r.status,
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

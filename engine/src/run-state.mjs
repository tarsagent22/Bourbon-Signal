import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_STATE_SOURCES } from './state-sources.mjs';
import { BourbonBible } from './core/bible.mjs';
import { collectState } from './collectors/generic-state.mjs';

const OUT = path.resolve('out');
const STATES_OUT = path.join(OUT, 'states');

async function main() {
  const stateId = process.argv[2];
  const config = ALL_STATE_SOURCES.find((source) => source.id === stateId);
  if (!config) throw new Error(`Unknown state source id: ${stateId || '(missing)'}`);

  await mkdir(STATES_OUT, { recursive: true });
  const bible = await BourbonBible.load();
  const outputFile = process.env.BOURBON_SIGNAL_STATE_OUT_FILE || path.join(STATES_OUT, `${config.id}.json`);
  const previousFile = process.env.BOURBON_SIGNAL_PREVIOUS_STATE_FILE || outputFile;
  const previous = await readFile(previousFile, 'utf8').then(JSON.parse).catch(() => null);
  const previousSourceResults = Object.fromEntries((previous?.sourceResults || []).map((result) => [result.sourceId, {
    ...result,
    value: {
      signals: (previous?.signals || []).filter((signal) => signal.sourceRuntimeId === result.sourceId),
      roadblocks: (previous?.roadblocks || []).filter((roadblock) => roadblock.sourceRuntimeId === result.sourceId),
      sourceReport: (previous?.sources || []).find((source) => source.sourceRuntimeId === result.sourceId) || null,
    },
  }]));
  const report = await collectState(config, bible, {
    previousSourceResults,
    previousSourceCircuitState: previous?.sourceCircuitState || {},
  });
  await writeFile(outputFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ state: config.id, status: report.status, signalCount: report.signals.length, roadblockCount: report.roadblocks.length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

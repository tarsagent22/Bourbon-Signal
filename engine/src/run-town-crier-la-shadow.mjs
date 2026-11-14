import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { BourbonBible } from './core/bible.mjs';
import { collectTownCrierLouisianaResearch } from './research-town-crier-la-runtime.mjs';
import { buildShadowEvidence } from './run-expansion-shadow.mjs';

// Explicit standalone research entry point. It executes the normal isolated
// shadow report path for LA but selects only the Town Crier research adapter.
process.env.BOURBON_SIGNAL_SHADOW_MODE = '1';
process.env.BOURBON_SIGNAL_AUTO_DEPLOY = '0';
process.env.BOURBON_SIGNAL_ALERT_QUEUE_MODE = 'shadow';
process.env.ALERT_DELIVERY_ENABLED = '0';
process.env.ALERT_ONSITE_DELIVERY_ENABLED = '0';
process.env.ALERT_EMAIL_DELIVERY_ENABLED = '0';
process.env.ALERT_SMS_DELIVERY_ENABLED = '0';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = path.resolve('out', 'shadow', 'LA', `town-crier-${runId}`);
const reportDirectory = outputDirectory;
const incidentFile = path.resolve('out', 'research-source-attempts', 'town-crier-la-incidents.json');
const bible = await BourbonBible.load();
const report = await collectTownCrierLouisianaResearch({ bible, env: process.env, reportDirectory, incidentFile });
const evidence = buildShadowEvidence('LA', report);
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(outputDirectory, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ state: 'LA', runId, reportStatus: report.status, signalCount: report.signals.length,
  complete: evidence.complete, readiness: evidence.readiness, publication: evidence.publication, alerts: evidence.alerts }, null, 2));
if (!evidence.complete) process.exitCode = 1;

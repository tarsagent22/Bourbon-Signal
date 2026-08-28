import { spawn } from 'node:child_process';

const steps = [
  {
    label: 'OHLQ signed worker artifact refresh',
    command: ['../scripts/fetch-ohlq-worker-artifact.mjs'],
    env: {
      OHLQ_WORKER_ARTIFACT_REQUIRED: '1',
      OHLQ_WORKER_TARGET_STATES: 'OH',
      OHLQ_WORKER_DESTINATION: process.env.OHLQ_WORKER_DESTINATION || 'out/browser/ohlq-availability.json'
    }
  },
  { label: 'Ohio state collection', command: ['src/run.mjs', '--states=OH'], env: { BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0' } },
  { label: 'Aggregate state reports', command: ['src/aggregate-state-reports.mjs'] },
  { label: 'Operational snapshot', command: ['src/operational-report.mjs'] },
  { label: 'Site export', command: ['--max-old-space-size=16384', 'src/export-site-contract.mjs'] },
  { label: 'Ohio hardening verifier', command: ['src/verify-ohio-hardening.mjs'] },
  { label: 'Site contract verifier', command: ['src/verify-site-contract.mjs'] }
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${step.label} ===`);
    const child = spawn(process.execPath, step.command, {
      cwd: process.cwd(),
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, ...(step.env || {}) }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.label} exited ${code}`));
    });
  });
}

for (const step of steps) await runStep(step);
console.log('\nOhio refresh complete.');

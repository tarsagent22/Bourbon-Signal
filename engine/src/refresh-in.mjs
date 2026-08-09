import { spawn } from 'node:child_process';

const steps = [
  {
    label: 'Indiana state collection',
    command: ['src/run.mjs', '--states=IN'],
    env: {
      BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0',
      BOURBON_SIGNAL_FORCE_SOURCE_RUN: '1',
      BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE: '1',
      BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_IDS: 'big-red',
    },
  },
  { label: 'Aggregate state reports', command: ['src/aggregate-state-reports.mjs'] },
  { label: 'Operational snapshot', command: ['src/operational-report.mjs'] },
  { label: 'Site export', command: ['--max-old-space-size=16384', 'src/export-site-contract.mjs'] },
  { label: 'Indiana verifier', command: ['src/verify-in.mjs'] },
  { label: 'Site contract verifier', command: ['src/verify-site-contract.mjs'], env: { BOURBON_SIGNAL_VERIFY_SITE_REQUIRED_DROP_STATES: 'IN,AL,NC,PA' } }
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
console.log('\nIndiana refresh complete.');

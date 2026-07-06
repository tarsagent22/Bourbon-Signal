import { spawn } from 'node:child_process';

const steps = [
  {
    label: 'OHLQ browser product discovery and availability refresh',
    command: ['src/ohlq-browser-collector.mjs', '--discover'],
    env: {
      OHLQ_DISCOVERY_PAGES: process.env.OHLQ_DISCOVERY_PAGES || '8',
      OHLQ_DISCOVERY_LIMIT: process.env.OHLQ_DISCOVERY_LIMIT || '40',
      OHLQ_PRODUCT_DELAY_MS: process.env.OHLQ_PRODUCT_DELAY_MS || '900',
      OHLQ_PRODUCT_READY_TIMEOUT_MS: process.env.OHLQ_PRODUCT_READY_TIMEOUT_MS || '70000',
      OHLQ_KEEP_BROWSER: process.env.OHLQ_KEEP_BROWSER || '1'
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

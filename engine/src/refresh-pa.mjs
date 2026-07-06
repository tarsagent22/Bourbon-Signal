import { spawn } from 'node:child_process';

const steps = [
  {
    label: 'FWGS full browser inventory refresh',
    command: ['src/fwgs-browser-full.mjs'],
    env: {
      FWGS_INVENTORY_CONCURRENCY: process.env.FWGS_INVENTORY_CONCURRENCY || '16',
      FWGS_INVENTORY_SKU_BATCH_SIZE: process.env.FWGS_INVENTORY_SKU_BATCH_SIZE || '24',
      FWGS_BATCH_SIZE: process.env.FWGS_BATCH_SIZE || '25',
      FWGS_FULL_CHUNK_LIMIT: process.env.FWGS_FULL_CHUNK_LIMIT || '300',
      FWGS_FULL_OFFSETS: process.env.FWGS_FULL_OFFSETS || '0,300',
      BOURBON_SIGNAL_FORCE_BROWSER_PREFLIGHT: '1'
    }
  },
  { label: 'PA state collection', command: ['src/run.mjs', '--states=PA'], env: { BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0' } },
  { label: 'Operational snapshot', command: ['src/operational-report.mjs'] },
  { label: 'Site export', command: ['--max-old-space-size=16384', 'src/export-site-contract.mjs'] },
  { label: 'PA verifier', command: ['src/verify-pa.mjs'] },
  { label: 'PA automation verifier', command: ['src/verify-pa-automation.mjs'] }
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
console.log('\nPA refresh complete.');

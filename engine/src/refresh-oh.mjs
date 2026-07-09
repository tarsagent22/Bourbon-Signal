import { spawn } from 'node:child_process';

const OHLQ_COOLDOWN_FILE = process.env.OHLQ_COOLDOWN_FILE || 'out/browser/ohlq-cooldown.json';
const OHLQ_DISCOVER_ON_REFRESH = process.env.OHLQ_DISCOVER_ON_REFRESH === '1';

async function readJson(path) {
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function ohlqCooldownActive() {
  if (process.env.OHLQ_IGNORE_COOLDOWN === '1') return false;
  const payload = await readJson(OHLQ_COOLDOWN_FILE);
  const until = Date.parse(payload?.cooldownUntil || '');
  return Number.isFinite(until) && until > Date.now();
}

const steps = [
  ...((await ohlqCooldownActive()) ? [] : [{
    label: 'OHLQ browser product availability refresh',
    command: ['src/ohlq-browser-collector.mjs', ...(OHLQ_DISCOVER_ON_REFRESH ? ['--discover'] : [])],
    env: {
      // OHLQ is Cloudflare-protected. Headless Chrome reliably gets stuck on
      // "Just a moment..."; a persistent headful profile can complete the
      // managed challenge and reuse the browser session for future refreshes.
      OHLQ_CDP_URL: process.env.OHLQ_CDP_URL || 'http://127.0.0.1:18801',
      BROWSER_HEADLESS: process.env.BROWSER_HEADLESS || '0',
      BROWSER_PROFILE_DIR: process.env.BROWSER_PROFILE_DIR || 'out/browser-profile/ohlq-live',
      OHLQ_DISCOVERY_PAGES: process.env.OHLQ_DISCOVERY_PAGES || '2',
      OHLQ_DISCOVERY_LIMIT: process.env.OHLQ_DISCOVERY_LIMIT || '10',
      OHLQ_PRODUCT_DELAY_MS: process.env.OHLQ_PRODUCT_DELAY_MS || '3500',
      OHLQ_PRODUCT_READY_TIMEOUT_MS: process.env.OHLQ_PRODUCT_READY_TIMEOUT_MS || '90000',
      OHLQ_KEEP_BROWSER: process.env.OHLQ_KEEP_BROWSER || '1'
    }
  }]),
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

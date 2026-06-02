import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.resolve('out');
const LOCK = path.join(OUT, 'refresh.lock.json');
const STATUS = path.join(OUT, 'site-refresh-status.json');
const LOCK_STALE_MS = Number(process.env.BOURBON_SIGNAL_REFRESH_LOCK_STALE_MS || 25 * 60_000);
const BROWSER_REFRESH_MINUTES = Number(process.env.BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES || 15);
const STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_REFRESH_STEP_TIMEOUT_MS || 15 * 60_000);
const BROWSER_STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_BROWSER_STEP_TIMEOUT_MS || 3 * 60_000);
const FWGS_BROWSER_STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_FWGS_BROWSER_STEP_TIMEOUT_MS || 12 * 60_000);
const CDP_PORT = Number(process.env.OPENCLAW_BROWSER_CDP_PORT || 18800);
const CDP_URL = process.env.OPENCLAW_BROWSER_CDP_URL || `http://127.0.0.1:${CDP_PORT}`;
const CHROME_EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PROFILE = path.join(OUT, 'browser-profile');

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function acquireLock() {
  await mkdir(OUT, { recursive: true });
  const lock = await readJson(LOCK);
  if (lock?.startedAt) {
    const age = Date.now() - new Date(lock.startedAt).getTime();
    const pidAlive = lock.pid ? (() => { try { process.kill(lock.pid, 0); return true; } catch { return false; } })() : false;
    if (pidAlive && age >= 0 && age < LOCK_STALE_MS) {
      console.log(`Another refresh appears active (pid=${lock.pid}, age=${Math.round(age / 1000)}s). Skipping.`);
      return false;
    }
    console.warn(`Ignoring stale refresh lock (pid=${lock.pid}, alive=${pidAlive}, age=${Math.round(age / 1000)}s).`);
  }
  await writeFile(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
  return true;
}

async function releaseLock() {
  await rm(LOCK, { force: true });
}

function runNode(script, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const timeoutMs = Number(options.timeoutMs || STEP_TIMEOUT_MS);
    const env = { ...process.env };
    if (script.includes('export-site-contract') && !String(env.NODE_OPTIONS || '').includes('--max-old-space-size')) {
      env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim();
    }
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs > 0 ? setTimeout(() => {
      const message = `${script} timed out after ${Math.round(timeoutMs / 1000)}s`;
      stderr += `\n${message}\n`;
      try { child.kill(); } catch {}
      reject(Object.assign(new Error(message), {
        result: { script, args, code: 'timeout', startedAt, finishedAt: new Date().toISOString(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) }
      }));
    }, timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const finishedAt = new Date().toISOString();
      const result = { script, args, code, startedAt, finishedAt, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${script} exited ${code}`), { result }));
    });
  });
}

async function cdpReady() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureHeadlessCdp() {
  if (await cdpReady()) return null;
  if (!(await exists(CHROME_EXE))) {
    throw new Error(`Chrome executable not found: ${CHROME_EXE}`);
  }
  await mkdir(CHROME_PROFILE, { recursive: true });
  const child = spawn(CHROME_EXE, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${CHROME_PROFILE}`,
    '--disable-gpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true
  });

  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await cdpReady()) return child;
  }
  child.kill();
  throw new Error(`Headless Chrome CDP did not become ready at ${CDP_URL}`);
}

async function shouldRunBrowserCollectors() {
  const last = await readJson(STATUS);
  const lastBrowserActivityAt = last?.lastBrowserRefreshAt || last?.lastBrowserAttemptAt;
  if (!lastBrowserActivityAt) return true;
  const ageMs = Date.now() - new Date(lastBrowserActivityAt).getTime();
  return ageMs >= BROWSER_REFRESH_MINUTES * 60_000;
}

async function main() {
  const startedAt = new Date().toISOString();
  const locked = await acquireLock();
  if (!locked) return;

  const steps = [];
  const warnings = [];
  let lastBrowserRefreshAt = (await readJson(STATUS))?.lastBrowserRefreshAt || null;
  let lastBrowserAttemptAt = (await readJson(STATUS))?.lastBrowserAttemptAt || null;

  try {
    if (await shouldRunBrowserCollectors()) {
      // Browser-assisted sources are heavier and can take longer than the base run. Refresh them on a
      // controlled cadence, then every 5-minute base run folds the newest artifacts into the site export.
      let browserOk = false;
      let launchedBrowser = null;
      lastBrowserAttemptAt = new Date().toISOString();
      try {
        const hadExistingCdp = await cdpReady();
        launchedBrowser = await ensureHeadlessCdp();
        const browserScripts = hadExistingCdp
          ? ['src/ohlq-browser-collector.mjs', 'src/or-browser-collector.mjs', 'src/fwgs-browser-full.mjs']
          : ['src/or-browser-collector.mjs', 'src/fwgs-browser-full.mjs'];
        if (!hadExistingCdp) {
          warnings.push('OHLQ browser collector skipped on scheduled headless Chrome because OHLQ Cloudflare requires an already-warmed interactive browser session; last known OHLQ artifact/snapshot remains in use.');
        }
        for (const script of browserScripts) {
          try {
            const timeoutMs = script.includes('fwgs-browser-full') ? FWGS_BROWSER_STEP_TIMEOUT_MS : BROWSER_STEP_TIMEOUT_MS;
            steps.push(await runNode(script, [], { timeoutMs }));
            browserOk = true;
          } catch (error) {
            warnings.push(`${script}: ${error.message}`);
            if (error.result) steps.push(error.result);
            console.warn(`Browser-assisted collector skipped/failed; continuing with last artifact: ${script}: ${error.message}`);
          }
        }
      } catch (error) {
        warnings.push(`browser-cdp: ${error.message}`);
        console.warn(`Browser-assisted collectors skipped; continuing with last artifacts: ${error.message}`);
      } finally {
        if (launchedBrowser) launchedBrowser.kill();
      }
      if (browserOk) lastBrowserRefreshAt = new Date().toISOString();
    }

    steps.push(await runNode('src/run.mjs'));
    steps.push(await runNode('src/rare-report.mjs'));
    steps.push(await runNode('src/location-report.mjs'));
    steps.push(await runNode('src/operational-report.mjs'));
    steps.push(await runNode('src/export-site-contract.mjs'));

    const finishedAt = new Date().toISOString();
    await writeFile(STATUS, JSON.stringify({
      ok: true,
      startedAt,
      finishedAt,
      cadenceMinutes: 5,
      browserRefreshMinutes: BROWSER_REFRESH_MINUTES,
      lastBrowserRefreshAt,
      lastBrowserAttemptAt,
      warnings,
      steps: steps.map((s) => ({ script: s.script, args: s.args, code: s.code, startedAt: s.startedAt, finishedAt: s.finishedAt }))
    }, null, 2));
    console.log(`Bourbon Signal refresh complete: ${startedAt} -> ${finishedAt}`);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const failed = error.result || null;
    await writeFile(STATUS, JSON.stringify({
      ok: false,
      startedAt,
      finishedAt,
      cadenceMinutes: 5,
      browserRefreshMinutes: BROWSER_REFRESH_MINUTES,
      lastBrowserRefreshAt,
      lastBrowserAttemptAt,
      error: error.message,
      warnings,
      failed,
      steps: steps.map((s) => ({ script: s.script, args: s.args, code: s.code, startedAt: s.startedAt, finishedAt: s.finishedAt }))
    }, null, 2));
    throw error;
  } finally {
    await releaseLock();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

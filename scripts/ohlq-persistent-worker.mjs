import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { classifyOhlqBrowserState, deterministicOhlqUploadId, resolveOhlqWorkerPaths } from './lib/ohlq-worker-runtime.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENGINE = path.join(ROOT, 'engine');
const WORKER_PATHS = resolveOhlqWorkerPaths(process.env, os.homedir());
const { profileDir: PROFILE_DIR, artifactPath: ARTIFACT_PATH, cooldownPath: COOLDOWN_PATH, statusPath: STATUS_PATH, lockPath: LOCK_PATH } = WORKER_PATHS;
const CDP_URL = process.env.OHLQ_WORKER_CDP_URL || 'http://127.0.0.1:18801';
const API_URL = new URL('/api/source/ohlq/artifact', process.env.OHLQ_WORKER_API_URL || 'https://www.bourbonsignal.com').toString();
const SAMPLE_URL = 'https://www.ohlq.com/liquor/whiskey/american/bourbon/blantons-gold';
const BOOTSTRAP = process.argv.includes('--bootstrap');
const CONTRACT = 'bourbon-signal/ohlq-worker-artifact@1';
let activeChild = null;
let activeBrowser = null;
let killActiveBrowser = null;
let shuttingDown = false;
let ownedLockId = null;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function writeStatus(value) {
  await mkdir(path.dirname(STATUS_PATH), { recursive: true });
  const temporary = `${STATUS_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ ...value, checkedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  await rename(temporary, STATUS_PATH);
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function releaseOwnedLock() {
  if (!ownedLockId) return false;
  let current = {};
  try { current = JSON.parse(await readFile(LOCK_PATH, 'utf8')); } catch { return false; }
  if (current.lockId !== ownedLockId) return false;
  await rm(LOCK_PATH, { force: true });
  ownedLockId = null;
  return true;
}

async function acquireLock() {
  await mkdir(path.dirname(LOCK_PATH), { recursive: true });
  const lockId = randomUUID();
  try {
    const handle = await open(LOCK_PATH, 'wx');
    await handle.writeFile(JSON.stringify({ lockId, pid: process.pid, startedAt: new Date().toISOString() }));
    await handle.close();
    ownedLockId = lockId;
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const raw = await readFile(LOCK_PATH, 'utf8').catch(() => '');
    let lock = {};
    try { lock = JSON.parse(raw); } catch { /* malformed stale locks use file mtime */ }
    let startedAt = Date.parse(lock.startedAt || '');
    if (!Number.isFinite(startedAt)) startedAt = await stat(LOCK_PATH).then((value) => value.mtimeMs).catch(() => Number.NaN);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt <= 2 * 60 * 60_000 || pidIsAlive(Number(lock.pid))) return false;
    const tombstone = `${LOCK_PATH}.stale.${process.pid}.${randomUUID()}`;
    try {
      await rename(LOCK_PATH, tombstone);
      const movedRaw = await readFile(tombstone, 'utf8').catch(() => '');
      if (movedRaw !== raw) {
        await rename(tombstone, LOCK_PATH).catch(() => false);
        return false;
      }
      await rm(tombstone, { force: true });
    } catch (renameError) {
      if (renameError?.code !== 'ENOENT') throw renameError;
    }
    return acquireLock();
  }
}

async function runCollector() {
  await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/ohlq-browser-collector.mjs'], {
      cwd: ENGINE,
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        OHLQ_CDP_URL: CDP_URL,
        BROWSER_CDP_URL: CDP_URL,
        BROWSER_HEADLESS: '0',
        BROWSER_PROFILE_DIR: PROFILE_DIR,
        OHLQ_OUT_FILE: ARTIFACT_PATH,
        OHLQ_COOLDOWN_FILE: COOLDOWN_PATH,
        OHLQ_KEEP_BROWSER: '1',
        OHLQ_DISCOVERY_PAGES: process.env.OHLQ_DISCOVERY_PAGES || '2',
        OHLQ_DISCOVERY_LIMIT: process.env.OHLQ_DISCOVERY_LIMIT || '10',
        OHLQ_PRODUCT_DELAY_MS: process.env.OHLQ_PRODUCT_DELAY_MS || '4500',
        OHLQ_PRODUCT_JITTER_MS: process.env.OHLQ_PRODUCT_JITTER_MS || '3500',
        OHLQ_PRODUCT_READY_TIMEOUT_MS: process.env.OHLQ_PRODUCT_READY_TIMEOUT_MS || '45000',
      },
    });
    activeChild = child;
    child.on('error', (error) => {
      activeChild = null;
      reject(error);
    });
    child.on('close', (code) => {
      activeChild = null;
      code === 0 ? resolve() : reject(new Error(`OHLQ collector exited ${code}.`));
    });
  });
}

async function browserReadiness(page) {
  await page.navigate(SAMPLE_URL);
  const deadline = Date.now() + Number(process.env.OHLQ_BOOTSTRAP_WAIT_MS || 30_000);
  let state = null;
  while (Date.now() < deadline) {
    state = await page.evaluate(`(() => ({
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 2000),
      href: location.href,
      hasCsrf: Boolean(document.documentElement.dataset.csrfToken),
      hasProduct: Boolean(window.Ohlq?.renderProductDetail?.Product)
    }))()`, true).catch((error) => ({ error: error.message }));
    const classification = classifyOhlqBrowserState(state);
    if (classification === 'ready') return { status: 'ready', state };
    if (classification !== 'needs_human') await sleep(1_000);
    else await sleep(2_000);
  }
  return { status: classifyOhlqBrowserState(state), state };
}

async function uploadArtifact(rawArtifact) {
  const secret = process.env.OHLQ_WORKER_ARTIFACT_SECRET || (
    process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32
      ? createHmac('sha256', process.env.CRON_SECRET).update('bourbon-signal/ohlq-worker-capability@1').digest('base64url')
      : undefined
  );
  if (!secret || secret.length < 32) throw new Error('OHLQ worker artifact credential is not configured.');
  const { sanitizeOhlqWorkerEnvelope } = await import('../src/lib/ohlq-worker-artifact.ts');
  const envelope = sanitizeOhlqWorkerEnvelope({
    contractVersion: CONTRACT,
    uploadId: deterministicOhlqUploadId(rawArtifact),
    generatedAt: rawArtifact.generatedAt,
    artifact: rawArtifact,
  });
  const body = JSON.stringify(envelope);
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', secret).update(`${timestamp}\n${body}`).digest('base64url');
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      'x-ohlq-timestamp': timestamp,
      'x-ohlq-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OHLQ artifact upload failed with HTTP ${response.status}.`);
  return JSON.parse(text);
}

async function main() {
  if (!(await acquireLock())) {
    await writeStatus({ ok: true, status: 'already_running' });
    return;
  }
  process.env.OHLQ_CDP_URL = CDP_URL;
  process.env.BROWSER_CDP_URL = CDP_URL;
  process.env.BROWSER_HEADLESS = '0';
  process.env.BROWSER_PROFILE_DIR = PROFILE_DIR;
  const { BrowserPage, ensureBrowserCdp, getOrCreateTarget, killBrowserCdp } = await import('../engine/src/core/browser-session.mjs');
  killActiveBrowser = killBrowserCdp;
  let browser = null;
  let page = null;
  try {
    browser = await ensureBrowserCdp(CDP_URL, { profileDir: PROFILE_DIR, timeoutMs: 45_000 });
    activeBrowser = browser;
    const target = await getOrCreateTarget(CDP_URL, 'ohlq.com');
    page = new BrowserPage(target.webSocketDebuggerUrl, { pageTimeoutMs: 45_000 });
    await page.connect();
    const readiness = await browserReadiness(page);
    if (readiness.status !== 'ready') {
      const status = readiness.status === 'needs_human' ? 'needs_human_cloudflare_verification' : 'browser_not_ready';
      await writeStatus({ ok: false, status, browserLeftOpen: true, profileDir: PROFILE_DIR, url: SAMPLE_URL });
      console.log(JSON.stringify({ ok: false, status, action: 'Complete OHLQ security verification in the opened browser window, then rerun the worker.' }));
      browser = null;
      return;
    }
    if (BOOTSTRAP) {
      await rm(COOLDOWN_PATH, { force: true });
      await writeStatus({ ok: true, status: 'bootstrap_ready', browserLeftOpen: true, profileDir: PROFILE_DIR });
      console.log(JSON.stringify({ ok: true, status: 'bootstrap_ready', action: 'Browser profile is verified. Run the normal worker to collect and upload.' }));
      browser = null;
      return;
    }
    page.close();
    page = null;
    await runCollector();
    const rawArtifact = JSON.parse(await readFile(ARTIFACT_PATH, 'utf8'));
    const receipt = await uploadArtifact(rawArtifact);
    await writeStatus({ ok: true, status: 'uploaded', generatedAt: rawArtifact.generatedAt, digest: receipt.digest, receipt });
    console.log(JSON.stringify({ ok: true, status: 'uploaded', generatedAt: rawArtifact.generatedAt, digest: receipt.digest }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeStatus({ ok: false, status: 'failed', error: message });
    throw error;
  } finally {
    if (page) page.close();
    if (browser) await killBrowserCdp(browser).catch(() => false);
    activeBrowser = null;
    await releaseOwnedLock();
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  activeChild?.kill('SIGTERM');
  if (activeBrowser && killActiveBrowser) await killActiveBrowser(activeBrowser).catch(() => false);
  await releaseOwnedLock().catch(() => false);
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

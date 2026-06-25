import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function readText(file) {
  return readFile(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const pkg = JSON.parse(await readText('package.json'));
  const browserSession = await readText(path.join('src', 'core', 'browser-session.mjs'));
  const run = await readText(path.join('src', 'run.mjs'));
  const aggregate = await readText(path.join('src', 'aggregate-state-reports.mjs'));
  const verifyPa = await readText(path.join('src', 'verify-pa.mjs'));

  assert(/ensureBrowserCdp/.test(browserSession), 'browser-session must export ensureBrowserCdp so browser-backed collectors own Chrome/CDP startup instead of assuming port 18800 is already open.');
  assert(/FWGS_AUTO_START_BROWSER/.test(browserSession), 'browser-session must allow FWGS/engine to auto-start Chrome by default with an env kill switch.');
  assert(/fwgs-browser-full\.mjs/.test(run), 'run.mjs must use the statewide FWGS full collector for PA browser preflight, not the one-chunk collector.');
  assert(/runGuardedBrowserPreflightJob[\s\S]*ensureBrowserCdp/.test(run), 'run.mjs must ensure Chrome/CDP before browser preflight jobs run.');
  assert(/refresh:pa/.test(JSON.stringify(pkg.scripts)) && /fwgs:full/.test(pkg.scripts['refresh:pa'] || '') && /BOURBON_SIGNAL_FORCE_BROWSER_PREFLIGHT=1/.test(pkg.scripts['refresh:pa'] || ''), 'refresh:pa must force browser preflight and run the full FWGS collector as a self-contained refresh.');
  assert(/siteActionableInventorySignalCount/.test(aggregate) && /siteExactStoreDropCount/.test(aggregate), 'source health must include PA/site-level actionable exact-store counts, not only raw pre-confidence signal flags.');
  assert(/browser-refresh-status\.json/.test(verifyPa), 'verify:pa must inspect browser refresh status so silent preserved/stale browser artifacts are caught.');

  console.log('PA automation guardrails passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });

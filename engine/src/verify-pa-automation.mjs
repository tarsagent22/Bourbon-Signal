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
  const fwgsCollector = await readText(path.join('src', 'fwgs-browser-collector.mjs'));
  const run = await readText(path.join('src', 'run.mjs'));
  const aggregate = await readText(path.join('src', 'aggregate-state-reports.mjs'));
  const verifyPa = await readText(path.join('src', 'verify-pa.mjs'));
  const refreshSite = await readText(path.join('src', 'refresh-site.mjs'));
  const productionWatchdog = await readText(path.join('..', 'scripts', 'production-engine-watchdog.mjs'));
  const refreshWorkflow = await readText(path.join('..', '.github', 'workflows', 'refresh-feed.yml'));
  const watchdogWorkflow = await readText(path.join('..', '.github', 'workflows', 'engine-watchdog.yml'));

  const refreshPa = await readText(path.join('src', 'refresh-pa.mjs'));

  assert(/ensureBrowserCdp/.test(browserSession), 'browser-session must export ensureBrowserCdp so browser-backed collectors own Chrome/CDP startup instead of assuming port 18800 is already open.');
  assert(/FWGS_AUTO_START_BROWSER/.test(browserSession), 'browser-session must allow FWGS/engine to auto-start Chrome by default with an env kill switch.');
  assert(/fwgs-browser-full\.mjs/.test(run), 'run.mjs must use the statewide FWGS full collector for PA browser preflight, not the one-chunk collector.');
  assert(/runGuardedBrowserPreflightJob[\s\S]*ensureBrowserCdp/.test(run), 'run.mjs must ensure Chrome/CDP before browser preflight jobs run.');
  assert(/refresh:pa/.test(JSON.stringify(pkg.scripts)) && /refresh-pa\.mjs/.test(pkg.scripts['refresh:pa'] || '') && /fwgs-browser-full\.mjs/.test(refreshPa) && /BOURBON_SIGNAL_FORCE_BROWSER_PREFLIGHT/.test(refreshPa) && /--states=PA/.test(refreshPa), 'refresh:pa must be cross-platform, force browser preflight, run the full FWGS collector, and restrict the follow-up state run to PA.');
  assert(/siteActionableInventorySignalCount/.test(aggregate) && /siteExactStoreDropCount/.test(aggregate), 'source health must include PA/site-level actionable exact-store counts, not only raw pre-confidence signal flags.');
  assert(/browser-refresh-status\.json/.test(verifyPa) && /site-refresh-status\.json/.test(verifyPa), 'verify:pa must inspect browser preflight and scheduled refresh status so silent preserved/stale or failed FWGS attempts are caught.');
  assert(/ensureBrowserCdp/.test(refreshSite) && /killBrowserCdp/.test(refreshSite), 'refresh-site must use the shared cross-platform CDP owner instead of a Windows-only Chrome path.');
  assert(/AbortSignal\.timeout/.test(browserSession), 'CDP readiness HTTP calls need a bounded timeout so browser startup cannot hang outside its deadline.');
  assert(/import\s*\{[^}]*\bcdpFetch\b[^}]*\}\s*from\s*['"]\.\/core\/browser-session\.mjs['"]/.test(fwgsCollector), 'FWGS collector CDP HTTP calls must use the shared bounded CDP client.');
  assert(/detached:\s*true/.test(refreshSite) && /taskkill\.exe/.test(refreshSite) && /process\.kill\(-child\.pid/.test(refreshSite), 'Timed-out refresh children must be started and killed as process trees, including FWGS chunk workers.');
  assert(!/candidates\s*=\s*\[[^\]]*lastBrowserAttemptAt/s.test(refreshSite), 'A failed browser attempt must not delay the next FWGS retry; cadence is based on last success only.');
  assert(!/const CHROME_EXE\s*=/.test(refreshSite), 'refresh-site must not hard-code a Windows Chrome executable for hosted Linux refreshes.');
  assert(!/BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS:\s*["']1["']/.test(refreshWorkflow), 'production refresh must not permanently disable the FWGS browser collector.');
  assert(/site-refresh-status\.json/.test(refreshWorkflow), 'production refresh cache must preserve browser cadence/attempt state between isolated runners.');
  assert(/npm run verify:pa/.test(refreshWorkflow), 'production refresh must run the PA exact-store verifier before snapshot publication.');
  assert(/PA[\s\S]{0,200}minStores|PA[\s\S]{0,200}minDrops/.test(productionWatchdog), 'production watchdog must enforce a PA exact-store coverage floor, not merely HTTP 200.');
  assert(/recoveryStates/.test(productionWatchdog) && /recovery_states/.test(watchdogWorkflow) && /-f states=/.test(watchdogWorkflow), 'watchdog recovery must identify and dispatch a targeted PA refresh when PA coverage collapses.');

  console.log('PA automation guardrails passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });

import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'out');

async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }

async function listFiles(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  }
  if (await exists(dir)) await walk(dir);
  return out;
}

function problem(message, severity = 'error', detail = null) { return { severity, message, detail }; }

async function orUnavailable() {
  const state = await readJson(path.join(OUT, 'states', 'OR.json')).catch(() => null);
  const browser = await readJson(path.join(OUT, 'browser', 'OR-product-availability.json')).catch(() => null);
  const roadblocks = state?.roadblocks || [];
  const hasOfficialOutage = roadblocks.some((r) => /Oregon Liquor Search/i.test(String(r.source || r.url || '')) && /abort|timeout|502|proxy|unavailable|no store rows/i.test(String(r.error || r.status || '')));
  const browserEmpty = browser && Number(browser.storeRowCount || 0) === 0;
  return hasOfficialOutage && browserEmpty;
}

async function main() {
  const problems = [];
  const srcFiles = await listFiles(path.join(ROOT, 'src'));
  const rootFiles = await listFiles(ROOT);
  const tmpRoot = rootFiles.filter((f) => /^tmp_|^chunk-/.test(path.basename(f)) && !f.startsWith('out/') && !f.startsWith('research/'));
  if (tmpRoot.length) problems.push(problem('Root contains temporary/research files that should be archived or removed.', 'error', tmpRoot.slice(0, 50)));

  const siteRequired = ['manifest.json', 'stats.json', 'bottles.json', 'stores.json', 'locations.json', 'drops.json', 'alerts.json'];
  for (const file of siteRequired) if (!(await exists(path.join(OUT, 'site', file)))) problems.push(problem(`Missing site contract export: out/site/${file}`));

  if (await exists(path.join(OUT, 'site', 'stats.json'))) {
    const stats = await readJson(path.join(OUT, 'site', 'stats.json'));
    if (stats.contractVersion !== 'bourbon-signal-site-v0.1') problems.push(problem('Unexpected site contract version.', 'error', stats.contractVersion));
    if (!stats.signalCount || stats.signalCount < 1000) problems.push(problem('Site export signal count looks too low.', 'error', stats.signalCount));
    if (!stats.bottleCount || stats.bottleCount < 50) problems.push(problem('Site export bottle count looks too low.', 'error', stats.bottleCount));
    if (!stats.locationCount || stats.locationCount < 800) problems.push(problem('Site export location bible looks too small.', 'error', stats.locationCount));
    if (!stats.preloadedLocationCount || stats.preloadedLocationCount < 100) problems.push(problem('Site export should include preloaded no-signal locations.', 'error', stats.preloadedLocationCount));
    if (!stats.statesAtTargetPrecision || stats.statesAtTargetPrecision < 10) problems.push(problem('Site export precision coverage looks wrong or stale.', 'error', stats.statesAtTargetPrecision));
    const nc = stats.ncBoardIntelligence;
    if (!nc || nc.boardCount < 170) problems.push(problem('NC board intelligence coverage is missing or too small.', 'error', nc));
    if ((nc?.boardsWithTrackedShipments || 0) < 100) problems.push(problem('NC tracked board shipment coverage is below definition-of-done threshold.', 'error', nc));
    if ((nc?.boardsWithInventoryPages || 0) < 5) problems.push(problem('NC inventory/release page discovery is below definition-of-done threshold.', 'error', nc));
    if (!/official\/public online sources only/i.test(String(nc?.sourcePolicy || ''))) problems.push(problem('NC source policy caveat is missing from site stats.', 'error', nc?.sourcePolicy));
  }

  const ncIntelligenceFile = path.join(OUT, 'site', 'nc-intelligence.json');
  if (!(await exists(ncIntelligenceFile))) {
    problems.push(problem('Missing site contract export: out/site/nc-intelligence.json'));
  } else {
    const ncPayload = await readJson(ncIntelligenceFile);
    if (ncPayload.contractVersion !== 'bourbon-signal-site-v0.1') problems.push(problem('Unexpected NC intelligence contract version.', 'error', ncPayload.contractVersion));
    if ((ncPayload.coverage?.boardCount || 0) < 170) problems.push(problem('NC intelligence board directory coverage is below definition-of-done threshold.', 'error', ncPayload.coverage));
    if ((ncPayload.signalCounts?.nc_board_shipment_snapshot || 0) < 500) problems.push(problem('NC board shipment signal count is below definition-of-done threshold.', 'error', ncPayload.signalCounts));
    if ((ncPayload.signalCounts?.nc_statewide_warehouse_stock || 0) < 1) problems.push(problem('NC warehouse positive-stock radar is missing.', 'error', ncPayload.signalCounts));
    if ((ncPayload.roadblockCount || 0) > 5) problems.push(problem('NC collector has too many current roadblocks for definition-of-done.', 'error', ncPayload.roadblockCount));
  }

  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const activeStateIds = new Set(STATE_SOURCES.map((s) => s.id));
  const badInventory = (snapshot.signals || []).filter((s) => s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  if (badInventory.length) problems.push(problem('Inventory-alertable signals must be store_level.', 'error', badInventory.slice(0, 10).map((s) => ({ state: s.state, bottle: s.canonicalName, precision: s.locationPrecision }))));

  const missingEvidence = (snapshot.signals || []).filter((s) => (s.canAlertAsInventory || s.canAlertAsWatch) && !s.evidence && !s.sourceUrl);
  if (missingEvidence.length) problems.push(problem('Alert/watch-grade signals should have evidence or source URL.', 'error', missingEvidence.slice(0, 10).map((s) => s.key)));

  const ncUnsafeInventory = (snapshot.signals || []).filter((s) => s.state === 'NC' && s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  if (ncUnsafeInventory.length) problems.push(problem('NC aggregate board/warehouse signals must never be inventory-alertable.', 'error', ncUnsafeInventory.slice(0, 10).map((s) => ({ key: s.key, precision: s.locationPrecision, type: s.eventType }))));

  const vaSignals = (snapshot.signals || []).filter((s) => s.state === 'VA');
  const vaStoreSignals = vaSignals.filter((s) => s.locationPrecision === 'store_level');
  const vaInventorySignals = vaSignals.filter((s) => s.canAlertAsInventory);
  const vaBad1792 = vaSignals.filter((s) => /1792\s+Small\s+Batch/i.test(String(s.rawName || '')) && /Full\s+Proof/i.test(String(s.canonicalName || '')));
  if (vaSignals.length < 700) problems.push(problem('VA signal count is below definition-of-done threshold.', 'error', vaSignals.length));
  if (vaStoreSignals.length < 700) problems.push(problem('VA store-level signal count is below definition-of-done threshold.', 'error', vaStoreSignals.length));
  if (vaInventorySignals.length < 250) problems.push(problem('VA inventory-alertable signal count is below definition-of-done threshold.', 'error', vaInventorySignals.length));
  if (vaBad1792.length) problems.push(problem('VA 1792 Small Batch is being misidentified as 1792 Full Proof.', 'error', vaBad1792.slice(0, 10).map((s) => ({ raw: s.rawName, canonical: s.canonicalName }))));

  const orInventory = (snapshot.signals || []).filter((s) => s.state === 'OR' && s.eventType === 'store_inventory_result');
  if (activeStateIds.has('OR')) {
    const orSourceUnavailable = await orUnavailable();
    if (!orInventory.length) {
      problems.push(problem('Oregon store inventory rows unavailable; official Oregon Liquor Search/browser collector is currently failing and no stale exact inventory is being published.', orSourceUnavailable ? 'warning' : 'error'));
    }
    const orWithoutCaveat = orInventory.filter((s) => !/updated daily|verify/i.test(String(s.evidence || '') + ' ' + String(s.inventorySemantics || '')));
    if (orWithoutCaveat.length) problems.push(problem('Oregon store inventory rows must carry daily-update/verify caveat.', 'error', orWithoutCaveat.slice(0, 10).map((s) => s.key)));
  }

  const ohlqBad = (snapshot.signals || []).filter((s) => s.state === 'OH' && /^browser_assisted_store_inventory_/.test(String(s.eventType || '')) && !['limited_supply', 'in_stock'].includes(s.availabilityStatus));
  if (ohlqBad.length) problems.push(problem('OHLQ browser-assisted rows must be positive decoded statuses only.', 'error', ohlqBad.slice(0, 10).map((s) => ({ key: s.key, status: s.availabilityStatus }))));

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFileCount: srcFiles.length,
    problems,
    status: problems.some((p) => p.severity === 'error') ? 'failed' : 'passed'
  };
  await mkdir(path.join(OUT, 'quality'), { recursive: true });
  await writeFile(path.join(OUT, 'quality', 'quality-audit.json'), JSON.stringify(report, null, 2));
  if (report.status !== 'passed') {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(`Quality audit passed: ${srcFiles.length} source files, ${snapshot.signals.length} operational signals, ${orInventory.length} Oregon store rows.`);
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });

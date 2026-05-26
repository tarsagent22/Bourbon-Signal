import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

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

async function main() {
  const problems = [];
  const srcFiles = await listFiles(path.join(ROOT, 'src'));
  const rootFiles = await listFiles(ROOT);
  const tmpRoot = rootFiles.filter((f) => /^tmp_|^chunk-/.test(path.basename(f)) && !f.startsWith('out/') && !f.startsWith('research/'));
  if (tmpRoot.length) problems.push(problem('Root contains temporary/research files that should be archived or removed.', 'error', tmpRoot.slice(0, 50)));

  const siteRequired = ['manifest.json', 'stats.json', 'bottles.json', 'stores.json', 'drops.json', 'alerts.json'];
  for (const file of siteRequired) if (!(await exists(path.join(OUT, 'site', file)))) problems.push(problem(`Missing site contract export: out/site/${file}`));

  if (await exists(path.join(OUT, 'site', 'stats.json'))) {
    const stats = await readJson(path.join(OUT, 'site', 'stats.json'));
    if (stats.contractVersion !== 'bourbon-signal-site-v0.1') problems.push(problem('Unexpected site contract version.', 'error', stats.contractVersion));
    if (!stats.signalCount || stats.signalCount < 1000) problems.push(problem('Site export signal count looks too low.', 'error', stats.signalCount));
    if (!stats.bottleCount || stats.bottleCount < 50) problems.push(problem('Site export bottle count looks too low.', 'error', stats.bottleCount));
    if (!stats.statesAtTargetPrecision || stats.statesAtTargetPrecision < 10) problems.push(problem('Site export precision coverage looks wrong or stale.', 'error', stats.statesAtTargetPrecision));
  }

  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const badInventory = (snapshot.signals || []).filter((s) => s.canAlertAsInventory && s.locationPrecision !== 'store_level');
  if (badInventory.length) problems.push(problem('Inventory-alertable signals must be store_level.', 'error', badInventory.slice(0, 10).map((s) => ({ state: s.state, bottle: s.canonicalName, precision: s.locationPrecision }))));

  const missingEvidence = (snapshot.signals || []).filter((s) => (s.canAlertAsInventory || s.canAlertAsWatch) && !s.evidence && !s.sourceUrl);
  if (missingEvidence.length) problems.push(problem('Alert/watch-grade signals should have evidence or source URL.', 'error', missingEvidence.slice(0, 10).map((s) => s.key)));

  const orInventory = (snapshot.signals || []).filter((s) => s.state === 'OR' && s.eventType === 'store_inventory_result');
  if (!orInventory.length) problems.push(problem('Expected Oregon store inventory rows after browser collector.', 'error'));
  const orWithoutCaveat = orInventory.filter((s) => !/updated daily|verify/i.test(String(s.evidence || '') + ' ' + String(s.inventorySemantics || '')));
  if (orWithoutCaveat.length) problems.push(problem('Oregon store inventory rows must carry daily-update/verify caveat.', 'error', orWithoutCaveat.slice(0, 10).map((s) => s.key)));

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

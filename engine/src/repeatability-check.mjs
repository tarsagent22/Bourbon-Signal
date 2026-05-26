import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const OUT = path.resolve('out');

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'pipe', shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) reject(new Error(`${script} exited ${code}\n${stdout}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function stableSignalView(snapshot) {
  return (snapshot.signals || []).map((s) => ({
    key: s.key,
    state: s.state,
    bottleId: s.bottleId,
    canonicalName: s.canonicalName,
    eventType: s.eventType,
    sourceUrl: s.sourceUrl,
    locationPrecision: s.locationPrecision,
    locationName: s.locationName,
    quantity: s.quantity,
    availabilityStatus: s.availabilityStatus,
    warehouseQty: s.warehouseQty,
    price: s.price,
    confidence: s.confidence,
    canAlertAsInventory: s.canAlertAsInventory,
    canAlertAsWatch: s.canAlertAsWatch
  })).sort((a, b) => a.key.localeCompare(b.key));
}

async function main() {
  await mkdir(path.join(OUT, 'quality'), { recursive: true });
  const before = stableSignalView(await readJson(path.join(OUT, 'current-snapshot.json')));
  const first = await runNode('src/operational-report.mjs');
  const afterFirst = stableSignalView(await readJson(path.join(OUT, 'current-snapshot.json')));
  const second = await runNode('src/operational-report.mjs');
  const diff = await readJson(path.join(OUT, 'diff.json'));
  const afterSecond = stableSignalView(await readJson(path.join(OUT, 'current-snapshot.json')));

  const stable = JSON.stringify(afterFirst) === JSON.stringify(afterSecond);
  const inputStable = JSON.stringify(before) === JSON.stringify(afterFirst) || before.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    stableBetweenOperationalRuns: stable,
    stableAgainstStartingSnapshot: inputStable,
    secondRunChangeCount: diff.changeCount,
    signalCount: afterSecond.length,
    firstStdout: first.stdout.trim(),
    secondStdout: second.stdout.trim()
  };
  await writeFile(path.join(OUT, 'quality', 'repeatability-check.json'), JSON.stringify(report, null, 2));
  if (!stable) throw new Error('Operational snapshot is not stable across two consecutive runs.');
  if (diff.changeCount !== 0) throw new Error(`Expected second operational run to produce 0 changes, got ${diff.changeCount}.`);
  console.log(`Repeatability check passed: ${afterSecond.length} signals stable, second operational diff has 0 changes.`);
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });

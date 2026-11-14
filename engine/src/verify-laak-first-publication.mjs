import { readFile } from 'node:fs/promises';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';
import { isLouisianaAlaskaGroceryOnSiteSignal } from './louisiana-alaska-grocery-policy.mjs';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const now = Date.now();

for (const state of ['AK', 'LA']) {
  const report = await readJson(`out/states/${state}.json`);
  const partition = await readJson(`out/site/states/${state}/drops.json`);
  const current = partition.drops.filter(row =>
    row.state === state && isLouisianaAlaskaGroceryOnSiteSignal(row)
      && isWithinCustomerFreshnessWindow(row, now, { currentInventory: true }));
  const stores = new Set(current.map(row => row.storeId));
  const cities = new Set(current.map(row => row.city));
  const hasAllocated = current.some(row => row.tier === 'allocated' || row.tier === 'unicorn');
  if (report.stale !== false || report.status !== 'useful'
    || report.metadata?.productionAdmission?.status !== 'closed_profile_verified'
    || stores.size < 5 || cities.size < 2 || !hasAllocated) {
    throw new Error(`${state}: closed collection did not project allocated inventory across the reviewed minimum of five current stores and two cities`);
  }
  console.log(`${state}: ${current.length} verified listings across ${stores.size} current stores in ${cities.size} cities; alert delivery disabled.`);
}

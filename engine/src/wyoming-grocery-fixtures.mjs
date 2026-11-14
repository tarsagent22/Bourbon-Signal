import { readFile } from 'node:fs/promises';
import { canonicalizeSignal } from './operational-report.mjs';
import { bibleLookup, buildDrops } from './export-site-contract.mjs';
import { parseBoundGroceryXapiInventory } from './collectors/grocery-xapi-identity.mjs';
import { WYOMING_GROCERY_STORES, isWyomingGroceryProductionInventory } from './wyoming-grocery-policy.mjs';

export async function executeWyomingFixtures(payload, { bible }) {
  const fixture = JSON.parse(await readFile(new URL('../test/fixtures/wyoming-albertsons/identity.json', import.meta.url)));
  const store = WYOMING_GROCERY_STORES.find(value => value.storeId === fixture.row.storeId);
  const index = bibleLookup(bible.records);
  const failures = [];
  for (const item of payload.cases) {
    const { input, expected } = item;
    const row = structuredClone(fixture.row);
    const product = row.sourceProductBinding.productSnapshot;
    const observedAt = new Date(Date.now() - (input.ageMinutes || 0) * 60_000).toISOString();
    row.observedAt = row.sourceProductBinding.observedAt = observedAt;
    if (input.rawName) product.name = input.rawName;
    if (input.size) {
      product.name = product.name.replace(/750\s*ml/i, `${input.size} ml`);
      product.dispItemSizeQty = input.size;
    }
    if (input.wrongMerchant) product.storeId = 'unreviewed';
    if (input.wrongHost) row.sourceUrl = 'https://unreviewed.example/product';
    if (input.delivery) row.eligibleForDelivery = true;
    const matches = parseBoundGroceryXapiInventory({ response: { docs: [product] } }, store, bible);
    const qualified = matches.length === 1 && matches[0].record.id === row.canonicalBottleId && isWyomingGroceryProductionInventory(row);
    const canonical = qualified ? [canonicalizeSignal(row, bible)] : [];
    const candidates = buildDrops(canonical, index, canonical);
    const actual = {
      sourceRows: matches.length, proof: qualified, candidateCount: candidates.length,
      names: matches.map(hit => hit.record.canonical),
      originalClockPreserved: candidates.every(candidate => candidate.observedAt === observedAt),
      quantity: candidates[0]?.quantity, quantityIsExact: candidates[0]?.quantityIsExact,
      alertEligible: candidates.some(candidate => candidate.eligibleForDelivery || candidate.canAlertAsInventory || candidate.canAlertAsWatch),
    };
    for (const [key, value] of Object.entries(expected)) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
        failures.push(`${item.id}: expected ${key}=${JSON.stringify(value)}; got ${JSON.stringify(actual[key])}`);
      }
    }
  }
  return { ok: failures.length === 0, failures };
}

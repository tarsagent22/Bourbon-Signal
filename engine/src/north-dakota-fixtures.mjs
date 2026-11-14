import { readFile } from 'node:fs/promises';
import { executeCentralCityHiveFixtures } from './central-cityhive-fixtures.mjs';
import { isNorthDakotaGroceryCanaryPreview, isNorthDakotaGroceryResearchInventory, williston } from './north-dakota-retail-policy.mjs';
import { parseNorthDakotaGrocerySearch } from './research-north-dakota-runtime.mjs';

const willistonFixture = new URL('../test/fixtures/north-dakota-retail/williston-heaven-hill.json', import.meta.url);

export async function executeNorthDakotaFixtures(payload, { bible }) {
  const groceryCases = payload.cases.filter(item => item.input.sourceId === williston.storeId);
  const cityHive = await executeCentralCityHiveFixtures({ ...payload,
    cases: payload.cases.filter(item => item.input.sourceId !== williston.storeId) }, { bible });
  const failures = [...cityHive.failures];
  const original = JSON.parse(await readFile(willistonFixture));
  for (const item of groceryCases) {
    const fixture = structuredClone(original);
    const product = fixture.response.docs[0];
    const input = item.input;
    if (input.wrongMerchant) product.storeId = '128';
    if (input.wrongChannel) product.channelEligibility.inStore = false;
    if (input.outOfStock) product.channelInventory.instore = '0';
    if (input.rawName) product.name = input.rawName;
    const now = Date.now(), observedAt = new Date(now - (input.ageMinutes ?? 0) * 60_000).toISOString();
    let rows, rejected = false;
    try {
      rows = parseNorthDakotaGrocerySearch(fixture, 'bourbon', bible, observedAt).signals;
    } catch (error) {
      if (error.message !== 'Williston inventory response did not echo the exact store and search') throw error;
      rejected = true;
      rows = [];
    }
    const candidate = rows[0];
    const preview = candidate && { ...candidate, previewOnly: true, eligibleForOnSite: true, eligibleForDropFeed: true };
    const actual = {
      rejected,
      sourceRows: rows.length,
      inventoryProofRows: rows.filter(isNorthDakotaGroceryResearchInventory).length,
      canaryEligible: !!preview && isNorthDakotaGroceryCanaryPreview(preview, now),
      canonicalNames: rows.map(row => row.canonicalName).sort(),
      quantity: candidate?.quantity ?? null,
      quantityIsExact: candidate?.quantityIsExact ?? null,
      deliveryEligible: rows.some(row => row.canAlertAsInventory || row.canAlertAsWatch || row.eligibleForDelivery),
      preservesOriginalTimestamp: rows.every(row => row.observedAt === observedAt),
    };
    for (const [key, expected] of Object.entries(item.expected)) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected)) {
        failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}.`);
      }
    }
  }
  return { ok: failures.length === 0, failures };
}

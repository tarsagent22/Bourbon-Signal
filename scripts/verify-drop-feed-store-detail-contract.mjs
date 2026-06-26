import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = new URL('../src/lib/drops.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8')
  .replace(/import\s+\{\s*getActiveEngineStateName\s*\}\s+from\s+["']@\/lib\/activeStates["'];\s*/m, 'function getActiveEngineStateName(state) { return state; }\n')
  .replace(/React\.CSSProperties/g, 'unknown')
  .replace(/export const TIER_CONFIG[\s\S]*$/m, '');

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const sandbox = { exports: {}, module: { exports: {} }, console };
sandbox.module.exports = sandbox.exports;
vm.runInNewContext(transpiled, sandbox, { filename: 'drops.ts' });
const { groupDrops } = sandbox.module.exports;
if (typeof groupDrops !== 'function') throw new Error('Could not load groupDrops from src/lib/drops.ts');

const fixture = {
  timestamp: '2026-06-26T03:32:23.396Z',
  event_type: 'retailer_store_inventory_result',
  brand_name: "Blanton's Single Barrel Bourbon Whiskey",
  canonical_name: "Blanton's Single Barrel Bourbon Whiskey",
  rarity_tier: 'allocated',
  state: 'IN',
  location_precision: 'store_level',
  can_alert_as_inventory: true,
  exact_store: true,
  availability_scope: 'store_reported',
  signal_label: 'Store availability reported',
  store_name: 'Penguin Liquor - Teal Road',
  store_address: '3295 Teal Road, Lafayette, IN 47905',
  store_city: 'Lafayette',
  display_location: 'Lafayette',
  board_name: 'Lafayette',
  quantity: 1,
  quantity_in_stock: 1,
  retail_price: 121,
};

const grouped = groupDrops([fixture], 1)[0];
const failures = [];
if (!grouped) failures.push('store-level fixture did not group into a visible drop');
const location = grouped?.locations?.[0];
if (!location?.label || location.label === 'Lafayette') {
  failures.push(`store-level location label should be a usable store name, not just city; got ${JSON.stringify(location)}`);
}
if (location?.label !== 'Penguin Liquor - Teal Road') {
  failures.push(`expected primary store label to be the store name; got ${JSON.stringify(location)}`);
}
if (location?.address !== '3295 Teal Road, Lafayette, IN 47905') {
  failures.push(`expected store address to survive grouping; got ${JSON.stringify(location)}`);
}

const cityOnlyFixture = {
  ...fixture,
  store_name: undefined,
  store_address: undefined,
  store_city: 'Lafayette',
  display_location: 'Lafayette',
};
const cityOnly = groupDrops([cityOnlyFixture], 1)[0];
if (cityOnly?.exactStore || cityOnly?.canAlertAsInventory) {
  failures.push('city-only rows must not retain exact-store/actionable inventory treatment in grouped UI state.');
}

if (failures.length) {
  console.error('Drop feed store-detail contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Drop feed store-detail contract passed.');

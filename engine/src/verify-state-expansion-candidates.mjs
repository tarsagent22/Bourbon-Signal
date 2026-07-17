import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { validateStateExpansionCandidates } from './state-expansion-candidate-contract.mjs';

const registryPath = fileURLToPath(new URL('../data/state-expansion-candidates.json', import.meta.url));
const lifecyclePath = fileURLToPath(new URL('../../src/config/state-lifecycle.json', import.meta.url));
const [registry, lifecycle] = await Promise.all([
  readFile(registryPath, 'utf8').then(JSON.parse),
  readFile(lifecyclePath, 'utf8').then(JSON.parse),
]);
const result = validateStateExpansionCandidates(registry, { activeStateIds: lifecycle.activeStates });
assert.equal(result.ok, true, result.errors.join('\n'));
console.log(`Verified national candidate registry: ${registry.states.length} states and ${(registry.scopedControlMarkets || []).length} scoped control markets.`);

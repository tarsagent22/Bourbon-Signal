import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STATE_SOURCES, STATE_SOURCES } from '../src/state-sources.mjs';
import { collectState } from '../src/collectors/generic-state.mjs';
import { louisianaAlaskaLifecycleAdmitted } from '../src/louisiana-alaska-grocery-production-config.mjs';

test('AK and LA production source registrations stay dormant until canonical lifecycle admission', async () => {
  const configs = ALL_STATE_SOURCES.filter((source) => ['AK', 'LA'].includes(source.id));
  assert.deepEqual(configs.map((source) => source.id).sort(), ['AK', 'LA']);
  assert.equal(STATE_SOURCES.some((source) => ['AK', 'LA'].includes(source.id)), false);
  for (const config of configs) {
    assert.equal(config.strategy, 'retailer_store_inventory');
    assert.equal(config.sources.some((source) => source.kind === 'costco' || source.signalType === 'costco_warehouse_inventory'), false);
    assert.equal(louisianaAlaskaLifecycleAdmitted(config.id), false);
    const result = await collectState(config, {});
    assert.equal(result.productionAdmission, 'inactive_lifecycle_gate');
    assert.deepEqual(result.signals, []);
    assert.deepEqual(result.sources, []);
  }
});

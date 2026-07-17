import assert from 'node:assert/strict';
import test from 'node:test';

import { renderStateLifecycleTypes, verifyStateLifecycleDrift } from './generate-state-lifecycle-types.mjs';

test('state lifecycle TypeScript is generated from the complete authoritative JSON', () => {
  const config = {
    activeStates: ['AA'],
    reliabilityPolicy: { refreshIntervalMs: 1 },
    states: { AA: { customerLabel: 'Alpha', publicStatus: 'active' } },
  };
  const generated = renderStateLifecycleTypes(config);
  assert.match(generated, /"reliabilityPolicy"/);
  assert.match(generated, /export type ActiveStateCode/);
  assert.match(generated, /"AA"/);
});

test('lifecycle drift verifier reports a changed generated TypeScript file', async () => {
  const result = await verifyStateLifecycleDrift({
    config: { activeStates: [], reliabilityPolicy: {}, states: {} },
    actual: 'export const STATE_LIFECYCLE_CONFIG = {} as const;\n',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /drift/i);
});

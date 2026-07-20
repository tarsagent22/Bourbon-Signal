import assert from 'node:assert/strict';
import { selectVerificationStates } from './production-verification-scope.mjs';

const active = ['PA', 'VA', 'CA'];
assert.deepEqual(selectVerificationStates(active, ''), active, 'Full and scheduled refreshes must verify every active state.');
assert.deepEqual(selectVerificationStates(active, 'PA'), ['PA'], 'A PA-only recovery must verify PA without unrelated stale-state route comparisons.');
assert.deepEqual(selectVerificationStates(active, 'ca, pa'), ['PA', 'CA'], 'Target order must remain deterministic in active-state order.');
assert.throws(() => selectVerificationStates(active, 'PA,XX'), /unknown or inactive states: XX/);
console.log('Production verification scope contracts passed.');

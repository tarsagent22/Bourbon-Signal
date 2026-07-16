#!/usr/bin/env node
import { verifyStateLifecycleDrift } from './generate-state-lifecycle-types.mjs';

const result = await verifyStateLifecycleDrift();
if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}
console.log('State lifecycle drift verification passed.');

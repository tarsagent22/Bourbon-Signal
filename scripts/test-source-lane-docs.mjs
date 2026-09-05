import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
test('checkpoint and runtime docs distinguish shipped local data plane, rollback, immutable episode and current confirmation',async()=>{
  const checkpoint=await readFile(new URL('../docs/source-checkpoints.md',import.meta.url),'utf8');
  const runtime=await readFile(new URL('../docs/source-lane-runtime.md',import.meta.url),'utf8');
  assert.doesNotMatch(checkpoint,/None of those are enabled or claimed by this patch|Before an independent source can feed live alerts, implement/);
  assert.match(checkpoint,/SOURCE_LANE_POLL_ENABLED/);
  assert.match(checkpoint,/two.*SKU|two.*product/);
  assert.match(runtime,/windowComplete/);
  assert.match(runtime,/confirmationExpiresAt/);
  assert.doesNotMatch(runtime,/reconfirmation updates current evidence\/expiry/);
});

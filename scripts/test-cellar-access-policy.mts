import assert from "node:assert/strict";

import { TIER_ENTITLEMENTS } from "../src/lib/entitlements.ts";
import { getCellarAccessPolicy } from "../src/lib/cellar-access-policy.ts";

assert.deepEqual(getCellarAccessPolicy(TIER_ENTITLEMENTS.free, 0), {
  canRead: true,
  canEditExisting: true,
  canAdd: true,
  limit: 10,
  remaining: 10,
  showCapacityNotice: false,
});
assert.equal(getCellarAccessPolicy(TIER_ENTITLEMENTS.free, 7).showCapacityNotice, false, "capacity stays quiet during early use");
assert.deepEqual(getCellarAccessPolicy(TIER_ENTITLEMENTS.free, 8), {
  canRead: true,
  canEditExisting: true,
  canAdd: true,
  limit: 10,
  remaining: 2,
  showCapacityNotice: true,
});
assert.deepEqual(getCellarAccessPolicy(TIER_ENTITLEMENTS.free, 10), {
  canRead: true,
  canEditExisting: true,
  canAdd: false,
  limit: 10,
  remaining: 0,
  showCapacityNotice: true,
});
assert.deepEqual(getCellarAccessPolicy(TIER_ENTITLEMENTS.free, 75), {
  canRead: true,
  canEditExisting: true,
  canAdd: false,
  limit: 10,
  remaining: 0,
  showCapacityNotice: true,
}, "a downgraded collection remains readable and editable without allowing additions");

for (const tier of ["standard", "barrel", "bottled-in-bond"] as const) {
  assert.deepEqual(getCellarAccessPolicy(TIER_ENTITLEMENTS[tier], 75), {
    canRead: true,
    canEditExisting: true,
    canAdd: true,
    limit: null,
    remaining: null,
    showCapacityNotice: false,
  }, `${tier} has unlimited basic Cellar access`);
}

console.log("Cellar access policy tests passed.");

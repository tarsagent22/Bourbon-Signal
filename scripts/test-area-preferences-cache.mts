import assert from "node:assert/strict";
import {
  clearCachedAreaPreferences,
  getCachedAreaPreferences,
  invalidateAreaPreferencesCacheForUser,
  setCachedAreaPreferences,
} from "../src/lib/area-preferences-cache.ts";

const preferences = (state: string, areas: Record<string, string[]> = {}) => ({
  areaPreferences: { states: [state], ...areas },
});

clearCachedAreaPreferences();
setCachedAreaPreferences("user-a", preferences("NC") as never);
assert.deepEqual(getCachedAreaPreferences("user-a"), preferences("NC"));
assert.equal(getCachedAreaPreferences("user-b"), null);

invalidateAreaPreferencesCacheForUser("user-b");
assert.equal(getCachedAreaPreferences("user-a"), null, "changing Clerk users invalidates the prior user's cache");

setCachedAreaPreferences("user-b", preferences("CO", { coAreas: ["Denver Metro"] }) as never);
clearCachedAreaPreferences("user-a");
assert.deepEqual(
  getCachedAreaPreferences("user-b"),
  preferences("CO", { coAreas: ["Denver Metro"] }),
  "one user cannot clear another user's cached Denver Metro preferences",
);
invalidateAreaPreferencesCacheForUser("user-b");
assert.deepEqual(
  getCachedAreaPreferences("user-b"),
  preferences("CO", { coAreas: ["Denver Metro"] }),
  "refreshing the same account preserves its metro preferences",
);
clearCachedAreaPreferences("user-b");
assert.equal(getCachedAreaPreferences("user-b"), null);

setCachedAreaPreferences("user-c", preferences("NY", { nyAreas: ["New York City"] }) as never);
assert.deepEqual(getCachedAreaPreferences("user-c"), preferences("NY", { nyAreas: ["New York City"] }));
assert.equal(getCachedAreaPreferences("user-b"), null, "New York City preferences remain owned by their Clerk account");
clearCachedAreaPreferences();

console.log("Area preferences Clerk-user cache contract passed.");

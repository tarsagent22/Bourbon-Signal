import assert from "node:assert/strict";
import {
  clearCachedAreaPreferences,
  getCachedAreaPreferences,
  invalidateAreaPreferencesCacheForUser,
  setCachedAreaPreferences,
} from "../src/lib/area-preferences-cache.ts";

const preferences = (state: string) => ({ areaPreferences: { states: [state] } });

clearCachedAreaPreferences();
setCachedAreaPreferences("user-a", preferences("NC") as never);
assert.deepEqual(getCachedAreaPreferences("user-a"), preferences("NC"));
assert.equal(getCachedAreaPreferences("user-b"), null);

invalidateAreaPreferencesCacheForUser("user-b");
assert.equal(getCachedAreaPreferences("user-a"), null, "changing Clerk users invalidates the prior user's cache");

setCachedAreaPreferences("user-b", preferences("CA") as never);
clearCachedAreaPreferences("user-a");
assert.deepEqual(getCachedAreaPreferences("user-b"), preferences("CA"), "one user cannot clear another user's cache entry");
clearCachedAreaPreferences("user-b");
assert.equal(getCachedAreaPreferences("user-b"), null);

console.log("Area preferences Clerk-user cache contract passed.");

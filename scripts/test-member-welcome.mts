import assert from "node:assert/strict";
import { resolveSignUpRedirect, contextualProductHref } from "../src/lib/growth-events.ts";

assert.equal(resolveSignUpRedirect(null), "/welcome");
assert.equal(resolveSignUpRedirect("/release-radar?source=release_radar"), "/release-radar?source=release_radar");
assert.equal(resolveSignUpRedirect("//evil.example"), "/welcome");
assert.equal(contextualProductHref("pricing", "drop_feed"), "/pricing?source=drop_feed");
console.log("Member welcome contract passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCheckoutSource } from "../src/lib/growth-events.ts";

assert.equal(normalizeCheckoutSource("drop_feed"), "drop_feed");
assert.equal(normalizeCheckoutSource("release-radar"), "release_radar");
assert.equal(normalizeCheckoutSource("https://evil.example/?email=x@example.com"), "unknown");
const checkoutRoute = readFileSync("src/app/api/checkout/route.ts", "utf8");
const syncRoute = readFileSync("src/app/api/checkout/sync/route.ts", "utf8");
assert.match(checkoutRoute, /source:\s*["']bourbon_signal_launch["']/);
assert.match(checkoutRoute, /attributionSurface:\s*source/);
assert.match(syncRoute, /metadata\?\.source\s*!==\s*["']bourbon_signal_launch["']/);
assert.match(checkoutRoute, /checkout_started/);
console.log("Checkout attribution contract passed.");

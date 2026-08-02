import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isCanonicalFutureRetailerExpiry } from "../src/lib/retailer-repository.ts";

const repositorySource = readFileSync(new URL("../src/lib/retailer-repository.ts", import.meta.url), "utf8");
const cacheSource = readFileSync(new URL("../src/lib/retailer-public-submissions.ts", import.meta.url), "utf8");
const coverageSource = readFileSync(new URL("../src/lib/coverage-server.ts", import.meta.url), "utf8");
const dropRouteSource = readFileSync(new URL("../src/app/api/drops/route.ts", import.meta.url), "utf8");
const now = Date.parse("2026-08-02T00:00:00.000Z");

assert.match(repositorySource, /async listPublicSubmissions\(now = new Date\(\)\.toISOString\(\), limit = 250\)/);
assert.match(repositorySource, /COALESCE\(submissions\.payload->>'soldOutAt', ''\) = ''/);
assert.match(repositorySource, /COALESCE\(submissions\.payload->>'expiresAt', ''\) ~/);
assert.match(repositorySource, /submissions\.payload->>'expiresAt' > \$1/);
assert.doesNotMatch(repositorySource, /expiresAt'.*::timestamptz/);
assert.match(repositorySource, /isCanonicalFutureRetailerExpiry\(submission\.expiresAt, currentTime\)/);
assert.match(repositorySource, /LIMIT \$2/);
assert.match(cacheSource, /getRetailerRepository\(\)\.listPublicSubmissions\(\)/);
assert.doesNotMatch(cacheSource, /listActivePublicAvailabilitySubmissions/);
assert.match(coverageSource, /readCachedPublicRetailerSubmissions/);
assert.match(dropRouteSource, /readCachedPublicRetailerSubmissions/);

assert.equal(isCanonicalFutureRetailerExpiry("2026-08-03T00:00:00.000Z", now), true);
assert.equal(isCanonicalFutureRetailerExpiry("2026-08-02T00:00:00.000Z", now), false);
assert.equal(isCanonicalFutureRetailerExpiry("2026-02-30T00:00:00.000Z", now), false);
assert.equal(isCanonicalFutureRetailerExpiry("not-a-date", now), false);
assert.equal(isCanonicalFutureRetailerExpiry("2026-08-03T00:00:00Z", now), false);

console.log("public retailer submission contract tests passed");

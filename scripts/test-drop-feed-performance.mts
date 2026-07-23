import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [routeSource, snapshotSource, repositorySource, feedSource] = await Promise.all([
  readFile(new URL("../src/app/api/drops/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/site-engine-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/retailer-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8"),
]);

assert.match(snapshotSource, /const readActivePointer = unstable_cache\([\s\S]*?revalidate:\s*15/, "the mutable snapshot pointer should use a short server data cache instead of a Blob round trip on every private feed request");
assert.match(repositorySource, /listPublicSubmissions\(options:[\s\S]*?ensureSchema\?: boolean[\s\S]*?if \(options\.ensureSchema !== false\) await this\.ensureSchema\(\)/, "public feed reads must be able to skip request-path schema migration work");
assert.match(routeSource, /listPublicSubmissions\(\{ ensureSchema: false \}\)/, "the Drop Feed must not run retailer schema migrations on reads");
assert.match(routeSource, /unstable_cache\([\s\S]*?public-retailer-submissions-v2[\s\S]*?revalidate:\s*15/, "public retailer rows should be shared briefly across feed filter requests");
assert.match(routeSource, /retailerSubmissions\.length > 0\s*\? await getBourbonBible\(\)\s*:\s*\[\]/, "the Drop Feed should not fetch the bottle catalog when there are no retailer submissions to enrich");
assert.match(feedSource, /const dropFeedResponseCache = new Map/, "recent filter responses should be reusable during the browser session");
assert.match(feedSource, /new AbortController\(\)[\s\S]*?controller\.abort\(\)/, "superseded filter requests should be aborted");
assert.match(feedSource, /fetchDropFeedPage\([^)]*signal[^)]*forceRefresh/, "filter loading should use the cached, cancellable page fetcher");

console.log("Drop feed performance contract passed.");

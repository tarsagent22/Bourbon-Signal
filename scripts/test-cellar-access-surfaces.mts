import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/app/api/user/preferences/route.ts");
const dashboard = read("src/app/dashboard/page.tsx");
const bottleCheck = read("src/app/bottle-check/page.tsx");
const nativeCellar = read("apps/mobile/app/(app)/(tabs)/cellar.tsx");
const nativeSignal = read("apps/mobile/app/(app)/signal/[id].tsx");
const nativeTypes = read("apps/mobile/src/api/types.ts");

assert.match(route, /collectionAccess:\s*getCellarAccessPolicy/, "the account/preferences response returns canonical Cellar capabilities");
assert.match(route, /MemberCollectionLimitError/, "the API recognizes durable collection limit errors");
assert.match(route, /code:\s*["']collection_limit_reached["']/, "the API returns a stable collection limit code");
assert.match(route, /limit:\s*error\.limit/);
assert.match(route, /currentCount:\s*error\.currentCount/);

assert.match(dashboard, /getCellarAccessPolicy/);
assert.match(dashboard, /Your Free Cellar is full/);
assert.match(dashboard, /Existing bottles stay available/);
assert.doesNotMatch(dashboard, /My Collection demo|saving bottles and ratings starts with Barrel Proof/i);
assert.match(bottleCheck, /collectionBottleCount:\s*collectionEntries\.length/);
assert.match(bottleCheck, /alreadyInCollection:\s*isInCollection/);

assert.match(nativeTypes, /collectionAccess:\s*CellarAccessPolicy/);
assert.match(nativeCellar, /preferences\?\.collectionAccess/);
assert.match(nativeCellar, /Your Free Cellar is full/);
assert.match(nativeCellar, /Existing bottles stay available/);
assert.match(nativeCellar, /data=\{bottles\}/, "stored bottles are never hidden by tier");
assert.doesNotMatch(nativeCellar, /Cellar is not included with this membership/);
assert.match(nativeSignal, /collectionAccess\?\.canAdd/);
assert.match(nativeSignal, /Free Cellar is full/);

console.log("Web and native Cellar access contracts passed.");

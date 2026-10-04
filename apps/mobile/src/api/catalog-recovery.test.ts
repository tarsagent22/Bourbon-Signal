import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi, MobileApiError } from "./client";
import { createBottleSearchIndex, rankBottleCatalog } from "../cellar/bottle-search";
import { filterBottleSuggestions } from "../sightings/post-composer";
import { loadWithMocks } from "../astra-test-harness";
test("catalog route returns a non-cacheable outage instead of successful empty inventory", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const route = loadWithMocks("../../src/app/api/bottles/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/site-engine-contract": { readSiteExport: async () => { throw new Error("export offline"); } },
    "@/lib/bourbonBible": {},
    "@/lib/bottle-search": {},
  });
  const response = await route.GET({ nextUrl: new URL("https://fixture.test/api/bottles") });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).code, "CATALOG_UNAVAILABLE");
});
test("legacy empty-success catalog failures are rejected and retry fetches fresh data", async () => {
  let calls = 0;
  const api = createMobileApi({baseUrl:"https://catalog-recovery.test",getToken:async()=>"test",fetcher:async()=>Response.json(++calls===1?{bottles:[],error:"Export unavailable"}:{bottles:[{id:"weller",canonicalName:"W.L. Weller Full Proof",aliases:["Weller FP"]}]})});
  await assert.rejects(api.listBottleCatalog(),(error:unknown)=>error instanceof MobileApiError && error.code==="CATALOG_UNAVAILABLE");
  const [radar,post,shelf] = await Promise.all([api.listBottleCatalog(),api.listBottleCatalog(),api.listBottleCatalog()]);
  assert.equal(calls,2,"all pickers share one successful request");
  for(const catalog of [radar,post,shelf]) assert.equal(rankBottleCatalog(createBottleSearchIndex(catalog),"Weller FP")[0].id,"weller");
  assert.deepEqual(filterBottleSuggestions(post,"Weller FP"),rankBottleCatalog(createBottleSearchIndex(shelf),"Weller FP"));
});

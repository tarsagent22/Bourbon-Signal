import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authorizeOpsBearer, isAggregateScorecard } from "../src/lib/ops-auth.ts";

assert.equal(authorizeOpsBearer("Bearer correct", "correct", "production"), true);
assert.equal(authorizeOpsBearer("Bearer wrong", "correct", "production"), false);
assert.equal(authorizeOpsBearer(null, "", "production"), false);
assert.equal(authorizeOpsBearer(null, "", "development"), true);
assert.equal(isAggregateScorecard({ contractVersion: "bourbon-signal/company-scorecard@1", generatedAt: new Date().toISOString(), sections: { company: {}, product: {}, data: {}, shipping: {}, decision: {} } }), true);
assert.equal(isAggregateScorecard({ email: "person@example.com", dimensions: {} }), false);
const route = await readFile(new URL("../src/app/api/ops/company-scorecard/route.ts", import.meta.url), "utf8");
assert.match(route, /authorizeOpsBearer/);
assert.match(route, /getCompanyControlRoomSnapshot/);
assert.match(route, /snapshot\.scorecard/);
console.log("Company scorecard feed contract passed.");

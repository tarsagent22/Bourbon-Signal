import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { GET } = require("../src/app/api/ops/active-coverage-requests/route.ts") as typeof import("../src/app/api/ops/active-coverage-requests/route.ts");

test("active coverage brief route rejects unsigned and invalid reads before database access", async () => {
  const response = await GET(new Request("https://www.bourbonsignal.com/api/ops/active-coverage-requests"));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const invalid = await GET(new Request("https://www.bourbonsignal.com/api/ops/active-coverage-requests", {
    headers: { Authorization: "Bearer invalid-read-secret" },
  }));
  assert.equal(invalid.status, 401);
});

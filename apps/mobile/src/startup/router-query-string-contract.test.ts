import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const requireFromExpoRouter = createRequire(require.resolve("expo-router"));

test("Expo Router receives the query-string namespace API it calls", () => {
  const queryString = requireFromExpoRouter("query-string") as { stringify?: unknown; parse?: unknown };
  assert.equal(typeof queryString.stringify, "function");
  assert.equal(typeof queryString.parse, "function");
});

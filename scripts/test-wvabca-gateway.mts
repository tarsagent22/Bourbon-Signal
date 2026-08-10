import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  authorizeWvabcaGateway,
  mergeWvabcaCookieHeader,
  parseWvabcaGatewayArray,
  requireValidWvabcaProductRows,
  requireValidWvabcaStoreRows,
} from "../src/lib/wvabca-source-gateway.ts";
import { readWestVirginiaGatewayResponse } from "../engine/src/collectors/west-virginia-official.mjs";

test("WVABCA gateway requires the complete Bearer authorization scheme", () => {
  const previous = process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY;
  process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY = "gateway-contract-test-key";
  try {
    const token = createHmac("sha256", process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY)
      .update("bourbon-signal/wvabca-gateway@1")
      .digest("hex");
    assert.equal(authorizeWvabcaGateway(`Bearer ${token}`), "authorized");
    assert.equal(authorizeWvabcaGateway(token), "unauthorized");
    assert.equal(authorizeWvabcaGateway(`Basic ${token}`), "unauthorized");
    assert.equal(authorizeWvabcaGateway(`Bearer ${token} extra`), "unauthorized");
  } finally {
    if (previous === undefined) delete process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY;
    else process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY = previous;
  }
});

test("WVABCA gateway carries API-issued session cookies across requests", () => {
  assert.equal(
    mergeWvabcaCookieHeader("seed=one; ASP.NET_SessionId=old", "ASP.NET_SessionId=fresh; affinity=west"),
    "seed=one; ASP.NET_SessionId=fresh; affinity=west",
  );
  assert.equal(mergeWvabcaCookieHeader("seed=one", ""), "seed=one");
});

test("WVABCA gateway rejects malformed array members instead of filtering them", () => {
  assert.deepEqual(parseWvabcaGatewayArray('[{"StoreNumber":1}]', "stores"), [{ StoreNumber: 1 }]);
  for (const body of ['[null,{"StoreNumber":1}]', '[[],{"StoreNumber":1}]', '["bad"]']) {
    assert.throws(() => parseWvabcaGatewayArray(body, "stores"), /malformed row/i);
  }
});

test("WVABCA gateway rejects the entire retailer response when one store identity is invalid", () => {
  const context = { expectedProductId: 827, bottleSize: 750 };
  const store = (StoreNumber: number, overrides: Record<string, unknown> = {}) => ({
    StoreNumber,
    ProductID: 827,
    BottleSize: 750,
    StoreName: `Store ${StoreNumber}`,
    StreetAddress1: `${StoreNumber} Main St`,
    City: "Charleston,WV",
    ProductName: "Buffalo Trace",
    ...overrides,
  });
  assert.deepEqual(requireValidWvabcaStoreRows([store(1), store(2)], context), [store(1), store(2)]);
  for (const rows of [
    [store(1), store(1)],
    [store(1), store(2, { ProductID: 734 })],
    [store(1), store(2, { BottleSize: 375 })],
    [store(1), store(2, { StoreName: "" })],
    [store(1), store(2, { StoreNumber: 0 })],
  ]) {
    assert.throws(() => requireValidWvabcaStoreRows(rows, context), /store identity/i);
  }
});

test("WVABCA gateway rejects the entire catalog response when one product identity is invalid", () => {
  const valid = { ProductID: 827, ProductName: "Buffalo Trace", BottleSize: "750,1750" };
  assert.deepEqual(requireValidWvabcaProductRows([valid]), [valid]);
  for (const rows of [
    [{}, valid],
    [{ ProductID: 827, ProductName: "", BottleSize: "750" }],
    [{ ProductID: 827, ProductName: "Buffalo Trace", BottleSize: "" }],
  ]) {
    assert.throws(() => requireValidWvabcaProductRows(rows), /product identity/i);
  }
});

test("WVABCA gateway cancels oversized streamed responses before full buffering", async () => {
  const response = new Response(new Uint8Array(1025));
  await assert.rejects(() => readWestVirginiaGatewayResponse(response, 1024), /byte limit/i);
});

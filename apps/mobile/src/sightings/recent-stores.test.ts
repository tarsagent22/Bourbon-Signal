import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentStores, recentStoresKey, rememberStore } from "./recent-stores";
const store = (name: string, address = "123 Main St") => ({ id: null, name, address, city: "Raleigh", state: "NC" });
test("recent stores retain manual addresses, stay bounded, and keep branches of the same chain separate", () => {
  let rows = rememberStore([], store("ABC", "10 Main St"));
  rows = rememberStore(rows, store("ABC", "20 Main St"));
  rows = rememberStore(rows, store("ABC", "30 Main St"));
  rows = rememberStore(rows, store("ABC", "40 Main St"));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.address), ["40 Main St", "30 Main St", "20 Main St"]);
  assert.equal(rememberStore(rows, store("ABC", "20 Main St"))[0].address, "20 Main St");
});
test("corrupt or incomplete store history cannot populate a post, and accounts use different keys", () => {
  for (const raw of [null, "broken", "{}", JSON.stringify([{ name: "No address" }]), JSON.stringify([store("ABC", "")])]) assert.deepEqual(parseRecentStores(raw), []);
  assert.notEqual(recentStoresKey("user_A"), recentStoresKey("user_B"));
});

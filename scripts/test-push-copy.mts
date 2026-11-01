import assert from "node:assert/strict";
import test from "node:test";
import { buildPushPreview, pushCopyVariant } from "../src/lib/push-copy.ts";
import { buildExpoPushMessages, sendExpoPushMessages } from "../src/lib/push-devices.ts";

const names = ["E.H. Taylor Small Batch", "Blanton’s", "Eagle Rare 10 Year"];
const details = { storeLabel: "Triad ABC Board", matchedArea: "the Triad", quantity: 16 };

test("alert locations omit administrative city and town suffixes and preserve proper names", async () => {
  for (const [input, expected] of [
    ["Gilbert town", "Gilbert"], ["Gilbert town, AZ", "Gilbert, AZ"],
    ["Chandler city", "Chandler"], ["Chandler city, AZ", "Chandler, AZ"],
    ["Queen Creek town", "Queen Creek"], ["Salt Lake City city", "Salt Lake City"],
    ["Charles Town town", "Charles Town"], ["Kansas City", "Kansas City"],
    ["Charles Town", "Charles Town"], ["Town and Country", "Town and Country"],
    ["  Gilbert\n town  ", "Gilbert"],
  ]) {
    const community = buildPushPreview("locality", ["Stagg"], { sourceType: "community", storeCity: input });
    assert.equal(community.body, `Stagg\n${expected}`);
    const fallback = buildPushPreview("locality", ["Stagg"], { sourceType: "community", matchedArea: input });
    assert.equal(fallback.body, `Stagg\n${expected}`);
    for (let i = 0; i < 12; i++) {
      const message = buildExpoPushMessages(["ExpoPushToken[aaaaaaaaaaaaaaaa]"], {
        id: `locality-${i}`, bottleName: "Stagg", matchedArea: input, storeLabel: "Old Town Liquor city",
      })[0]!;
      let wire: any;
      await sendExpoPushMessages([message], (async (_url, init) => {
        wire = JSON.parse(String(init?.body))[0];
        return Response.json({ data: [{ status: "ok", id: "receipt" }] });
      }) as typeof fetch);
      assert.ok(`${wire.title}\n${wire.body}`.includes(expected));
      assert.match(wire.body, /Old Town Liquor city/);
      if (input.includes(" town") || input.includes(" city")) {
        assert.ok(!`${wire.title}\n${wire.body}`.replace("Old Town Liquor city", "").includes(input.trim()));
      }
    }
  }
});

test("different alerts vary; a retry or another device keeps exactly the same copy", () => {
  const copies = new Set(Array.from({ length: 60 }, (_, i) => JSON.stringify(buildPushPreview(`alert-${i}`, [names[0]], details))));
  assert.equal(copies.size, 3);
  const alert = { id: "stable-alert", bottleName: names[0]!, ...details };
  const messages = buildExpoPushMessages(["ExpoPushToken[aaaaaaaaaaaaaaaa]", "ExpoPushToken[bbbbbbbbbbbbbbbb]"], alert);
  assert.equal(messages[0]?.title, messages[1]?.title);
  assert.deepEqual(buildExpoPushMessages([messages[0]!.to], alert)[0], messages[0]);
});

test("physical quantities, release counts and allocated claims keep distinct meanings", () => {
  for (let i = 0; i < 12; i++) {
    const single = buildPushPreview(String(i), [names[0]], details);
    assert.match(single.body, /Triad ABC Board reports 16 bottles/);
    const mixed = buildPushPreview(String(i), names, details);
    assert.match(mixed.title, /3 releases/);
    assert.doesNotMatch(mixed.title, /allocated|3 bottles/);
    const allocated = buildPushPreview(String(i), names, { ...details, allBottlesAllocated: true });
    assert.match(allocated.title, /3 allocated releases/);
    assert.match(allocated.body, /E.H. Taylor Small Batch, Blanton’s \+ 1 more/);
    assert.doesNotMatch(buildPushPreview(String(i), [names[0]], { quantity: 0 }).body, /0 bottles/);
    assert.doesNotMatch(JSON.stringify(single), /sample|test|back in stock|near you/i);
  }
});

test("Community uses the approved title and two body lines, preserving reported estimates and cents", () => {
  assert.deepEqual(buildPushPreview("sighting", ["E.H. Taylor Single Barrel"], {
    sourceType: "community", quantityEstimate: "4", price: 95,
    storeLabel: "Durham ABC", storeCity: "Durham", state: "NC",
  }), { title: "Community sighting", body: "E.H. Taylor Single Barrel · 4 bottles · $95\nDurham ABC · Durham, NC" });
  const ranged = buildPushPreview("range", [names[0]], { sourceType: "community", quantityEstimate: "6-12", price: 95.5 });
  assert.match(ranged.body, /6-12 bottles · \$95.50/);
  const unknown = buildPushPreview("missing", [names[0]], { sourceType: "community", quantityEstimate: "unknown", price: null });
  assert.equal(unknown.body, names[0]);
  assert.doesNotMatch(unknown.body, /unknown|undefined|null|\$/);
});

test("long names, duplicate names, unsafe controls and missing metadata remain readable", () => {
  const long = buildPushPreview("long", ["A".repeat(100), "B".repeat(100)], details);
  assert.ok(Array.from(long.title).length <= 100);
  assert.match(long.title, /2 releases/);
  assert.match(long.body, /AAAA/);
  assert.match(long.body, /BBBB/);
  const clean = buildPushPreview("clean", ["Stagg\n\u202e", "stagg"], { storeLabel: "ABC\n\u202e", quantity: 1 });
  assert.match(clean.title, /Stagg/);
  assert.match(clean.body, /ABC reports 1 bottle\./);
  assert.doesNotMatch(JSON.stringify(clean), /releases|\\u202e/);
  assert.equal(buildPushPreview("none", []).title, "Bourbon Signal");
});

test("provider reconstructs approved copy and strips raw inputs and account data", async () => {
  const message = buildExpoPushMessages(["ExpoPushToken[aaaaaaaaaaaaaaaa]"], {
    id: "owned-alert", bottleName: names[0]!, ...details,
  })[0]!;
  let wire: any;
  await sendExpoPushMessages([{ ...message, title: "Injected", body: "Injected", data: { ...message.data, userId: "private-owner" } } as any], (async (_url, init) => {
    wire = JSON.parse(String(init?.body))[0];
    return Response.json({ data: [{ status: "ok", id: "receipt" }] });
  }) as typeof fetch);
  assert.equal(wire.title, message.title);
  assert.equal(wire.body, message.body);
  assert.deepEqual(wire.data, { screen: "radar", alertId: "owned-alert" });
  assert.doesNotMatch(JSON.stringify(wire), /Injected|private-owner|reportDetails|bottleNames|dedupeKey/);
  assert.ok(pushCopyVariant("owned-alert", 3) >= 0);
});

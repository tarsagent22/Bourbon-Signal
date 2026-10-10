import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { applyBottleMuteMutation, createBottleMuteMatcher, normalizeBottleMutes } from "../src/lib/bottle-mutes";
import { enumerateUnderlyingAlertChildren } from "../src/lib/alert-dedupe";
import { getEntitlements } from "../src/lib/entitlements";
import { deliveryFixture } from "./fixtures/source-delivery-fixture.mts";

const catalog = [
  { id: "taylor-small", canonicalName: "E.H. Taylor Small Batch", aliases: ["EH Taylor Small Batch", "Taylor"] },
  { id: "taylor-single", canonicalName: "E.H. Taylor Single Barrel", aliases: ["EH Taylor Single Barrel", "Taylor"] },
  { id: "eagle", canonicalName: "Eagle Rare 10 Year", aliases: ["Eagle Rare"] },
];
const candidate = (id: string, bottle: string) => ({ id, bottle, availabilityEpisodeId: id, dedupeKey: id, sourceType: "engine", signalAt: new Date().toISOString(), state: "SC", eligibleForDelivery: true });
const lane = { invokeSourceProvider: async ({ validate, send }: any) => await validate() ? { suppressed: false, result: await send() } : { suppressed: true } };
test("real worker excludes a muted bottle from inbox and push even with broad preferences", async () => {
  for (const channel of ["onSite", "push"]) {
    const f = deliveryFixture([candidate("muted", "Eagle Rare")], lane, { getBourbonBible: async () => catalog }, channel);
    (f.user.privateMetadata as any).mutedBottles = { bottles: [{ bottleId: "eagle", bottleName: "Eagle Rare 10 Year" }], version: 1 };
    const result = await f.run();
    assert.equal(result.errors.length, 0);
    assert.equal(result.onSiteAlertsCreated, 0);
    assert.equal(f.sends.length, 0);
  }
});
test("real queued push rechecks a newly saved mute and retains the unmuted subset", async () => {
  const f = deliveryFixture([candidate("muted", "Eagle Rare"), candidate("wanted", "E.H. Taylor Single Barrel")], lane, { getBourbonBible: async () => catalog, groupCandidatesByLocation: (children: any[]) => children.length ? [{ ...children[0], __groupCandidates: children }] : [],
    candidateToMemberAlert: (_user: any, group: any, now: any) => ({ id: group.id, bottleName: (group.__groupCandidates || [group]).map((c: any) => c.bottle).join(", "), signalAt: now, freshnessLimitHours: 2 }),
    buildExpoPushMessages: (_tokens: any, alert: any) => [{ body: alert.bottleName }],
  }, "push");
  let sentBody = "";
  f.context.drainPushOutbox = async (_repo: any, _user: any, _owner: any, callbacks: any) => {
    (f.user.privateMetadata as any).mutedBottles = { bottles: [{ bottleId: "eagle", bottleName: "Eagle Rare 10 Year" }], version: 1 };
    const resolved = await callbacks.resolve({ alertId: "existing-group", stableKeys: ["muted", "wanted"] });
    assert.ok(resolved);
    sentBody = resolved.messages[0].body;
  };
  const result = await f.run();
  assert.equal(result.errors.length, 0);
  assert.equal(sentBody, "E.H. Taylor Single Barrel");
});
test("real queued push is suppressed when all its bottles were muted after enqueue", async () => {
  const f = deliveryFixture([candidate("muted", "Eagle Rare")], lane, { getBourbonBible: async () => catalog }, "push");
  let checked = false;
  f.context.drainPushOutbox = async (_repo: any, _user: any, _owner: any, callbacks: any) => {
    (f.user.privateMetadata as any).mutedBottles = { bottles: [{ bottleId: "eagle", bottleName: "Eagle Rare 10 Year" }], version: 1 };
    assert.equal(await callbacks.resolve({ alertId: "pending", stableKeys: ["muted"] }), null);
    checked = true;
  };
  const result = await f.run();
  assert.equal(result.errors.length, 0);
  assert.equal(checked, true);
  assert.equal(f.sends.length, 0);
});
test("muting is exact, alias aware, and cannot suppress a different expression", () => {
  const state = applyBottleMuteMutation(normalizeBottleMutes(null), { bottleId: "taylor-small", bottleName: "EH Taylor Small Batch", muted: true }, catalog);
  const muted = createBottleMuteMatcher(state, catalog);
  assert.equal(muted({ bottle: "EH Taylor Small Batch" }), true);
  assert.equal(muted({ bottleId: "taylor-small", bottle: "Unknown name" }), true);
  assert.equal(muted({ bottle: "E.H. Taylor Single Barrel" }), false);
  assert.equal(muted({ canonicalName: "E.H. Taylor Single Barrel", rawName: "EH Taylor Small Batch" }), false);
  assert.equal(muted({ bottleId: "taylor-single", bottle: "EH Taylor Small Batch" }), false);
  assert.equal(muted({ bottle: "Taylor" }), false, "an alias shared by expressions is ambiguous");
  assert.equal(muted({ bottle: "E.H. Taylor Small Batch Barrel Proof" }), false);
});
test("independent mutations preserve the list and explicit unmuting wins", () => {
  let state = normalizeBottleMutes(null);
  state = applyBottleMuteMutation(state, { bottleName: "Eagle Rare", muted: true }, catalog);
  state = applyBottleMuteMutation(state, { bottleId: "taylor-small", bottleName: "Taylor Small Batch", muted: true }, catalog);
  state = applyBottleMuteMutation(state, { bottleName: "Eagle Rare", muted: false }, catalog);
  assert.deepEqual(state.bottles.map(b => b.bottleId), ["taylor-small"]);
  assert.equal(createBottleMuteMatcher(state, catalog)({ bottle: "Eagle Rare" }), false);
  assert.throws(() => applyBottleMuteMutation(state, { bottleName: "", muted: true }, catalog));
  assert.throws(() => applyBottleMuteMutation(state, { bottleName: "Eagle Rare", bottleId: "spoofed", muted: true }, catalog));
});
test("mixed engine and Community groups retain unmuted children", () => {
  const state = applyBottleMuteMutation(normalizeBottleMutes(null), { bottleName: "Eagle Rare", muted: true }, catalog);
  const muted = createBottleMuteMatcher(state, catalog);
  const group = { __groupCandidates: [
    { id: "a", bottle: "Eagle Rare", sourceType: "engine" },
    { id: "b", bottleId: "eagle", bottle: "Eagle Rare 10 Year", sourceType: "community" },
    { id: "c", bottle: "EH Taylor Single Barrel", sourceType: "engine" },
  ] };
  const children = enumerateUnderlyingAlertChildren(group as any).filter(child => !muted(child));
  assert.deepEqual(children.map((c: any) => c.id), ["c"]);
});

async function route(f: any) {
  const stubs: Record<string, string> = {
    "@clerk/nextjs/server": "export const auth=async()=>({userId:f.userId}); export const clerkClient=async()=>({users:f.users});",
    "@/lib/server-entitlements": "export const getServerEntitlements=async()=>f.entitlements;",
    "@/lib/bourbonBible": "export const getBourbonBible=async()=>f.catalog;",
    "@/lib/member-collection-repository": "export const getMemberCollectionRepository=()=>({getForUser:async()=>({bottles:[],version:0})}); export class MemberCollectionConflictError extends Error{}; export class MemberCollectionLimitError extends Error{};",
    "@/lib/preview-qa": "export const isQaPreviewRequest=()=>false; export const getQaPreviewTierFromRequest=()=>\"free\"; export const QA_PREVIEW_PREFERENCES={};",
    "@/lib/alert-queue/member-lease": "export const withMemberAlertLease=(id,op,options)=>f.lease(id,op,options);",
    "next/server": "export const NextResponse=Response; export const NextRequest=Request;",
  };
  const output = await build({ entryPoints: ["src/app/api/user/preferences/route.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", plugins: [{ name: "offline", setup(b) {
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: "fixture" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: stubs[a.path], loader: "js" }));
  } }] });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", "f", "Response", "Request", output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports, f, Response, Request);
  return module.exports;
}
function fixture() {
  const f: any = { userId: "member-a", catalog, entitlements: getEntitlements("standard"), locked: false, durable: true, usersById: {
    "member-a": { publicMetadata: { unrelated: "preserve", bottleAlertPreferences: { bottleNames: ["Eagle Rare"], bottleKeys: ["eagle rare"] } }, privateMetadata: { unrelatedPrivate: true } },
    "member-b": { publicMetadata: {}, privateMetadata: {} },
  } };
  f.users = { getUser: async (id: string) => structuredClone(f.usersById[id]), updateUserMetadata: async (id: string, patch: any) => {
    for (const key of Object.keys(patch)) f.usersById[id][key] = { ...f.usersById[id][key], ...structuredClone(patch[key]) };
  } };
  f.lease = async (_id: string, op: any, options: any) => {
    if (!f.durable && options?.requireDurable) throw Error("No durable lease");
    if (f.locked) return { acquired: false };
    f.locked = true;
    try { return { acquired: true, result: await op(async () => { if (f.lost) throw Error("Lease lost"); }) }; } finally { f.locked = false; }
  };
  return f;
}
const post = (r: any, mutation: any) => r.POST(new Request("https://fixture.invalid/api/user/preferences", { method: "POST", body: JSON.stringify({ bottleMuteMutation: mutation }), headers: { "Content-Type": "application/json" } }));
test("real preference route persists per account without replacing watches or unrelated metadata", async () => {
  const f = fixture(), r = await route(f);
  const response = await post(r, { bottleName: "Eagle Rare", muted: true });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).mutedBottles.bottles, [{ bottleId: "eagle", bottleName: "Eagle Rare 10 Year" }]);
  assert.equal(f.usersById["member-a"].publicMetadata.unrelated, "preserve");
  assert.deepEqual(f.usersById["member-a"].publicMetadata.bottleAlertPreferences.bottleNames, ["Eagle Rare"]);
  assert.equal(f.usersById["member-a"].privateMetadata.unrelatedPrivate, true);
  f.userId = "member-b";
  assert.deepEqual((await (await r.GET(new Request("https://fixture.invalid"))).json()).mutedBottles.bottles, []);
  f.userId = "member-a";
  assert.equal((await (await r.GET(new Request("https://fixture.invalid"))).json()).mutedBottles.bottles.length, 1);
  assert.equal((await post(r, { bottleId: "eagle", bottleName: "Eagle Rare", muted: false })).status, 200);
  assert.equal(f.usersById["member-a"].privateMetadata.mutedBottles.bottles.length, 0);
});
test("busy and lost leases cannot write a mute; stale clients preserve independent mutes", async () => {
  const f = fixture(), a = await route(f), b = await route(f);
  const mutations = [{ bottleName: "Eagle Rare", muted: true }, { bottleName: "EH Taylor Small Batch", muted: true }];
  const responses = await Promise.all([post(a, mutations[0]), post(b, mutations[1])]);
  for (let i = 0; i < responses.length; i++) if (responses[i].status === 409) assert.equal((await post(i ? b : a, mutations[i])).status, 200); else assert.equal(responses[i].status, 200);
  assert.equal(f.usersById["member-a"].privateMetadata.mutedBottles.bottles.length, 2);
  f.lost = true;
  assert.equal((await post(a, { bottleName: "Eagle Rare", muted: false })).status, 503);
  assert.equal(f.usersById["member-a"].privateMetadata.mutedBottles.bottles.length, 2);
});

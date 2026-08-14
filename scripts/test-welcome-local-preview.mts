import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWelcomeLocalPreviewSnapshot,
  resolveWelcomeLocalPreviewTarget,
  toWelcomeLocalPreviewPayload,
  welcomeLocalPreviewAccess,
  welcomeLocalPreviewRemainingMs,
  welcomeLocalPreviewSignalLocation,
  welcomeLocalPreviewTargetDetails,
  welcomeLocalPreviewTargetScope,
  type WelcomeLocalPreviewCandidateTarget,
  type WelcomeLocalPreviewRecord,
} from "../src/lib/welcome-local-preview.ts";
import {
  welcomeStateSignalRows,
  welcomeStateSignalsCanLoad,
} from "../src/lib/welcome-state-signal-access.ts";

const now = Date.parse("2026-08-05T20:00:00.000Z");
assert.equal(welcomeLocalPreviewAccess({ createdAt: now - 60_000, record: null, now }), "eligible");
assert.equal(welcomeLocalPreviewAccess({ createdAt: now - 25 * 60 * 60_000, record: null, now }), "ineligible");

const ownedStateSignals = {
  userId: "user_1",
  stateCode: "VA",
  rows: [{ id: "signal_1" }],
};
assert.equal(welcomeStateSignalsCanLoad("eligible"), true);
for (const status of ["active", "expired", "ineligible", "loading", "error"] as const) {
  assert.equal(welcomeStateSignalsCanLoad(status), false, `${status} must not load the generic state feed`);
  assert.deepEqual(
    welcomeStateSignalRows({ status, owner: ownedStateSignals, userId: "user_1", stateCode: "VA" }),
    [],
    `${status} must not render generic state-feed rows`,
  );
}
assert.deepEqual(
  welcomeStateSignalRows({ status: "eligible", owner: ownedStateSignals, userId: "user_1", stateCode: "VA" }),
  ownedStateSignals.rows,
);
assert.deepEqual(
  welcomeStateSignalRows({ status: "eligible", owner: ownedStateSignals, userId: "user_1", stateCode: "NC" }),
  [],
  "rows fetched for an old state must not flash after a state change",
);
assert.deepEqual(
  welcomeStateSignalRows({ status: "eligible", owner: ownedStateSignals, userId: "user_2", stateCode: "VA" }),
  [],
  "rows fetched for an old account must not flash after an account change",
);

const activeRecord: WelcomeLocalPreviewRecord = {
  userId: "user_1",
  redeemedAt: "2026-08-05T19:55:00.000Z",
  expiresAt: "2026-08-05T20:10:00.000Z",
  target: {
    kind: "store",
    stateCode: "VA",
    label: "Virginia ABC Store 49",
    status: "actively-monitored",
    city: "Arlington",
    address: "881 North Quincy Street Arlington VA 22203",
    areaLabel: "Arlington",
  },
  recent: [],
  earlier: [],
};
const candidateTarget: WelcomeLocalPreviewCandidateTarget = {
  ...activeRecord.target,
  canonicalTargetKey: "store:VA:49",
  storeId: "49",
  targetScope: "store",
};
assert.equal(
  welcomeLocalPreviewSignalLocation({
    historical: false,
    display_location: "Arlington (Arlington County Co.)",
    board_name: "Arlington (Arlington County Co.)",
    store_name: "Virginia ABC Store 378",
    store_city: "Arlington",
  }, "Virginia"),
  "Virginia ABC Store 378",
  "signal cards must prefer the specific store over a generic city or board display label",
);
assert.equal(
  welcomeLocalPreviewSignalLocation({ historical: false, board_name: "Wake County ABC", locationName: "Generic area" }, "North Carolina"),
  "Wake County ABC",
  "board-level signals must identify the board",
);
assert.deepEqual(
  welcomeLocalPreviewTargetDetails({
    kind: "city",
    stateCode: "VA",
    label: "Arlington",
    status: "covered",
    city: "Arlington",
    address: null,
    areaLabel: "Arlington",
  }),
  [],
  "a selected city repeated across label, city, and area must render only once",
);
assert.equal(welcomeLocalPreviewAccess({ createdAt: now - 60_000, record: activeRecord, now }), "active");
assert.equal(welcomeLocalPreviewAccess({ createdAt: now - 60_000, record: { ...activeRecord, expiresAt: "2026-08-05T19:59:59.000Z" }, now }), "expired");
assert.equal(welcomeLocalPreviewRemainingMs(activeRecord, now), 10 * 60_000, "remaining time is computed from server time");
assert.equal(
  welcomeLocalPreviewRemainingMs({ ...activeRecord, expiresAt: "2026-08-05T20:30:00.000Z" }, now),
  15 * 60_000,
  "remaining time can never exceed the preview duration",
);
assert.equal(welcomeLocalPreviewRemainingMs({ ...activeRecord, expiresAt: "2026-08-05T19:59:59.000Z" }, now), 0);

const drops = Array.from({ length: 22 }, (_, index) => ({
  id: `matching-${index}`,
  brand_name: `Matching ${index}`,
  state: "VA",
  store_id: "49",
  store_name: "Virginia ABC Store 49",
  store_city: "Arlington",
  store_address: "881 North Quincy Street Arlington VA 22203",
  event_type: "store_inventory_result",
  location_precision: "store_level",
  can_alert_as_inventory: true,
  quantity_in_stock: 1,
  rarity_tier: "standard",
  timestamp: new Date(now - index * 60_000).toISOString(),
  historical: index >= 7,
}));
drops.push({
  id: "area-peer",
  brand_name: "Area peer",
  state: "VA",
  store_id: "10",
  store_name: "Virginia ABC Store 10",
  store_city: "Arlington",
  store_address: "Arlington VA",
  event_type: "store_inventory_result",
  location_precision: "store_level",
  can_alert_as_inventory: true,
  quantity_in_stock: 1,
  rarity_tier: "standard",
  timestamp: new Date(now + 60_000).toISOString(),
  historical: false,
});
drops.push({
  id: "wrong-city",
  brand_name: "Wrong city",
  state: "VA",
  store_id: "8",
  store_name: "Virginia ABC Store 8",
  store_city: "Richmond",
  store_address: "8 Broad Street Richmond VA",
  event_type: "store_inventory_result",
  location_precision: "store_level",
  can_alert_as_inventory: true,
  quantity_in_stock: 1,
  rarity_tier: "standard",
  timestamp: new Date(now + 120_000).toISOString(),
  historical: false,
});

const snapshot = buildWelcomeLocalPreviewSnapshot({ target: activeRecord.target, drops });
assert.equal(snapshot.recent.length, 5, "the initial local preview is capped at five signals");
assert.equal(snapshot.earlier.length, 10, "See earlier is capped at ten frozen rows");
assert.ok([...snapshot.recent, ...snapshot.earlier].every((drop) => drop.store_city === "Arlington"), "the preview stays inside the selected store's area");
assert.deepEqual(snapshot.recent.map((drop) => drop.brand_name), ["Area peer", "Matching 0", "Matching 1", "Matching 2", "Matching 3"]);
assert.deepEqual(snapshot.earlier.map((drop) => drop.brand_name), Array.from({ length: 10 }, (_, index) => `Matching ${index + 4}`));

const evidenceResolved = resolveWelcomeLocalPreviewTarget(
  { ...candidateTarget, status: "known-expansion-candidate" },
  drops,
  now,
);
assert.equal(evidenceResolved.status, "actively-monitored", "fresh exact-store evidence should establish monitoring even for a non-rare bottle");
const nearbyOnlyResolved = resolveWelcomeLocalPreviewTarget(
  { ...candidateTarget, storeId: "404", label: "Virginia ABC Store 404", address: "404 Other Street Arlington VA", status: "known-expansion-candidate" },
  drops,
  now,
);
assert.equal(nearbyOnlyResolved.status, "known-expansion-candidate", "nearby area signals must not imply exact-store monitoring");
const staleExactResolved = resolveWelcomeLocalPreviewTarget(
  { ...candidateTarget, status: "actively-monitored" },
  [{ ...drops[0], timestamp: new Date(now - 4 * 24 * 60 * 60_000).toISOString() }],
  now,
);
assert.equal(staleExactResolved.status, "known-expansion-candidate", "stale exact-store evidence must not establish monitoring");
const unsupportedCoveredResolved = resolveWelcomeLocalPreviewTarget(
  { ...candidateTarget, status: "covered", storeId: "404", label: "Virginia ABC Store 404", address: "404 Other Street Arlington VA" },
  drops,
  now,
);
assert.equal(unsupportedCoveredResolved.status, "known-expansion-candidate", "an incoming covered status must be downgraded without exact evidence");
const sameAddressDifferentCityResolved = resolveWelcomeLocalPreviewTarget(
  {
    ...candidateTarget,
    storeId: "404",
    label: "Virginia ABC Store 404",
    status: "known-expansion-candidate",
  },
  [{ ...drops[0], store_id: "other-store", store_name: "Other store", store_city: "Alexandria" }],
  now,
);
assert.equal(
  sameAddressDifferentCityResolved.status,
  "known-expansion-candidate",
  "an exact normalized address in the same state must not establish monitoring when the exact city differs",
);
const matchingStoreIdDifferentCityResolved = resolveWelcomeLocalPreviewTarget(
  {
    ...candidateTarget,
    city: "Alexandria",
    address: "404 Other Street Alexandria VA",
    status: "known-expansion-candidate",
  },
  [drops[0]],
  now,
);
assert.equal(
  matchingStoreIdDifferentCityResolved.status,
  "actively-monitored",
  "an exact store ID remains sufficient even when fallback identity fields differ",
);

const citySnapshot = buildWelcomeLocalPreviewSnapshot({
  target: {
    kind: "city",
    stateCode: "SC",
    label: "Myrtle Beach",
    status: "partially-covered",
    city: "Myrtle Beach",
    address: null,
    areaLabel: "Myrtle Beach",
  },
  drops: [
    { brand_name: "City hit", state: "SC", store_city: "Myrtle Beach", timestamp: "2026-08-05T19:00:00.000Z" },
    { brand_name: "City miss", state: "SC", store_city: "Columbia", timestamp: "2026-08-05T19:01:00.000Z" },
  ],
});
assert.deepEqual(citySnapshot.recent.map((drop) => drop.brand_name), ["City hit"]);

const charlestonSnapshot = buildWelcomeLocalPreviewSnapshot({
  target: {
    kind: "city",
    stateCode: "SC",
    label: "Charleston",
    status: "partially-covered",
    city: "Charleston",
    address: null,
    areaLabel: "Charleston",
    canonicalTargetKey: "city:SC:charleston",
    storeId: null,
    targetScope: "city",
  },
  drops: [
    { brand_name: "Exact Charleston", state: "SC", store_city: "Charleston", timestamp: "2026-08-05T19:00:00.000Z" },
    { brand_name: "North Charleston", state: "SC", store_city: "North Charleston", timestamp: "2026-08-05T19:01:00.000Z" },
    { brand_name: "Board and county collision", state: "SC", store_city: "North Charleston", board_name: "Charleston", store_county: "Charleston", timestamp: "2026-08-05T19:01:30.000Z" },
    { brand_name: "Address collision", state: "SC", store_city: "Mount Pleasant", store_address: "10 Charleston Road", timestamp: "2026-08-05T19:02:00.000Z" },
    { brand_name: "Address only", state: "SC", store_address: "20 Charleston Avenue", timestamp: "2026-08-05T19:03:00.000Z" },
  ],
});
assert.deepEqual(
  charlestonSnapshot.recent.map((drop) => drop.brand_name),
  ["Exact Charleston"],
  "city matching must be exact and must never read city text from an address",
);

const boardSnapshot = buildWelcomeLocalPreviewSnapshot({
  target: {
    kind: "city",
    stateCode: "SC",
    label: "Charleston County",
    status: "partially-covered",
    city: "Charleston County",
    address: null,
    areaLabel: "Charleston County",
    canonicalTargetKey: "county:SC:charleston-county",
    storeId: null,
    targetScope: "board-or-county",
  },
  drops: [
    { brand_name: "Exact board", state: "SC", board_name: "Charleston County", timestamp: "2026-08-05T19:00:00.000Z" },
    { brand_name: "Overlapping board", state: "SC", board_name: "North Charleston County", timestamp: "2026-08-05T19:01:00.000Z" },
    { brand_name: "Board in address", state: "SC", store_address: "10 Charleston County Road", timestamp: "2026-08-05T19:02:00.000Z" },
  ],
});
assert.deepEqual(boardSnapshot.recent.map((drop) => drop.brand_name), ["Exact board"], "board and area labels must match canonical area fields exactly");
assert.equal(
  welcomeLocalPreviewTargetScope({ kind: "city", label: "Charleston", canonicalTargetKey: "city:SC:charleston" }),
  "city",
);
assert.equal(
  welcomeLocalPreviewTargetScope({ kind: "city", label: "Charleston County", canonicalTargetKey: "city:SC:charleston-county" }),
  "board-or-county",
);

const publicPayload = toWelcomeLocalPreviewPayload({
  ...activeRecord,
  target: {
    ...activeRecord.target,
    canonicalTargetKey: "store:VA:49",
    storeId: "49",
    targetScope: "store",
    internalTargetField: "secret",
  } as unknown as WelcomeLocalPreviewRecord["target"],
  recent: [{
    timestamp: "2026-08-05T19:59:00.000Z",
    historical: false,
    brand_name: "Safe bottle",
    store_name: "Safe store",
    store_id: "49",
    store_address: "881 North Quincy Street",
    source: "https://inventory.example.com/private/path?token=secret",
    sourceUrl: "https://inventory.example.com/private/path?token=secret",
    userId: "drop-user",
    storeId: "49",
    canonicalTargetKey: "drop-target",
    classification_bottle_id: "classified-secret",
    normalizedSecret: "arbitrary-normalized-value",
  } as unknown as WelcomeLocalPreviewRecord["recent"][number]],
}, true);
assert.deepEqual(Object.keys(publicPayload.target).sort(), ["address", "areaLabel", "city", "kind", "label", "stateCode", "status"]);
assert.deepEqual(
  Object.keys(publicPayload.recent[0]).sort(),
  ["brand_name", "historical", "source", "store_address", "store_id", "store_name", "timestamp"],
  "preview drops must be serialized through an explicit public allowlist",
);
assert.equal(publicPayload.recent[0].source, "inventory.example.com", "a source URL may contribute only its public hostname label");
const serializedPayload = JSON.stringify(publicPayload);
for (const forbidden of ["userId", "canonicalTargetKey", "storeId", "targetScope", "classification_bottle_id", "sourceUrl", "private/path", "normalizedSecret"]) {
  assert.doesNotMatch(serializedPayload, new RegExp(forbidden), `${forbidden} must not reach the browser`);
}
assert.deepEqual(toWelcomeLocalPreviewPayload({ ...activeRecord, recent: publicPayload.recent }, false).recent, [], "expired responses must strip stored signals");

const routeSource = readFileSync(new URL("../src/app/api/welcome/local-preview/route.ts", import.meta.url), "utf8");
for (const phrase of [
  "await auth()",
  "welcomeLocalPreviewAccess",
  "claimWelcomeLocalPreview",
  "searchCurrentCoverageTargets",
  "monitoringDrops",
  "private, no-store",
  "expiresAt",
  "remainingMs",
  "Date.now()",
]) assert.match(routeSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(routeSource, /ensureSchema|CREATE TABLE/i, "request handlers must never create schema");

const schema = readFileSync(new URL("../src/lib/welcome-local-preview-schema.sql", import.meta.url), "utf8");
assert.match(schema, /CREATE TABLE IF NOT EXISTS welcome_signal_previews/);
assert.match(schema, /user_id TEXT PRIMARY KEY/);
assert.match(schema, /payload JSONB NOT NULL/);
assert.match(schema, /expires_at TIMESTAMPTZ NOT NULL/);

const repositorySource = readFileSync(new URL("../src/lib/welcome-local-preview-repository.ts", import.meta.url), "utf8");
assert.match(repositorySource, /ON CONFLICT \(user_id\) DO NOTHING/, "redemption must be atomic and one-time");
assert.match(repositorySource, /RETURNING payload/);
assert.match(repositorySource, /toStoredWelcomeLocalPreviewRecord/, "storage must enforce the public target and signal allowlists");

const welcomeSource = readFileSync(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8");
for (const phrase of [
  "One-time local preview",
  "ABC board, city, or store",
  "See earlier signals",
  "actively monitored",
  "Check out Bourbon Signal",
  "/api/welcome/local-preview",
]) assert.match(welcomeSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
assert.doesNotMatch(welcomeSource, /unlock the magic|hyperlocal intelligence|personalized hunting journey/i);
assert.doesNotMatch(
  welcomeSource,
  /five recent signals|five latest eligible|fewer than five|Free accounts do not include alerts|Your free account is a preview|Plans start at/i,
  "Welcome must not explain free-account allowances or paid feature quotas",
);
assert.match(welcomeSource, /LOCAL_SEARCH_DEBOUNCE_MS/);
assert.match(welcomeSource, /setTimeout\(\(\) =>/);
assert.match(welcomeSource, /const scheduledUserId = currentUserIdRef\.current/);
assert.match(welcomeSource, /const scheduledStateCode = currentStateCodeRef\.current/);
assert.match(welcomeSource, /runLocalPreviewSearch\(query, false, scheduledUserId, scheduledStateCode\)/, "typing must automatically request user- and state-bound suggestions");
assert.match(welcomeSource, /aria-live="polite"/);
assert.doesNotMatch(welcomeSource, /role="option"|role="listbox"/, "typeahead results must keep native button semantics unless a complete combobox is implemented");
assert.match(welcomeSource, /disabled=\{localSearchStatus === "opening"\}/);
assert.match(welcomeSource, /localQuery\.trim\(\)\.length < 2/, "manual search must expose the same two-character threshold as typeahead");
assert.doesNotMatch(welcomeSource, /<span>Source<\/span>/, "technical source labels must not appear on customer cards");
const localTargetCardSource = welcomeSource.slice(
  welcomeSource.indexOf("className={styles.localTargetCard}"),
  welcomeSource.indexOf("className={styles.previewStatus}", welcomeSource.indexOf("className={styles.localTargetCard}")),
);
assert.doesNotMatch(localTargetCardSource, /localPreview\.target\.areaLabel/);
assert.doesNotMatch(localTargetCardSource, /localPreview\.target\.city/);
assert.match(localTargetCardSource, /selectedTargetDetails/);
assert.match(welcomeSource, /welcomeLocalPreviewTargetDetails/);
assert.match(
  welcomeSource,
  /const canShowStateSignals = welcomeStateSignalsCanLoad\(localPreviewStatus\)/,
  "state signal access must fail closed for active, expired, ineligible, loading, and error states",
);
assert.match(welcomeSource, /const drops = welcomeStateSignalRows\(\{/,
  "rendered rows must be bound to the current user and state");
const stateFeedLoadSource = welcomeSource.slice(
  welcomeSource.indexOf("const loadDrops"),
  welcomeSource.indexOf("const loadCoverage"),
);
assert.match(
  stateFeedLoadSource,
  /canShowStateSignals\s*&&\s*requestUserId\s*\?\s*fetch/,
  "the browser must not request the state feed after the one-time preview expires",
);
const stateFeedRenderSource = welcomeSource.slice(
  welcomeSource.indexOf('localPreviewStatus === "expired"'),
  welcomeSource.indexOf('className={`${styles.section} ${styles.coverageSection}`}'),
);
assert.match(
  stateFeedRenderSource,
  /canShowStateSignals\s*\?\s*\([\s\S]*<SignalCards signals=\{drops\}/,
  "fallback state cards must render only while the free preview is eligible",
);
assert.doesNotMatch(welcomeSource, /Date\.parse\(localPreview\.expiresAt\)\s*-\s*Date\.now\(\)/, "the client timer must use server-authoritative remainingMs");
assert.match(
  welcomeSource,
  /localPreviewState\?\.userId === authenticatedUserId/,
  "preview rendering must derive only from state owned by the current authenticated user",
);
assert.match(welcomeSource, /currentUserIdRef\.current = authenticatedUserId/);
assert.match(welcomeSource, /currentStateCodeRef\.current = activeState/);
assert.match(welcomeSource, /localPreviewGetControllerRef\.current\?\.abort\(\)/, "a user change must abort the preview GET");
assert.match(welcomeSource, /localPreviewPostControllerRef\.current\?\.abort\(\)/, "a user change must abort the preview POST");
const openPreviewSource = welcomeSource.slice(
  welcomeSource.indexOf("async function openLocalPreview"),
  welcomeSource.indexOf("const previewMessage"),
);
assert.match(openPreviewSource, /const requestUserId = currentUserIdRef\.current/);
assert.match(openPreviewSource, /const requestStateCode = currentStateCodeRef\.current/);
assert.match(openPreviewSource, /signal: controller\.signal/);
assert.match(openPreviewSource, /localSearchControllerRef\.current\?\.abort\(\)/, "opening the one-time preview must cancel suggestion requests");
assert.match(
  openPreviewSource,
  /currentUserIdRef\.current !== requestUserId/,
  "a late preview POST response must be rejected after a user change",
);
assert.match(
  openPreviewSource,
  /currentStateCodeRef\.current !== requestStateCode/,
  "a late preview POST response must be rejected after a state change",
);
assert.match(
  openPreviewSource,
  /setLocalPreviewState\(\{\s*userId: requestUserId/,
  "accepted POST state must retain its authenticated owner",
);
const activeStateEffectStart = welcomeSource.indexOf("localSearchControllerRef.current?.abort();");
const activeStateEffectEnd = welcomeSource.indexOf("if (!preferencesReady)", activeStateEffectStart);
assert.ok(activeStateEffectStart >= 0 && activeStateEffectEnd > activeStateEffectStart, "active-state cleanup effect must remain discoverable across line-ending styles");
const activeStateEffectSource = welcomeSource.slice(activeStateEffectStart, activeStateEffectEnd);
assert.match(activeStateEffectSource, /localSearchControllerRef\.current\?\.abort\(\)/);
assert.match(activeStateEffectSource, /localPreviewPostControllerRef\.current\?\.abort\(\)/);
const saveHomeStateSource = welcomeSource.slice(
  welcomeSource.indexOf("async function saveHomeState"),
  welcomeSource.indexOf("async function searchLocalPreview"),
);
assert.match(saveHomeStateSource, /localSearchStatus === "opening"/, "state changes must be blocked while the one-time claim is opening");

const migrationSource = readFileSync(new URL("./migrate-app-storage.mjs", import.meta.url), "utf8");
assert.match(migrationSource, /welcome-local-preview-schema\.sql/);
assert.match(migrationSource, /welcome_signal_previews/);

console.log("One-time Welcome local-preview contract passed.");

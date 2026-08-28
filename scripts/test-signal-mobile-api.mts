import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIGNAL_API_ERROR_VERSION,
  SIGNAL_API_VERSION,
  buildSignalMemberProfile,
  normalizeSignalCreateInput,
  publicSignalIdentityFromMetadata,
  signalIdParts,
} from "../src/lib/signals/signal-api-contract.ts";
import { normalizeCommunityDisplayName } from "../src/lib/community-display-name.ts";
import { createSignalProfilePatchHandler } from "../src/lib/signals/signal-profile-route.ts";
import { buildSignalFeedAreaDirectory } from "../src/lib/feed-area-options.ts";
import {
  createSignalActionHandler,
  createSignalCreateHandler,
  createSignalDetailHandler,
} from "../src/lib/signals/signal-api-route.ts";
import { createSignalApiClient, SignalApiClientError } from "../src/lib/signals/signal-api-client.ts";
import { idempotentSightingFingerprint, idempotentSightingId, sameIdempotentSighting } from "../src/lib/signals/signal-api-idempotency.ts";

const identity = publicSignalIdentityFromMetadata({ memberNumber: 184 });
assert.deepEqual(identity, { kind: "member", number: 184, label: "Member #184" });
assert.deepEqual(publicSignalIdentityFromMetadata({ founderNumber: 19, memberNumber: 19 }), { kind: "founder", number: 19, label: "Founder #19" });
assert.equal(publicSignalIdentityFromMetadata({ memberNumber: "not-a-number", email: "private@example.com" }), undefined);
assert.deepEqual(normalizeCommunityDisplayName("  Oak   Street Scout  "), { ok: true, value: "Oak Street Scout" });
for (const reserved of ["", "Bourbon Signal Staff", "Admin", "Founder #12", "Member #9", "support@bourbonsignal.com"]) {
  const result = normalizeCommunityDisplayName(reserved);
  assert.equal(result.ok, false, `${JSON.stringify(reserved)} must not be accepted as a Community display name`);
}
const areaDirectory = buildSignalFeedAreaDirectory();
assert.equal(areaDirectory.states.find((state) => state.code === "NC")?.areaLabel, "Board");
assert.ok(areaDirectory.states.find((state) => state.code === "NC")?.options.some((option) => option.value === "Wake County ABC" && /ABC/.test(option.label)));
assert.equal(areaDirectory.states.find((state) => state.code === "GA")?.areaLabel, "City");

const defaultDisplayProfile = buildSignalMemberProfile(
  { memberNumber: 184, email: "private@example.com", firstName: "Private Legal Name" },
  { tier: "standard", label: "Standard", hasBetaAccess: true, feedPreviewLimit: null, canSubmitSightings: true },
);
assert.equal(defaultDisplayProfile.profile.displayName, "", "numbered identity must not become the chosen display name");
assert.equal(defaultDisplayProfile.profile.customDisplayName, null);
assert.equal(JSON.stringify(defaultDisplayProfile).includes("private@example.com"), false);
assert.equal(JSON.stringify(defaultDisplayProfile).includes("Private Legal Name"), false);
const customDisplayProfile = buildSignalMemberProfile(
  { memberNumber: 184, communityDisplayName: "Oak Street Scout" },
  { tier: "standard", label: "Standard", hasBetaAccess: true, feedPreviewLimit: null, canSubmitSightings: true },
);
assert.equal(customDisplayProfile.profile.displayName, "Oak Street Scout");
assert.equal(customDisplayProfile.profile.identity?.label, "Member #184", "the immutable numbered identity remains intact");
const legacyTagProfile = buildSignalMemberProfile(
  { memberNumber: 184, communityDisplayName: "Member #184" },
  { tier: "standard", label: "Standard", hasBetaAccess: true, feedPreviewLimit: null, canSubmitSightings: true },
);
assert.equal(legacyTagProfile.profile.displayName, "", "legacy identity fallbacks never project as chosen names");
assert.equal(legacyTagProfile.profile.identity?.label, "Member #184");

let savedDisplayName: string | null | undefined;
const profilePatchHandler = createSignalProfilePatchHandler({
  saveDisplayName: async (_userId, displayName) => {
    savedDisplayName = displayName;
    return buildSignalMemberProfile(
      { memberNumber: 184, ...(displayName ? { communityDisplayName: displayName } : {}) },
      { tier: "standard", label: "Standard", hasBetaAccess: true, feedPreviewLimit: null, canSubmitSightings: true },
    );
  },
});
const patchedProfile = await profilePatchHandler(new Request("https://www.bourbonsignal.com/api/v1/me/profile", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ displayName: "  Oak   Street Scout " }),
}), "user_123");
assert.equal(patchedProfile.status, 200);
assert.equal(savedDisplayName, "Oak Street Scout");
assert.equal((await patchedProfile.json()).profile.displayName, "Oak Street Scout");
const rejectedProfile = await profilePatchHandler(new Request("https://www.bourbonsignal.com/api/v1/me/profile", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ displayName: "Bourbon Signal Support" }),
}), "user_123");
assert.equal(rejectedProfile.status, 400);
const resetProfile = await profilePatchHandler(new Request("https://www.bourbonsignal.com/api/v1/me/profile", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ displayName: null }),
}), "user_123");
assert.equal(resetProfile.status, 200);
assert.equal(savedDisplayName, null);
assert.equal(idempotentSightingId("user_123", "signal-create-12345678"), idempotentSightingId("user_123", "signal-create-12345678"));
assert.notEqual(idempotentSightingId("user_123", "signal-create-12345678"), idempotentSightingId("user_123", "signal-create-other"));

assert.deepEqual(signalIdParts("member:sighting_123"), { source: "member", rawId: "sighting_123" });
assert.equal(signalIdParts("unknown:value"), null);
assert.equal(signalIdParts("member:"), null);

const normalizedCreate = normalizeSignalCreateInput({
  bottle: { id: " bottle-1 ", name: " Example Bourbon " },
  store: { id: " store-1 ", name: " Example Liquors ", address: " 100 Main St ", city: " Raleigh ", state: "nc", zip: "27601" },
  reportMode: "seen_in_store",
  quantityLabel: " A few ",
  price: 69.99,
  note: " Shelf near register ",
});
assert.equal(normalizedCreate.ok, true);
if (normalizedCreate.ok) {
  assert.equal(normalizedCreate.value.bottle.name, "Example Bourbon");
  assert.equal(normalizedCreate.value.store.state, "NC");
  assert.equal(normalizedCreate.value.note, "Shelf near register");
}
const invalidCreate = normalizeSignalCreateInput({ bottle: { name: "" }, store: { name: "" } });
assert.equal(invalidCreate.ok, false);
if (!invalidCreate.ok) assert.equal(invalidCreate.error.code, "INVALID_REQUEST");
assert.equal(normalizeSignalCreateInput({
  bottle: { id: "bottle-1", name: "Bottle" },
  store: { id: "store-1", name: "Store" },
  reportMode: "seen_in_store",
}).ok, false, "matched stores still need a complete address for the legacy persistence workflow");

const sighting = {
  id: "sighting_123",
  bottleId: "bottle-1",
  bottleName: "Example Bourbon",
  rarityTier: "allocated" as const,
  storeId: "store-1",
  storeName: "Example Liquors",
  storeAddress: "100 Main St",
  storeCity: "Raleigh",
  storeState: "NC",
  storeZip: "27601",
  quantityEstimate: "A few",
  price: 69.99,
  notes: "Shelf near register",
  source: "custom" as const,
  sightingType: "seen_in_store" as const,
  reporterUserId: "user_private_123",
  reporterPublicIdentity: { kind: "member" as const, number: 184, label: "Member #184" },
  createdAt: "2026-08-21T17:00:00.000Z",
};
assert.equal(sameIdempotentSighting(sighting, { ...sighting, upCount: 99, myVote: "up" }), true, "mutable engagement fields do not change create identity");
const originalFingerprint = idempotentSightingFingerprint(sighting);
assert.notEqual(originalFingerprint, idempotentSightingFingerprint({ ...sighting, bottleName: "Different request body" }));
assert.equal(sameIdempotentSighting({ ...sighting, idempotencyFingerprint: originalFingerprint }, { ...sighting, idempotencyFingerprint: originalFingerprint }), true);
assert.equal(sameIdempotentSighting({ ...sighting, idempotencyFingerprint: originalFingerprint }, { ...sighting, idempotencyFingerprint: idempotentSightingFingerprint({ ...sighting, bottleName: "Different request body" }) }), false);

let forwardedCreate: Request | null = null;
const createHandler = createSignalCreateHandler({
  createSighting: async (request) => {
    forwardedCreate = request;
    return Response.json({ ok: true, created: true, sighting }, { status: 201 });
  },
});
const createResponse = await createHandler(new Request("https://www.bourbonsignal.com/api/v1/signals", {
  method: "POST",
  headers: {
    Authorization: "Bearer mobile-session-token",
    "Content-Type": "application/json",
    "Idempotency-Key": "signal-create-12345678",
  },
  body: JSON.stringify(normalizedCreate.ok ? normalizedCreate.value : {}),
}));
assert.equal(createResponse.status, 201);
assert.equal(forwardedCreate?.headers.get("authorization"), "Bearer mobile-session-token");
assert.equal(forwardedCreate?.headers.get("idempotency-key"), "signal-create-12345678");
const forwardedCreateBody = await forwardedCreate?.json() as Record<string, unknown>;
assert.equal(forwardedCreateBody.bottleName, "Example Bourbon");
const createdPayload = await createResponse.json();
assert.equal(createdPayload.contractVersion, SIGNAL_API_VERSION);
assert.equal(createdPayload.signal.id, "member:sighting_123");
assert.equal(createdPayload.signal.source.actor.label, "Member #184");
assert.equal(JSON.stringify(createdPayload).includes("user_private_123"), false);

let createCalledWithoutKey = false;
const missingKeyResponse = await createSignalCreateHandler({ createSighting: async () => { createCalledWithoutKey = true; return Response.json({}); } })(new Request("https://www.bourbonsignal.com/api/v1/signals", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalizedCreate.ok ? normalizedCreate.value : {}),
}));
assert.equal(missingKeyResponse.status, 400);
assert.equal(createCalledWithoutKey, false);
assert.equal((await missingKeyResponse.json()).error.code, "IDEMPOTENCY_KEY_REQUIRED");

const unauthorizedResponse = await createSignalCreateHandler({
  createSighting: async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
})(new Request("https://www.bourbonsignal.com/api/v1/signals", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "signal-create-87654321" },
  body: JSON.stringify(normalizedCreate.ok ? normalizedCreate.value : {}),
}));
assert.equal(unauthorizedResponse.status, 401);
const unauthorizedPayload = await unauthorizedResponse.json();
assert.equal(unauthorizedPayload.contractVersion, SIGNAL_API_ERROR_VERSION);
assert.equal(unauthorizedPayload.error.code, "UNAUTHORIZED");
assert.equal(unauthorizedResponse.headers.get("cache-control"), "private, no-store");
assert.match(String(unauthorizedResponse.headers.get("vary")), /Authorization/);

const detailRequests: Request[] = [];
const detailHandler = createSignalDetailHandler({
  getDrops: async () => Response.json({ drops: [] }),
  getSightings: async (request) => {
    detailRequests.push(request);
    assert.equal(new URL(request.url).searchParams.get("sightingId"), "sighting_123");
    return Response.json({ sightings: [sighting] });
  },
});
const detailResponse = await detailHandler(new Request("https://www.bourbonsignal.com/api/v1/signals/member%3Asighting_123", {
  headers: { Authorization: "Bearer mobile-session-token" },
}), "member:sighting_123");
assert.equal(detailResponse.status, 200);
assert.equal(detailRequests[0].headers.get("authorization"), "Bearer mobile-session-token");
assert.equal((await detailResponse.json()).signal.id, "member:sighting_123");
let retailerDetailPath = "";
const retailerDetailHandler = createSignalDetailHandler({
  getDrops: async (request) => {
    retailerDetailPath = request.url;
    return Response.json({ drops: [{ id: "retailer:submission_1", sourceType: "verified_retailer", canonical_name: "Example Bourbon", store_name: "Example Liquors", observed_at: "2026-08-21T17:00:00.000Z" }] });
  },
  getSightings: async () => Response.json({ sightings: [] }),
});
const retailerDetail = await retailerDetailHandler(new Request("https://www.bourbonsignal.com/api/v1/signals/retailer%3Asubmission_1"), "retailer:submission_1");
assert.equal(retailerDetail.status, 200);
assert.equal(new URL(retailerDetailPath).searchParams.get("signalId"), "submission_1");
assert.equal(new URL(retailerDetailPath).searchParams.get("signalSource"), "retailer");
assert.equal((await retailerDetail.json()).signal.id, "retailer:submission_1");
const missingDetailHandler = createSignalDetailHandler({
  getDrops: async () => Response.json({ drops: [] }),
  getSightings: async () => Response.json({ sightings: [] }),
});
const missingDetail = await missingDetailHandler(new Request("https://www.bourbonsignal.com/api/v1/signals/member%3Amissing"), "member:missing");
assert.equal(missingDetail.status, 404);
assert.equal((await missingDetail.json()).error.code, "SIGNAL_NOT_FOUND");

let actionBody: Record<string, unknown> | null = null;
const actionHandler = createSignalActionHandler({
  updateSighting: async (request) => {
    actionBody = await request.json() as Record<string, unknown>;
    return Response.json({ ok: true, sighting: { ...sighting, upCount: 1, myVote: "up" } });
  },
});
const actionResponse = await actionHandler(new Request("https://www.bourbonsignal.com/api/v1/signals/member%3Asighting_123/actions", {
  method: "POST",
  headers: { Authorization: "Bearer mobile-session-token", "Content-Type": "application/json" },
  body: JSON.stringify({ action: "helpful" }),
}), "member:sighting_123");
assert.equal(actionResponse.status, 200);
assert.deepEqual(actionBody, { sightingId: "sighting_123", vote: "up", active: true });
assert.equal((await actionResponse.json()).action.active, true);
const unsupportedAction = await actionHandler(new Request("https://www.bourbonsignal.com/api/v1/signals/trusted_source%3Adrop-1/actions", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "helpful" }),
}), "trusted_source:drop-1");
assert.equal(unsupportedAction.status, 409);
assert.equal((await unsupportedAction.json()).error.code, "ACTION_NOT_AVAILABLE");

const repositorySource = readFileSync("src/lib/community-sightings-repository.ts", "utf8");
const sightingsRouteSource = readFileSync("src/app/api/sightings/route.ts", "utf8");
const sightingsSchemaSource = readFileSync("src/lib/community-sightings-schema.sql", "utf8");
assert.match(repositorySource, /ON CONFLICT \(id\) DO UPDATE SET id = community_sightings\.id/, "idempotent inserts must return the winning row after concurrent conflicts");
assert.match(repositorySource, /reserveIdempotency\([\s\S]*community_sighting_idempotency/, "every key needs a durable reservation before domain dedupe");
assert.match(sightingsRouteSource, /reserveIdempotency[\s\S]*isLikelyDuplicateSighting[\s\S]*completeIdempotency/, "domain duplicate responses must retain their Idempotency-Key binding");
assert.match(sightingsRouteSource, /function visibleSightingForRequester[\s\S]*communityDisplayNameSeparateFromIdentity[\s\S]*reporterDisplayName: displayName \|\| ""/, "every direct or idempotent sighting response must remove historical tag-shaped reporter names");
assert.match(sightingsRouteSource, /binding\.sightingId[\s\S]*visibleSightingForRequester\(bound[\s\S]*sameIdempotentSighting[\s\S]*visibleSightingForRequester\(existing/, "idempotent replay responses must use the sanitized public sighting projection");
assert.match(sightingsRouteSource, /const publicIdentity = publicSignalIdentityFromMetadata[\s\S]*if \(!publicIdentity\)[\s\S]*numbered member identity is required before posting[\s\S]*reporterPublicIdentity: publicActor/, "new Community posts must fail closed unless they can carry a structured numbered tag");
assert.match(sightingsSchemaSource, /CREATE TABLE IF NOT EXISTS community_sighting_idempotency/, "the durable reservation table must be part of the additive schema");
assert.match(repositorySource, /setVoteState\(/, "mobile actions need an idempotent desired-state mutation");
assert.match(repositorySource, /updateReporterDisplayName\(/, "profile updates need a durable historical sighting update seam");
assert.match(repositorySource, /reporterDisplayName[\s\S]*reporterPublicIdentity/, "historical payload updates must keep display and numbered actor identity together");
assert.match(sightingsRouteSource, /typeof payload\.active === "boolean"[\s\S]*setVoteState/, "legacy voting must retain toggle compatibility while v1 uses desired state");

const requests: Request[] = [];
const client = createSignalApiClient({
  baseUrl: "https://www.bourbonsignal.com",
  getToken: async () => "mobile-session-token",
  fetch: async (request) => {
    requests.push(request);
    if (request.url.endsWith("/api/v1/signals?limit=20")) return Response.json({ contractVersion: SIGNAL_API_VERSION, signals: [], total: 0 });
    return Response.json({ contractVersion: SIGNAL_API_ERROR_VERSION, error: { code: "SIGNAL_NOT_FOUND", message: "Signal not found." } }, { status: 404 });
  },
});
await client.listSignals({ limit: 20 });
assert.equal(requests[0].headers.get("authorization"), "Bearer mobile-session-token");
await assert.rejects(() => client.getSignal("member:missing"), (error: unknown) => error instanceof SignalApiClientError && error.code === "SIGNAL_NOT_FOUND" && error.status === 404);

console.log("Mobile Signal API foundation contract passed.");

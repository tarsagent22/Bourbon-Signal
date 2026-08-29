import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi, MobileApiError } from "./client";
import type { Signal } from "./types";
import { presentSignal, relativeSignalTime, signalAccessibilityLabel, signalAccessibilityTime, signalAvailabilityIsCurrent, signalAvailabilityRefreshAt, signalCardStatusLabel, signalCardSummary, signalMemberTagLabel } from "./presentation";

test("sends the selected feed view, bearer auth, and opaque cursor without inspecting it", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      requests.push(new Request(request));
      return Response.json({ signals: [], nextCursor: null, hasMore: false });
    },
  });
  await api.listSignals({ view: "community", limit: 20, cursor: "opaque/cursor+value" });
  assert.equal(requests[0].headers.get("authorization"), "Bearer session-token");
  assert.equal(new URL(requests[0].url).searchParams.get("cursor"), "opaque/cursor+value");
  assert.equal(new URL(requests[0].url).searchParams.get("view"), "community");
});

test("serializes normalized Signal filters for server-side pagination", async () => {
  let captured: Request | null = null;
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured = new Request(request);
      return Response.json({ signals: [], nextCursor: null, hasMore: false });
    },
  });
  await api.listSignals({
    view: "market",
    rarities: ["unicorn", "allocated"],
    state: "nc",
    area: "  Raleigh  ",
    freshness: "7d",
    bottle: "  Weller  ",
  });
  const params = new URL(captured!.url).searchParams;
  assert.equal(params.get("tiers"), "allocated,unicorn");
  assert.equal(params.get("state"), "NC");
  assert.equal(params.get("area"), "Raleigh");
  assert.equal(params.get("freshness"), "7d");
  assert.equal(params.get("bottle"), "Weller");
});

test("updates the public Community display name through the member profile endpoint", async () => {
  let captured: Request | null = null;
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured = new Request(request);
      return Response.json({ profile: { displayName: "Chandler T." } });
    },
  });
  await api.updateMemberProfile({ displayName: " Chandler T. " });
  assert.equal(captured!.method, "PATCH");
  assert.equal(new URL(captured!.url).pathname, "/api/v1/me/profile");
  assert.deepEqual(await captured!.json(), { displayName: " Chandler T. " });
});

test("validates referral program data before exposing it to Account", async () => {
  const base = {
    code: "ABCD2345",
    referralLink: "https://example.test/r/ABCD2345",
    referralPoints: 50,
    program: { pointsByTier: { free: 10, standard: 50, barrel: 100, "bottled-in-bond": 150 }, freeAwardLimit: 5, upgradeAwardsDifferenceOnly: true },
    referrals: { total: 2, free: 1, standard: 1, barrel: 0, founder: 0 },
  };
  const validApi = createMobileApi({ baseUrl: "https://example.test", getToken: async () => "session-token", fetcher: async () => Response.json(base) });
  const summary = await validApi.getReferralSummary();
  assert.equal(summary.program.pointsByTier["bottled-in-bond"], 150);
  assert.equal(summary.founderGlassesEarned, 0, "older additive responses safely default glass counts");

  const invalidApi = createMobileApi({ baseUrl: "https://invalid.test", getToken: async () => "session-token", fetcher: async () => Response.json({ ...base, program: undefined }) });
  await assert.rejects(invalidApi.getReferralSummary(), (error: unknown) => error instanceof MobileApiError && error.code === "INVALID_REFERRAL_PROGRAM" && error.retryable);
});

test("loads distinct sorted city options from the canonical store catalog", async () => {
  let captured = "";
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured = new Request(request).url;
      return Response.json({ stores: [{ city: "Richmond" }, { city: "richmond" }, { city: "Norfolk" }, { city: "" }] });
    },
  });

  assert.deepEqual(await api.getSignalAreaOptions("va"), [
    { value: "Norfolk", label: "Norfolk" },
    { value: "Richmond", label: "Richmond" },
  ]);
  assert.equal(new URL(captured).searchParams.get("state"), "VA");
});

test("preserves the combined-feed default for callers that omit a view", async () => {
  let request: Request | null = null;
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (input) => {
      request = new Request(input);
      return Response.json({ signals: [], nextCursor: null, hasMore: false });
    },
  });
  await api.listSignals();
  assert.equal(new URL(request!.url).searchParams.get("view"), null);
});

test("preserves cursor reset errors for a clean feed refresh", async () => {
  const api = createMobileApi({
    getToken: async () => "session-token",
    fetcher: async () => Response.json({ resetCursor: true, error: { code: "CURSOR_RESET_REQUIRED", message: "Refresh the feed.", retryable: true } }, { status: 409 }),
  });
  await assert.rejects(api.listSignals(), (error: unknown) => error instanceof MobileApiError && error.resetCursor && error.code === "CURSOR_RESET_REQUIRED");
});

test("loads canonical Radar, Cellar, alerts, and HQ data with the same bearer identity", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "production-member-token",
    fetcher: async (request) => {
      const captured = new Request(request);
      requests.push(captured);
      const pathname = new URL(captured.url).pathname;
      if (pathname === "/api/user/preferences") return Response.json({ entitlements: { canUseCollection: true }, collectionPreferences: { bottles: [], version: 2 } });
      if (pathname === "/api/alerts") return Response.json({ alerts: [], unreadCount: 0 });
      if (pathname === "/api/signal-points") return Response.json({ balance: 125, debt: 0, catalog: [], redemptions: [], tier: "barrel" });
      throw new Error(`Unexpected path: ${pathname}`);
    },
  });

  const [preferences] = await Promise.all([api.getMemberPreferences(), api.getMemberAlerts(), api.getSignalPoints()]);
  assert.equal(preferences.entitlements?.canUseCollection, true);
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname).sort(), ["/api/alerts", "/api/signal-points", "/api/user/preferences"]);
  assert.ok(requests.every((request) => request.headers.get("authorization") === "Bearer production-member-token"));
});

test("searches bottles on the server, preserves ranked metadata, and keeps unqueried compatibility", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      requests.push(new Request(request));
      return Response.json({ bottles: [{ id: "eht-small-batch", canonicalName: "E.H. Taylor Small Batch", aliases: ["eht", "colonel taylor"], brand: "E.H. Taylor", proof: 100, ageStatement: null }] });
    },
  });
  const ranked = await api.listRadarBottles({ query: "eht", limit: 8, fresh: true });
  const all = await api.listRadarBottles();
  assert.equal(new URL(requests[0].url).searchParams.get("query"), "eht");
  assert.equal(new URL(requests[0].url).searchParams.get("limit"), "8");
  assert.equal(new URL(requests[1].url).search, "");
  assert.deepEqual(ranked[0]?.aliases, ["eht", "colonel taylor"]);
  assert.equal(ranked[0]?.proof, 100);
  assert.equal(all[0]?.name, "E.H. Taylor Small Batch");
});

test("loads the complete canonical bottle catalog for local Cellar search", async () => {
  let captured: Request | null = null;
  const api = createMobileApi({
    baseUrl: "https://catalog-load.example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured = new Request(request);
      return Response.json({ bottles: [{ id: "rare-breed", canonicalName: "Wild Turkey Rare Breed", aliases: ["WT Rare Breed"], brand: "Wild Turkey", proof: 116.8 }] });
    },
  });
  const bottles = await api.listBottleCatalog({ fresh: true });
  assert.equal(new URL(captured!.url).pathname, "/api/bottle-catalog");
  assert.equal(bottles[0]?.name, "Wild Turkey Rare Breed");
  assert.deepEqual(bottles[0]?.aliases, ["WT Rare Breed"]);
});

test("shares the successful bottle catalog across API instances and lets fresh reads replace it", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests += 1;
    return Response.json({ bottles: [{ id: `catalog-${requests}`, canonicalName: `Catalog ${requests}` }] });
  };
  const createApi = () => createMobileApi({
    baseUrl: "https://catalog-cache.example.test",
    getToken: async () => "session-token",
    fetcher,
  });

  const first = await createApi().listBottleCatalog();
  const shared = await createApi().listBottleCatalog();
  const refreshed = await createApi().listBottleCatalog({ fresh: true });
  const sharedRefresh = await createApi().listBottleCatalog();

  assert.equal(requests, 2);
  assert.equal(first[0]?.id, "catalog-1");
  assert.equal(shared[0]?.id, "catalog-1");
  assert.equal(refreshed[0]?.id, "catalog-2");
  assert.equal(sharedRefresh[0]?.id, "catalog-2");
});

test("coalesces an in-flight catalog failure but does not cache it after that request", async () => {
  let healthy = false;
  let requests = 0;
  const createApi = () => createMobileApi({
    baseUrl: "https://catalog-retry.example.test",
    getToken: async () => "session-token",
    fetcher: async () => {
      requests += 1;
      return healthy
        ? Response.json({ bottles: [{ id: "recovered", canonicalName: "Recovered Bottle" }] })
        : Response.json({ error: "Catalog unavailable" }, { status: 503 });
    },
  });

  const first = createApi();
  const second = createApi();
  const failures = await Promise.allSettled([first.listBottleCatalog(), second.listBottleCatalog()]);
  assert.equal(requests, 1);
  assert.ok(failures.every((result) => result.status === "rejected"));

  healthy = true;
  const recovered = await first.listBottleCatalog();
  assert.equal(requests, 2);
  assert.equal(recovered[0]?.id, "recovered");
});

test("submits missing bottles through the authenticated contribution contract", async () => {
  let captured: Request | null = null;
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured = new Request(request);
      return Response.json({ ok: true, contribution: { id: "contribution-1" } });
    },
  });
  await api.submitBottleContribution(
    { rawName: "Local Pick Batch 7", source: "collection", context: { proof: 101.3, detail: "Batch 7" } },
    "cellar-local-abc12345",
  );
  assert.equal(captured!.method, "POST");
  assert.equal(new URL(captured!.url).pathname, "/api/bottle-contributions");
  assert.equal(captured!.headers.get("idempotency-key"), "cellar-local-abc12345");
  assert.deepEqual(await captured!.json(), { rawName: "Local Pick Batch 7", source: "collection", context: { proof: 101.3, detail: "Batch 7" } });
});

test("submits a durable sighting with JSON and a stable idempotency key", async () => {
  const captured: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured.push(new Request(request));
      return Response.json({ ok: true, created: true, sighting: { id: "sighting-1" } });
    },
  });

  await api.submitSighting({
    bottleName: "Example Bourbon",
    storeId: "manual:example-shop",
    storeName: "Example Shop",
    storeAddress: "1 Main St",
    storeCity: "Raleigh",
    storeState: "NC",
    reviewState: { needsStoreReview: true, manualStoreName: "Example Shop", manualStoreCity: "Raleigh", manualStoreState: "NC" },
  }, "mobile-post-12345678");

  assert.equal(captured[0]?.method, "POST");
  assert.equal(captured[0]?.headers.get("content-type"), "application/json");
  assert.equal(captured[0]?.headers.get("idempotency-key"), "mobile-post-12345678");
  assert.equal((await captured[0]?.json())?.bottleName, "Example Bourbon");
});

test("saves a partial member preference patch without placing writes in the read cooldown", async () => {
  const captured: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      captured.push(new Request(request));
      return Response.json({ collectionPreferences: { bottles: [], version: captured.length } });
    },
  });

  await api.updateMemberPreferences({ collectionPreferences: { bottles: [], version: 4 } });
  await api.updateMemberPreferences({ collectionPreferences: { bottles: [], version: 5 } });

  assert.equal(captured.length, 2);
  assert.ok(captured.every((request) => request.method === "POST"));
  assert.deepEqual(await captured[0].json(), { collectionPreferences: { bottles: [], version: 4 } });
});

test("reads and explicitly writes the member's private Hunt Outcome", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      const captured = new Request(request);
      requests.push(captured);
      return Response.json({ contractVersion: "bourbon-signal/mobile-api@1", outcome: captured.method === "PUT" ? { outcome: "found_it" } : null });
    },
  });

  await api.getHuntOutcome("trusted_source:episode-1");
  const saved = await api.setHuntOutcome("trusted_source:episode-1", "found_it");

  assert.equal(new URL(requests[0].url).pathname, "/api/v1/signals/trusted_source%3Aepisode-1/outcome");
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[1].method, "PUT");
  assert.deepEqual(await requests[1].json(), { outcome: "found_it" });
  assert.equal(saved.outcome?.outcome, "found_it");
  assert.ok(requests.every((request) => request.headers.get("authorization") === "Bearer session-token"));
});

test("invalidates the cached preference read after a successful write", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    readCooldownMs: 30_000,
    fetcher: async (request) => {
      const captured = new Request(request);
      requests.push(captured);
      return Response.json({ collectionPreferences: { bottles: [], version: requests.length } });
    },
  });

  const before = await api.getMemberPreferences();
  await api.updateMemberPreferences({ collectionPreferences: { bottles: [], version: before.collectionPreferences.version } });
  const after = await api.getMemberPreferences();

  assert.equal(requests.length, 3, "the read after a mutation must reach the server instead of returning stale cached preferences");
  assert.equal(after.collectionPreferences.version, 3);
});

test("isolates cached authenticated reads when the bearer session changes", async () => {
  let token = "member-a";
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => token,
    readCooldownMs: 30_000,
    fetcher: async (request) => {
      const captured = new Request(request);
      requests.push(captured);
      return Response.json({ profile: { identity: { label: captured.headers.get("authorization") } } });
    },
  });

  const first = await api.getMemberProfile();
  token = "member-b";
  const second = await api.getMemberProfile();

  assert.equal(requests.length, 2);
  assert.equal(first.profile.identity?.label, "Bearer member-a");
  assert.equal(second.profile.identity?.label, "Bearer member-b");
});

test("a forced refresh bypasses a cached account failure", async () => {
  let healthy = false;
  let requests = 0;
  const api = createMobileApi({
    getToken: async () => "session-token",
    readCooldownMs: 30_000,
    fetcher: async () => {
      requests += 1;
      return healthy ? Response.json({ collectionPreferences: { bottles: [], version: 2 } }) : Response.json({ error: "Unavailable" }, { status: 503 });
    },
  });

  await assert.rejects(api.getMemberPreferences());
  healthy = true;
  await assert.rejects(api.getMemberPreferences());
  const refreshed = await api.getMemberPreferences({ fresh: true });

  assert.equal(requests, 2);
  assert.equal(refreshed.collectionPreferences.version, 2);
});

test("a forced refresh bypasses a cached success", async () => {
  let version = 1;
  let requests = 0;
  const api = createMobileApi({
    getToken: async () => "session-token",
    readCooldownMs: 30_000,
    fetcher: async () => {
      requests += 1;
      return Response.json({ collectionPreferences: { bottles: [], version } });
    },
  });

  const first = await api.getMemberPreferences();
  version = 2;
  const cached = await api.getMemberPreferences();
  const refreshed = await api.getMemberPreferences({ fresh: true });

  assert.equal(first.collectionPreferences.version, 1);
  assert.equal(cached.collectionPreferences.version, 1);
  assert.equal(refreshed.collectionPreferences.version, 2);
  assert.equal(requests, 2);
});

test("preserves legacy string API errors instead of replacing them with a generic message", async () => {
  const api = createMobileApi({
    getToken: async () => "session-token",
    fetcher: async () => Response.json({ error: "Collection storage is temporarily unavailable." }, { status: 503 }),
  });
  await assert.rejects(api.getMemberPreferences(), (error: unknown) => error instanceof MobileApiError && error.message === "Collection storage is temporarily unavailable.");
});

test("coalesces repeated account reads during a render loop, including failures", async () => {
  let requests = 0;
  const api = createMobileApi({
    getToken: async () => "session-token",
    readCooldownMs: 30_000,
    fetcher: async () => {
      requests += 1;
      return Response.json({ error: "Temporarily unavailable." }, { status: 503 });
    },
  });
  const attempts = await Promise.allSettled(Array.from({ length: 50 }, () => api.getSignalPoints()));
  assert.equal(requests, 1, "a remount loop must not amplify one failed endpoint into repeated network traffic");
  assert.ok(attempts.every((attempt) => attempt.status === "rejected"));
  await assert.rejects(api.getSignalPoints());
  assert.equal(requests, 1, "the failure cooldown must protect the backend after the first request settles");
});

test("formats Signal age for quick scanning", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(relativeSignalTime("2026-08-23T11:48:00.000Z", now), "12m ago");
  assert.equal(relativeSignalTime("2026-08-23T09:30:00.000Z", now), "2h ago");
  assert.equal(relativeSignalTime("2026-08-20T12:00:00.000Z", now), "3d ago");
  assert.equal(relativeSignalTime("2026-08-15T12:00:00.000Z", now), "8d ago");
  assert.notEqual(relativeSignalTime("2026-08-09T12:00:00.000Z", now), "14d");
  assert.equal(signalAccessibilityTime("2026-08-15T12:00:00.000Z", now), "8 days ago");
});

test("presents the canonical Signal transport shape without legacy field assumptions", () => {
  const signal = {
    contractVersion: "bourbon-signal/signal@1" as const,
    id: "member:example",
    kind: "availability" as const,
    source: { type: "member" as const, label: "Member #19", actor: { kind: "member" as const, number: 19, label: "Member #19" } },
    bottle: { id: "bottle-1", name: "Example Bourbon" },
    location: { scope: "exact_store" as const, label: "Bottle Shop", state: "NC", store: { name: "Bottle Shop", address: "1 Main St", city: "Raleigh", state: "NC" } },
    timing: { reportedAt: "2026-08-21T12:00:00.000Z", displayAt: "2026-08-21T12:00:00.000Z" },
    evidence: { summary: "Two bottles on the shelf", photo: false, corroborationCount: 0, helpfulCount: 2, retailerReported: false, sourceBacked: false },
    strength: "more_activity" as const,
    availability: { status: "reported" as const, quantity: 2, quantityLabel: "2 bottles", price: 69.99, caveat: "Availability can change." },
    alertEligibility: { inventory: false, watch: true },
    actions: ["watch_bottle", "report"] as Signal["actions"],
  };
  const presented = presentSignal(signal);
  assert.equal(presented.location, "Bottle Shop · Raleigh, NC");
  assert.equal(presented.price, "$69.99");
  assert.equal(presented.quantity, "2 seen");
  assert.equal(presented.summary, "Two bottles on the shelf");
  assert.equal(presented.reporter, "", "a member tag must not be substituted for an unset display name");
  assert.equal(signalCardStatusLabel(signal, new Date("2026-08-23T12:00:00.000Z")), "Community report");
  assert.equal(signalMemberTagLabel(signal), "Member #19");
  const accessibility = signalAccessibilityLabel(signal, new Date("2026-08-23T12:00:00.000Z"));
  for (const detail of ["Example Bourbon", "Bottle Shop", "$69.99", "2 seen", "Two bottles on the shelf", "Member #19", "2 days ago"]) {
    assert.match(accessibility, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(accessibility, /Member sighting/);

  const founder: Signal = {
    ...signal,
    id: "member:founder",
    source: { type: "member", label: "Founder #4", actor: { kind: "founder", number: 4, label: "Founder #4" } },
  };
  assert.equal(signalCardStatusLabel(founder, new Date("2026-08-23T12:00:00.000Z")), "Community report");
  assert.equal(signalMemberTagLabel(founder), "Founder #4");
  assert.equal(signalCardStatusLabel({
    ...signal,
    id: "member:legacy",
    source: { type: "member", label: "Member" },
  }, new Date("2026-08-23T12:00:00.000Z")), "Community report");

  const numericQuantity: Signal = {
    ...signal,
    id: "member:numeric-quantity",
    availability: { ...signal.availability!, quantity: undefined, quantityLabel: "4" },
  };
  assert.equal(presentSignal(numericQuantity).quantity, "4 seen");
  assert.equal(presentSignal({ ...numericQuantity, availability: { ...numericQuantity.availability!, quantityLabel: "1" } }).quantity, "1 seen");
  assert.equal(presentSignal({ ...signal, availability: { status: "reported", price: 69.99 } }).quantity, "Quantity unknown");

  const release: Signal = {
    ...signal,
    id: "release:example",
    kind: "release",
    source: { type: "trusted_source", label: "State board" },
    location: { scope: "state", label: "", state: "" },
  };
  const releaseAccessibility = signalAccessibilityLabel(release, new Date("2026-08-23T12:00:00.000Z"));
  assert.match(releaseAccessibility, /Location not specified/);
  assert.match(releaseAccessibility, /Release/);
  assert.doesNotMatch(releaseAccessibility, /Reported/);

  const market: Signal = {
    ...signal,
    id: "market:example",
    source: { type: "trusted_source", label: "CityHive inventory" },
    evidence: {
      ...signal.evidence,
      summary: "Embeds a positive CityHive option bound to merchant 101 and product 9001.",
      retailerReported: false,
      sourceBacked: true,
    },
    availability: {
      status: "available_now",
      price: 63.99,
      label: "Retailer reports orderable availability; exact count is not published",
      caveat: "Availability can change.",
    },
  };
  const now = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(signalCardStatusLabel(market, now), "Reported available");
  const freshMarket: Signal = {
    ...market,
    timing: { ...market.timing, displayAt: "2026-08-23T11:00:00.000Z" },
  };
  assert.equal(signalCardStatusLabel(freshMarket, now), "Retailer reports available");
  assert.equal(signalAvailabilityIsCurrent(freshMarket, now), true);
  assert.equal(signalAvailabilityRefreshAt(freshMarket, now), Date.parse("2026-08-24T11:00:00.000Z"));

  const explicitlyActiveMarket: Signal = {
    ...market,
    timing: { ...market.timing, displayAt: "2026-08-21T12:00:00.000Z", expiresAt: "2026-08-23T13:00:00.000Z" },
  };
  assert.equal(signalAvailabilityIsCurrent(explicitlyActiveMarket, now), true);
  assert.equal(signalCardStatusLabel(explicitlyActiveMarket, now), "Retailer reports available");
  assert.equal(signalAvailabilityRefreshAt(explicitlyActiveMarket, now), Date.parse("2026-08-23T13:00:00.000Z"));

  const expiredMarket: Signal = {
    ...market,
    timing: { ...market.timing, displayAt: "2026-08-23T11:00:00.000Z", expiresAt: "2026-08-23T11:30:00.000Z" },
  };
  assert.equal(signalAvailabilityIsCurrent(expiredMarket, now), false);
  assert.equal(signalCardStatusLabel(expiredMarket, now), "Reported available");
  assert.equal(signalAvailabilityRefreshAt(expiredMarket, now), Date.parse("2026-08-26T11:00:00.000Z"));

  const upcomingMarket: Signal = {
    ...market,
    timing: { ...market.timing, displayAt: "2026-08-23T13:00:00.000Z", expiresAt: "2026-08-23T14:00:00.000Z" },
  };
  assert.equal(signalAvailabilityIsCurrent(upcomingMarket, now), false);
  assert.equal(signalCardStatusLabel(upcomingMarket, now), "Upcoming");
  assert.equal(signalAvailabilityRefreshAt(upcomingMarket, now), Date.parse("2026-08-23T13:00:00.000Z"));
  assert.equal(presentSignal(market).quantity, "Quantity unknown");
  assert.equal(presentSignal({ ...market, availability: { ...market.availability!, price: 0 } }).price, "Price unknown");
  assert.equal(presentSignal({ ...market, availability: { ...market.availability!, price: undefined } }).price, "Price unknown");
  assert.equal(signalCardSummary(market), "");
  assert.equal(signalCardSummary(signal), "Two bottles on the shelf");
  assert.equal(signalCardSummary({
    ...market,
    id: "release:trusted",
    kind: "release",
    evidence: { ...market.evidence, summary: "Bottle release opens Friday morning." },
  }), "Bottle release opens Friday morning.");
  const marketAccessibility = signalAccessibilityLabel(market, now);
  assert.match(marketAccessibility, /Reported available/);
  assert.match(marketAccessibility, /Quantity unknown/);
  assert.doesNotMatch(marketAccessibility, /CityHive|Source backed|exact count is not published|Available now/);
});

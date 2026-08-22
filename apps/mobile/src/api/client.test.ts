import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi, MobileApiError } from "./client";
import { presentSignal } from "./presentation";

test("sends bearer auth and opaque cursor without inspecting it", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "session-token",
    fetcher: async (request) => {
      requests.push(new Request(request));
      return Response.json({ signals: [], nextCursor: null, hasMore: false });
    },
  });
  await api.listSignals({ limit: 20, cursor: "opaque/cursor+value" });
  assert.equal(requests[0].headers.get("authorization"), "Bearer session-token");
  assert.equal(new URL(requests[0].url).searchParams.get("cursor"), "opaque/cursor+value");
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

test("preserves legacy string API errors instead of replacing them with a generic message", async () => {
  const api = createMobileApi({
    getToken: async () => "session-token",
    fetcher: async () => Response.json({ error: "Collection storage is temporarily unavailable." }, { status: 503 }),
  });
  await assert.rejects(api.getMemberPreferences(), (error: unknown) => error instanceof MobileApiError && error.message === "Collection storage is temporarily unavailable.");
});

test("presents the canonical Signal transport shape without legacy field assumptions", () => {
  const presented = presentSignal({
    contractVersion: "bourbon-signal/signal@1",
    id: "member:example",
    kind: "availability",
    source: { type: "member", label: "Member #19", actor: { kind: "member", number: 19, label: "Member #19" } },
    bottle: { id: "bottle-1", name: "Example Bourbon" },
    location: { scope: "exact_store", label: "Bottle Shop", state: "NC", store: { name: "Bottle Shop", address: "1 Main St", city: "Raleigh", state: "NC" } },
    timing: { reportedAt: "2026-08-21T12:00:00.000Z", displayAt: "2026-08-21T12:00:00.000Z" },
    evidence: { summary: "Two bottles on the shelf", photo: false, corroborationCount: 0, helpfulCount: 2, retailerReported: false, sourceBacked: false },
    strength: "more_activity",
    availability: { status: "reported", quantity: 2, quantityLabel: "2 bottles", price: 69.99, caveat: "Availability can change." },
    alertEligibility: { inventory: false, watch: true },
    actions: ["watch_bottle", "report"],
  });
  assert.equal(presented.location, "Bottle Shop · Raleigh · NC");
  assert.equal(presented.price, "$69.99");
  assert.equal(presented.quantity, "2 bottles");
  assert.equal(presented.summary, "Two bottles on the shelf");
});

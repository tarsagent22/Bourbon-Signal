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

import assert from "node:assert/strict";
import test from "node:test";
import { preferencesFixture } from '../api/astra-fixtures';
import { createMobileApi } from "../api/client";
import { bottleWatchMutation } from "./radar-preferences";
import { applyWatchlistWrite, type WatchlistState } from "../../../../src/lib/watchlist-state";

// Offline mobile transport regression using the canonical pure server mutation.
// Actual route/lease and multi-connection SQL are exercised by the root suites.
test("M03: two mounted clients adding distinct bottles must preserve both watches", async () => {
  let stored: { bottleAlertPreferences: WatchlistState } = { bottleAlertPreferences: { bottleNames: [], bottleKeys: [], version: 0 } };
  const fetcher: typeof fetch = async (input) => {
    const request = new Request(input);
    assert.equal(new URL(request.url).hostname, "astra-fixture.invalid");
    if (request.method === "POST") {
      const body = await request.json();
      stored = { ...stored, bottleAlertPreferences: applyWatchlistWrite(stored.bottleAlertPreferences, body.bottleAlertPreferences, body.watchlistMutation, 100) };
    }
    return Response.json(preferencesFixture(stored));
  };
  const options = { baseUrl: "https://astra-fixture.invalid", getToken: async () => "fixture-session", fetcher };
  const first = createMobileApi(options);
  const second = createMobileApi(options);
  const [firstSnapshot, secondSnapshot] = await Promise.all([
    first.getMemberPreferences(), second.getMemberPreferences(),
  ]);
  assert.deepEqual(firstSnapshot.bottleAlertPreferences, secondSnapshot.bottleAlertPreferences);
  await first.updateMemberPreferences({ watchlistMutation: bottleWatchMutation("Bottle A", true) });
  await second.updateMemberPreferences({ watchlistMutation: bottleWatchMutation("Bottle B", true) });
  const saved = await first.getMemberPreferences({ fresh: true });
  assert.deepEqual(saved.bottleAlertPreferences.bottleNames.sort(), ["Bottle A", "Bottle B"]);
});

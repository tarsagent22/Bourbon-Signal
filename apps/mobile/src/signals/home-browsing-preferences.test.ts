import assert from "node:assert/strict";
import { resolveHomeStartup, type HomeBrowsingPreferences } from './home-browsing-preferences';
import test from "node:test";

test('saved feed scope restores before a slow profile, while new members wait for their home state', async () => {
  let finish!: (state: string) => void;
  const profile = new Promise<string>(resolve => { finish = resolve; });
  const saved: HomeBrowsingPreferences = { version: 1, view: 'community', filtersByView: { market: DEFAULT_SIGNAL_FILTERS, community: { ...DEFAULT_SIGNAL_FILTERS, state: 'VA' } } };
  const restored = await resolveHomeStartup(Promise.resolve(saved), profile);
  assert.equal(restored.saved, saved);
  let settled = false;
  const firstLaunch = resolveHomeStartup(Promise.resolve(null), profile).then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  finish('NC');
  assert.equal((await firstLaunch).homeState, 'NC');
  assert.deepEqual(await resolveHomeStartup(Promise.reject(new Error('storage')), Promise.reject(new Error('offline'))), { saved: null, homeState: undefined });
});
import { DEFAULT_SIGNAL_FILTERS } from "./feed-filters";
import { homeBrowsingStorageKey, parseHomeBrowsingPreferences, serializeHomeBrowsingPreferences } from "./home-browsing-preferences";

test("Home browsing preferences are scoped to the signed-in member", () => {
  assert.equal(homeBrowsingStorageKey("user_123"), "bourbon-signal.home-browsing.user_123");
  assert.equal(homeBrowsingStorageKey(null), "");
});

test("Home browsing preferences round-trip both feeds independently", () => {
  const value = {
    version: 1 as const,
    view: "community" as const,
    filtersByView: {
      market: { ...DEFAULT_SIGNAL_FILTERS, state: "NC", area: "Wake County ABC", bottle: "Stagg", rarities: ["allocated" as const] },
      community: { ...DEFAULT_SIGNAL_FILTERS, state: "AZ", bottle: "Weller" },
    },
  };
  assert.deepEqual(parseHomeBrowsingPreferences(serializeHomeBrowsingPreferences(value)), value);
});

test("invalid or stale browsing data safely falls back without Radar fields", () => {
  assert.equal(parseHomeBrowsingPreferences("not-json"), null);
  assert.equal(parseHomeBrowsingPreferences(JSON.stringify({ version: 1, view: "market", filtersByView: { market: { ...DEFAULT_SIGNAL_FILTERS, state: "North Carolina" } } })), null);
  assert.doesNotMatch(serializeHomeBrowsingPreferences({ version: 1, view: "market", filtersByView: { market: DEFAULT_SIGNAL_FILTERS, community: DEFAULT_SIGNAL_FILTERS } }), /monitoringScopes|notificationPreferences|areaPreferences/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions } = require('./astra-security-test-helpers.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(responses, storageDisabled = false) {
  let effect, now = 100_000, calls = 0, reloads = 0;
  const timers = new Map(), storage = new Map(); let id = 0;
  const user = { id: 'user_fixture', publicMetadata: {}, reload: async () => { reloads++; } };
  const window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  if (storageDisabled) Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('storage disabled'); } });
  class Clock extends Date { static now() { return now; } }
  const ctx = functions('src/lib/auth.ts', ['useAuth'], {
    window, Date: Clock, useUser: () => ({ isLoaded: true, isSignedIn: true, user }), useClerk: () => ({}), useEffect: fn => { effect = fn; },
    resolveEffectiveMembershipTier: () => 'free', getEntitlements: () => ({}), isPaidTier: () => false,
    fetch: async () => { const response = responses[Math.min(calls++, responses.length - 1)]; return typeof response === 'function' ? response() : response; },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; }, clearTimeout: key => timers.delete(key),
  });
  return { mount: () => { ctx.useAuth(); return effect(); }, calls: () => calls, reloads: () => reloads, timers, storage, advance: ms => { now += ms; }, tick: async () => { const [key, timer] = timers.entries().next().value; timers.delete(key); now += timer.delay; timer.fn(); await flush(); } };
}
const negative = { ok: true, status: 200, json: async () => ({ ok: true, activated: false, reason: 'no_completed_membership_checkout_found' }) };
const positive = { ok: true, status: 200, json: async () => ({ ok: true, activated: true }) };
const transient = { ok: false, status: 503 };
test('SUG-03 mounted callers coalesce definitive negative and cooldown is not permanent', async () => {
  const h = harness([negative, positive]); const stops = [h.mount(), h.mount(), h.mount()]; await flush();
  assert.equal(h.calls(), 1); assert.equal(h.timers.size, 0);
  stops.forEach(stop => stop()); h.mount(); await flush(); assert.equal(h.calls(), 1);
  h.advance(31_000); h.mount(); await flush(); assert.equal(h.calls(), 2); assert.equal(h.reloads(), 1);
});
test('SUG-03 concurrent mounted callers share bounded transient retries and one reload', async () => {
  const h = harness([transient, transient, positive]); h.mount(); h.mount(); h.mount(); await flush();
  assert.equal(h.calls(), 1); assert.equal(h.timers.size, 1); await h.tick(); await h.tick();
  assert.equal(h.calls(), 3); assert.equal(h.reloads(), 1); assert.equal(h.timers.size, 0);
  assert.equal(h.storage.get('bourbon_signal_checkout_recover_user_fixture'), '1');
});
test('SUG-03 exhausted failures remain bounded across remounts but allow later retry', async () => {
  const h = harness([transient]); h.mount(); await flush(); await h.tick(); await h.tick();
  assert.equal(h.calls(), 3); assert.equal(h.timers.size, 0); h.mount(); await flush(); assert.equal(h.calls(), 3);
  h.advance(31_000); h.mount(); await flush(); assert.equal(h.calls(), 4);
});
test('SUG-03 one unmount cannot cancel another caller; last unmount cancels queued retries', async () => {
  const h = harness([transient]); const stop1 = h.mount(), stop2 = h.mount(); await flush();
  stop1(); assert.equal(h.timers.size, 1); stop2(); assert.equal(h.timers.size, 0);
});
test('SUG-03 in-flight strict remount shares work even without sessionStorage', async () => {
  let resolve;
  const h = harness([() => new Promise(done => { resolve = done; })], true);
  const stop = h.mount(); stop(); h.mount(); resolve(negative); await flush();
  assert.equal(h.calls(), 1); assert.equal(h.timers.size, 0);
});

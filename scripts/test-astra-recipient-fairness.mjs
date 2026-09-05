import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Execute the actual delivery function. Every external boundary is synthetic;
// there are deliberately no provider SDKs, credentials or network in this VM.
const source = readFileSync(new URL('../src/lib/alert-delivery.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function deliverPreferenceAlerts(');
const compiled = ts.transpile(source.slice(start).replace('export async', 'async'), { target: ts.ScriptTarget.ES2022 });
function fixture(users, overrides = {}) {
  let cursor = 0;
  const seen = [];
  const pollModes = [], demandCalls = [];
  const repository = {
    acquireLease: async () => true, releaseLease: async () => {},
    readRecipientCursor: async () => cursor,
    writeRecipientCursor: async (offset) => { cursor = offset; },
  };
  const context = {
    pollRuntimeSourceLanes: async dryRun => { pollModes.push(dryRun); },
    traceRuntimeSourceCandidates: async () => {}, runtimeSourceCandidatesStillValid: async () => true,
    persistRuntimeSourceDemand: async (members, complete) => { demandCalls.push({ members, complete }); },
    classifyCompanyMember: () => ({ isOwner: false, isRetailer: false }),
    normalizeBottleAlertPreferences: () => ({ bottleNames: [], bottleKeys: [] }), candidateMatchesArea: () => false,
    process: { env: {} }, Date, Set, Map, Math, Number, String,
    assertAlertDeliveryAuthorized: () => {}, readAlertCandidateBatch: async () => ({ candidates: [], snapshot: { snapshotId: 'fixture', generatedAt: new Date().toISOString() } }),
    evaluateAlertSnapshotSafety: () => ({ safe: true }), loadSiteLocationLookupRecords: async () => {},
    candidateCanUseOnSite: () => false, candidatePassesFreshOnSiteGuardrails: () => false,
    ALERT_DELIVERY_ENABLED: true, ALERT_ONSITE_DELIVERY_ENABLED: true, ALERT_EMAIL_DELIVERY_ENABLED: false, ALERT_SMS_DELIVERY_ENABLED: false,
    MAX_DELIVERY_USERS: 2, MAX_RECIPIENT_SCAN_USERS: 1000,
    alertQueueDatabaseConfigured: () => true, createProductionAlertQueueRepository: () => repository,
    randomUUID: () => 'worker', getResendClient: () => null,
    clerkClient: async () => ({ users: { getUser: async id => users.find(u => u.id === id) } }),
    getUsersPage: async (_client, offset) => ({ data: users.slice(offset, offset + 100), totalCount: users.length }),
    asString: value => typeof value === 'string' ? value : '',
    getServerEntitlements: async metadata => ({ tier: metadata.paid ? 'standard' : 'free' }),
    normalizeNotificationPreferences: () => ({ push: { enabled: false } }), normalizePendingExpoPushTickets: () => [],
    normalizeAreaPrefs: () => ({}), hasSavedAreaPreferences: () => false,
  };
  const vmContext = vm.createContext({ ...context, ...overrides });
  vm.runInContext(compiled, vmContext);
  return { run: async (options = {}) => { const result = await vmContext.deliverPreferenceAlerts({}, options); seen.push(result); return result; }, seen, repository, pollModes, demandCalls, get cursor() { return cursor; } };
}
test('a zero or invalid paid-recipient budget cannot enable delivery', () => {
  const declarations = source.slice(source.indexOf('const MAX_RECENT_DELIVERIES_PER_USER'), source.indexOf('const MAX_EMAILS_PER_RUN'));
  for (const value of ['0', '-1', 'invalid', 'Infinity']) {
    const actual = vm.runInNewContext(`${declarations}\nMAX_DELIVERY_USERS`, { process: { env: { ALERT_DELIVERY_MAX_USERS: value } } });
    assert.equal(actual, 0, value);
  }
});
test('paid accounts beyond a free prefix do not consume the paid processing budget', async () => {
  const users = [...Array.from({ length: 500 }, (_, i) => ({ id: `free-${i}`, publicMetadata: {} })), { id: 'paid-last', publicMetadata: { paid: true } }];
  const f = fixture(users);
  assert.equal((await f.run()).paidUsersConsidered, 1);
  assert.equal(f.demandCalls[0].complete, true);
});
test('bounded runs resume paid recipients and wrap only after reaching the end', async () => {
  const f = fixture(Array.from({ length: 5 }, (_, i) => ({ id: `paid-${i}`, publicMetadata: { paid: true } })));
  assert.equal((await f.run()).paidUsersConsidered, 2);
  assert.equal(f.cursor, 2);
  assert.equal((await f.run()).paidUsersConsidered, 2);
  assert.equal(f.cursor, 4);
  assert.equal((await f.run()).paidUsersConsidered, 1);
  assert.equal(f.cursor, 0);
});
test('raw scan budget is bounded and its next run reaches a later paid account', async () => {
  const users = [...Array.from({ length: 1001 }, (_, i) => ({ id: `free-${i}`, publicMetadata: {} })), { id: 'paid', publicMetadata: { paid: true } }];
  const f = fixture(users);
  assert.equal((await f.run()).usersConsidered, 1000);
  assert.equal(f.cursor, 1000);
  assert.equal((await f.run()).paidUsersConsidered, 1);
  assert.equal(f.cursor, 0);
});
test('observational runs never consume live continuation', async () => {
  const f = fixture(Array.from({ length: 5 }, (_, i) => ({ id: `paid-${i}`, publicMetadata: { paid: true } })));
  await f.run();
  assert.equal(f.cursor, 2);
  await f.run({ dryRun: true });
  assert.equal(f.cursor, 2);
  assert.deepEqual(f.pollModes, [false, true]);
  assert.equal(f.demandCalls.length, 1, 'dry-run cannot persist demand');
  assert.equal(f.demandCalls[0].complete, false, 'bounded partial scan cannot claim complete cohorts');
});
test('another scan owner blocks enumeration without modifying continuation', async () => {
  const f = fixture([{ id: 'paid', publicMetadata: { paid: true } }]);
  f.repository.acquireLease = async () => false;
  const result = await f.run();
  assert.equal(result.scanBusy, true);
  assert.equal(result.usersConsidered, 0);
  assert.equal(f.cursor, 0);
});
test('missing durable storage fails closed for live delivery', async () => {
  const f = fixture([], { alertQueueDatabaseConfigured: () => false });
  const result = await f.run();
  assert.equal(result.ok, false);
  assert.equal(result.deliveryDisabled, true);
});
test('entitlement revocation after enumeration still skips the account', async () => {
  const f = fixture([{ id: 'paid', publicMetadata: { paid: true } }], {
    clerkClient: async () => ({ users: { getUser: async () => ({ id: 'paid', publicMetadata: {} }) } }),
  });
  const result = await f.run();
  assert.equal(result.skippedFreeUsers, 1);
  assert.equal(result.onSiteAlertsCreated + result.emailsSent + result.smsSent + result.pushNotificationsSent, 0);
});

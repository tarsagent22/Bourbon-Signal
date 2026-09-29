import assert from 'node:assert/strict';
import test from 'node:test';
import * as migrationModule from '../src/lib/alert-queue/clerk-migration.ts';

const { ensureAlertDeliveryIdentityV2, extractClerkAlertBaselines } = ((migrationModule as { default?: unknown }).default || migrationModule) as typeof import('../src/lib/alert-queue/clerk-migration.ts');

test('extracts channel-specific Clerk baselines and delivered history without duplicates', () => {
  const result = extractClerkAlertBaselines('user-1', {
    alertDelivery: {
      onSiteBaselineDedupeKeys: ['onsite-a', 'shared'],
      emailBaselineDedupeKeys: ['email-a', 'shared'],
      smsBaselineDedupeKeys: ['sms-a'],
      recent: [
        { dedupeKey: 'email-recent', underlyingStableKeys: ['email-child'], channel: 'email', deliveredAt: '2026-07-10T12:00:00.000Z' },
        { dedupeKey: 'sms-recent', underlyingStableKeys: ['sms-child'], channel: 'sms', deliveredAt: '2026-07-10T12:01:00.000Z' },
        { dedupeKey: 'email-a', channel: 'email', deliveredAt: '2026-07-10T12:02:00.000Z' },
      ],
    },
    alertInbox: {
      recent: [{ dedupeKey: 'onsite-recent', underlyingStableKeys: ['onsite-child'], createdAt: '2026-07-10T11:00:00.000Z' }],
    },
  }, '2026-07-10T15:00:00.000Z');

  assert.deepEqual(result.map((row) => `${row.channel}:${row.stableMatchKey}`).sort(), [
    'email:email-a', 'email:email-child', 'email:email-recent', 'email:shared',
    'onSite:onsite-a', 'onSite:onsite-child', 'onSite:onsite-recent', 'onSite:shared',
    'sms:sms-a', 'sms:sms-child', 'sms:sms-recent',
  ]);
  assert.ok(result.every((row) => row.userId === 'user-1'));
});

test('ignores malformed keys and unknown channels', () => {
  const result = extractClerkAlertBaselines('user-2', {
    alertDelivery: { recent: [{ dedupeKey: '', channel: 'email' }, { dedupeKey: 'bad', channel: 'push' }] },
    alertInbox: { recent: [{ noKey: true }] },
  }, '2026-07-10T15:00:00.000Z');
  assert.deepEqual(result, []);
});

test('v2 migration baselines legacy and current matching identities before sending none', async () => {
  const baselines: string[] = [];
  let persisted: Record<string, unknown> | undefined;
  const result = await ensureAlertDeliveryIdentityV2({
    userId: 'user-1',
    alertDelivery: { recent: [{ dedupeKey: 'legacy-group', deliveredAt: '2026-07-10T10:00:00.000Z', channel: 'email' }] },
    enabledChannels: ['onSite', 'email'],
    currentStableKeys: { onSite: ['A', 'B'], email: ['A'], sms: ['future-sms-key'] },
    createdAt: '2026-07-10T15:00:00.000Z',
    baseline: async (input) => { baselines.push(`${input.channel}:${input.stableMatchKey}`); },
    persist: async (next) => { persisted = next; },
  });
  assert.equal(result.migrated, true);
  assert.equal(result.sendCurrentPass, false);
  assert.deepEqual(baselines, ['email:legacy-group', 'onSite:A', 'onSite:B', 'email:A']);
  assert.equal(persisted?.dedupeIdentityVersion, 2);
  assert.equal('onSiteBaselineDedupeKeys' in (persisted || {}), false, 'durable baseline identities must not be duplicated into Clerk');
  assert.equal('emailBaselineDedupeKeys' in (persisted || {}), false, 'durable baseline identities must not be duplicated into Clerk');
  assert.equal(JSON.stringify(persisted).includes('future-sms-key'), false, 'disabled channels and future keys must not be baselined');
});

test('metadata persistence failure remains fail-closed and repeats migration', async () => {
  let baselineCalls = 0;
  const input = {
    userId: 'user-2', alertDelivery: {}, enabledChannels: ['email' as const], currentStableKeys: { email: ['A'] },
    createdAt: '2026-07-10T15:00:00.000Z', baseline: async () => { baselineCalls += 1; },
  };
  const failed = await ensureAlertDeliveryIdentityV2({ ...input, persist: async () => { throw new Error('Clerk unavailable'); } });
  assert.equal(failed.migrated, false);
  assert.equal(failed.sendCurrentPass, false);
  const retried = await ensureAlertDeliveryIdentityV2({ ...input, persist: async () => {} });
  assert.equal(retried.migrated, true);
  assert.equal(retried.sendCurrentPass, false);
  assert.equal(baselineCalls, 2, 'a failed metadata write must leave v2 absent so the next pass baselines again');
});

test('existing v2 metadata does not baseline or block future distinct keys', async () => {
  let touched = false;
  const result = await ensureAlertDeliveryIdentityV2({
    userId: 'user-3', alertDelivery: { dedupeIdentityVersion: 2 }, enabledChannels: ['email'], currentStableKeys: { email: ['new-key'] },
    createdAt: '2026-07-10T15:00:00.000Z', baseline: async () => { touched = true; }, persist: async () => { touched = true; },
  });
  assert.equal(result.migrated, false);
  assert.equal(result.sendCurrentPass, true);
  assert.equal(touched, false);
});

test('existing v2 metadata imports legacy Clerk baseline arrays before compacting them', async () => {
  const baselines: string[] = [];
  let persisted: Record<string, unknown> = {};
  const result = await ensureAlertDeliveryIdentityV2({
    userId: 'user-v2-legacy',
    alertDelivery: {
      dedupeIdentityVersion: 2,
      emailBaselineDedupeKeys: ['legacy-a'],
      recent: [{ channel: 'email', dedupeKey: 'group-a', underlyingStableKeys: ['legacy-b'], deliveredAt: '2026-07-10T14:00:00.000Z' }],
    },
    enabledChannels: ['email'],
    currentStableKeys: { email: ['new-key'] },
    createdAt: '2026-07-10T15:00:00.000Z',
    baseline: async ({ stableMatchKey }) => { baselines.push(stableMatchKey); },
    persist: async (next) => { persisted = next; },
  });
  assert.equal(result.migrated, true);
  assert.equal(result.sendCurrentPass, false);
  assert.deepEqual(baselines.sort(), ['group-a', 'legacy-a', 'legacy-b']);
  assert.equal('emailBaselineDedupeKeys' in persisted, false);
});

test('migration preserves the full durable baseline set while keeping Clerk metadata bounded', async () => {
  const keys = Array.from({ length: 1005 }, (_, index) => `key-${index}`);
  const baselines: string[] = [];
  let persisted: Record<string, unknown> = {};
  await ensureAlertDeliveryIdentityV2({
    userId: 'user-many', alertDelivery: {}, enabledChannels: ['email'], currentStableKeys: { email: keys },
    createdAt: '2026-07-10T15:00:00.000Z', baseline: async ({ stableMatchKey }) => { baselines.push(stableMatchKey); }, persist: async (next) => { persisted = next; },
  });
  assert.deepEqual(baselines, keys);
  assert.equal('emailBaselineDedupeKeys' in persisted, false);
  assert.ok(Buffer.byteLength(JSON.stringify(persisted), 'utf8') <= 3072);
});

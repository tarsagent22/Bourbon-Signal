import assert from 'node:assert/strict';
import test from 'node:test';
import { extractClerkAlertBaselines } from '../src/lib/alert-queue/clerk-migration.ts';

test('extracts channel-specific Clerk baselines and delivered history without duplicates', () => {
  const result = extractClerkAlertBaselines('user-1', {
    alertDelivery: {
      onSiteBaselineDedupeKeys: ['onsite-a', 'shared'],
      emailBaselineDedupeKeys: ['email-a', 'shared'],
      smsBaselineDedupeKeys: ['sms-a'],
      recent: [
        { dedupeKey: 'email-recent', channel: 'email', deliveredAt: '2026-07-10T12:00:00.000Z' },
        { dedupeKey: 'sms-recent', channel: 'sms', deliveredAt: '2026-07-10T12:01:00.000Z' },
        { dedupeKey: 'email-a', channel: 'email', deliveredAt: '2026-07-10T12:02:00.000Z' },
      ],
    },
    alertInbox: {
      recent: [{ dedupeKey: 'onsite-recent', createdAt: '2026-07-10T11:00:00.000Z' }],
    },
  }, '2026-07-10T15:00:00.000Z');

  assert.deepEqual(result.map((row) => `${row.channel}:${row.stableMatchKey}`).sort(), [
    'email:email-a', 'email:email-recent', 'email:shared',
    'onSite:onsite-a', 'onSite:onsite-recent', 'onSite:shared',
    'sms:sms-a', 'sms:sms-recent',
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

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import * as pointsModule from '../src/lib/signal-points-repository.ts';
import * as snapshotModule from '../src/lib/member-rewards-snapshot.ts';
const { sameMemberRewardProfile } = ('default' in snapshotModule ? {...snapshotModule, ...(snapshotModule.default as object)} : snapshotModule) as typeof import('../src/lib/member-rewards-snapshot.ts');
import * as rewardModule from '../src/lib/sighting-rewards.ts';
const { reconcileMemberRewards } = ('default' in rewardModule ? {...rewardModule, ...(rewardModule.default as object)} : rewardModule) as typeof import('../src/lib/sighting-rewards.ts');
const { SignalPointsRepository, syncCurrentSignalRewardCatalog } = ('default' in pointsModule ? { ...pointsModule, ...(pointsModule.default as object) } : pointsModule) as typeof import('../src/lib/signal-points-repository.ts');
const db = new PGlite();
try {
  for (const name of ['referral-schema','founder-shipping-schema','account-deletion-schema','signal-points-schema']) {
    await db.exec(await readFile(new URL(`../src/lib/${name}.sql`, import.meta.url), 'utf8'));
  }
  const migration = await readFile(new URL('../src/lib/member-rewards-snapshot-migration.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const query = { query: async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows };
  const repository = new SignalPointsRepository(query, { allowUnverifiedCutover: true });
  const profile = { points: 10, badges: [{ id: 'first_sighting', label: 'First Sighting', pointsAwarded: 10, earnedAt: '2026-09-01T12:00:00Z' }], ledger: [{ id: 'badge_v3:first_sighting', badgeId: 'first_sighting', reason: 'badge_v3', points: 10, createdAt: '2026-09-01T12:00:00Z' }], largeHistory: 'x'.repeat(20000) };
  const generation = await repository.nextRewardGeneration('member');
  assert.equal((await repository.reconcileClerkRewardsWithStatus('member', profile, generation)).applied, true);
  assert.deepEqual(await repository.readRewardProfile('member'), profile, 'large profiles persist outside Clerk and retain original earned dates');
  assert.ok(sameMemberRewardProfile({ points: 10, optional: undefined, badges: [] }, { badges: [], points: 10 }), 'JSONB key order and absent optional fields never trigger repeated persistence');
  const reconciled = reconcileMemberRewards([], undefined, '2026-10-03T12:00:00Z');
  assert.ok(sameMemberRewardProfile(JSON.parse(JSON.stringify(reconciled)), reconcileMemberRewards([], reconciled, '2026-10-03T12:01:00Z')), 'an unchanged profile does not need another database write');
  assert.equal((await repository.reconcileClerkRewardsWithStatus('member', profile, generation)).balance, 10, 'retry never awards twice');
  assert.equal(await repository.readRewardProfile('other'), undefined, 'profiles are account scoped');
  const newer = await repository.nextRewardGeneration('member');
  const corrected = { ...profile, points: 0, ledger: [], badges: [] };
  await repository.reconcileClerkRewards('member', corrected, newer);
  assert.equal((await repository.reconcileClerkRewardsWithStatus('member', profile, generation)).applied, false);
  assert.deepEqual(await repository.readRewardProfile('member'), corrected, 'stale generation cannot restore a revoked award or snapshot');
  await db.query("UPDATE signal_point_reward_generations SET member_rewards_snapshot=NULL WHERE user_id='member'");
  assert.deepEqual(await repository.readRewardProfile('member', corrected), corrected, 'migration fallback must never recover a reversed award from historical credits');
  const next = await repository.advanceRewardGenerationIfCurrent('member', newer);
  assert.equal(next, newer + 1);
  assert.equal(await repository.advanceRewardGenerationIfCurrent('member', newer), null, 'only one concurrent reader advances an observed generation');
  const metadata = (await db.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM signal_point_ledger WHERE user_id='member'")).rows;
  assert.ok(metadata.every(row => !('rewardSnapshot' in row.metadata)), 'the profile is not copied into every immutable ledger entry');

  // Monotonic catalog upgrades preserve previously submitted redemption snapshots.
  await db.query("UPDATE signal_reward_catalog SET catalog_version=1,points_cost=450 WHERE item_key='glencairn'");
  await db.query("UPDATE signal_reward_catalog SET catalog_version=2,points_cost=2600 WHERE item_key='bourbon_shipping_gift_card_100'");
  await db.query("INSERT INTO signal_point_accounts(user_id,balance) VALUES('history',3000)");
  await db.query(`INSERT INTO signal_reward_redemptions(id,user_id,idempotency_key,item_key,catalog_version,item_snapshot,points_spent,status,account_email)
    VALUES('historical-redemption','history','original','glencairn',1,'{"points":450}'::jsonb,450,'submitted','history@example.test')`);
  await syncCurrentSignalRewardCatalog(query);
  const prices = (await db.query("SELECT item_key,points_cost,catalog_version FROM signal_reward_catalog WHERE item_key IN ('glencairn','bourbon_shipping_gift_card_100') ORDER BY item_key")).rows;
  assert.deepEqual(prices, [{ item_key: 'bourbon_shipping_gift_card_100', points_cost: 2500, catalog_version: 4 }, { item_key: 'glencairn', points_cost: 500, catalog_version: 4 }]);
  assert.deepEqual((await db.query("SELECT points_spent,item_snapshot FROM signal_reward_redemptions WHERE id='historical-redemption'")).rows[0], { points_spent: 450, item_snapshot: { points: 450 } });

  await repository.reconcileClerkRewards('member', profile, next!);
  const token = 'deleted:00000000-0000-4000-8000-000000000001';
  await db.query(`INSERT INTO account_deletion_requests(user_id,request_id,subject_token,status,requested_at,updated_at)
    VALUES('member','test-deletion-request', $1,'cleanup_queued',NOW(),NOW())`, [token]);
  await db.query('SELECT anonymize_signal_points_member($1,$2,$3,$4)', ['member', token, 'deleted@example.test', 'test-deletion-request']);
  assert.equal(await repository.readRewardProfile('member'), undefined);
  assert.equal((await db.query('SELECT member_rewards_snapshot FROM signal_point_reward_generations WHERE user_id=$1', [token])).rows[0].member_rewards_snapshot, null, 'account deletion removes the achievement history from the anonymized record');
  console.log('Durable rewards: oversized metadata, dates, account isolation, generation races, price history, and deletion passed.');
} finally { await db.close(); }

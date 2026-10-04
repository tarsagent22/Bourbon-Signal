import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import * as pointsModule from '../src/lib/signal-points-repository.ts';
const { SignalPointsRepository } = ('default' in pointsModule ? { ...pointsModule, ...(pointsModule.default as object) } : pointsModule) as typeof import('../src/lib/signal-points-repository.ts');
const db = new PGlite();
for (const name of ['referral-schema','founder-shipping-schema','signal-points-schema','hunt-outcome-schema','quality-outcome-rewards']) {
  await db.exec(await readFile(new URL(`../src/lib/${name}.sql`,import.meta.url),'utf8'));
}
async function set(episode:string,outcome='found_it',source='retailer',user='member') {
  await db.query(`INSERT INTO hunt_outcomes(user_id,signal_id,availability_episode_id,outcome,source_type) VALUES($1,$2,$2,$3,$4) ON CONFLICT(user_id,availability_episode_id) DO UPDATE SET outcome=EXCLUDED.outcome`,[user,episode,outcome,source]);
  return (await db.query<{points:number;balance:number}>('SELECT * FROM reconcile_quality_outcome_reward($1,$2)',[user,episode])).rows[0];
}
assert.deepEqual(await set('one'),{points:5,balance:5});
assert.deepEqual(await set('one'),{points:5,balance:5},'same episode cannot earn twice');
assert.deepEqual(await set('one','gone_when_checked'),{points:5,balance:5},'switching outcome cannot earn twice');
assert.deepEqual(await set('two'),{points:5,balance:10});
assert.deepEqual(await set('three'),{points:5,balance:15});
assert.deepEqual(await set('four'),{points:0,balance:15},'daily cap is enforced');
assert.deepEqual(await set('community','found_it','member'),{points:0,balance:15},'self reports cannot farm rewards');
assert.deepEqual(await set('one','didnt_go'),{points:0,balance:10},'withdrawn first-hand update reverses the award');
assert.deepEqual(await set('four'),{points:0,balance:10},'reversal does not reset the daily cap');
assert.deepEqual(await set('one'),{points:5,balance:15},'restoring one existing report restores only its original award');
assert.deepEqual(await set('one','found_it','retailer','other'),{points:5,balance:5},'accounts stay isolated');
await db.query("DELETE FROM hunt_outcomes WHERE user_id='other' AND availability_episode_id='one'");
assert.deepEqual((await db.query('SELECT * FROM reconcile_quality_outcome_reward($1,$2)',['other','one'])).rows[0],{points:0,balance:0},'deleting an update reverses it');
await db.query("INSERT INTO signal_point_migrations(migration_key) VALUES('signal_points_clerk_metadata_v1_verified_complete') ON CONFLICT DO NOTHING");
const repository = new SignalPointsRepository({query: async (text, params) => (await db.query(text,params)).rows});
const summary = await repository.readMember('member');
assert.equal(summary.balance,15);
assert.ok(summary.activity.length>0);
assert.ok(summary.activity.every(entry=>entry.reason==='outcome_confirmation'));
assert.ok(summary.activity.every(entry=>!('metadata' in entry) && !('userId' in entry)),'activity excludes private internal metadata');
assert.ok(summary.catalog.find(item=>item.key==='rocks_glass')?.options.glassQuantity===1);
await db.close();
console.log('Quality outcome SQL: idempotency, cap, reversals, restored updates and account isolation passed.');

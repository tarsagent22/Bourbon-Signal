import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PostgresPushOwnershipRepository, pushOwnershipHash } from '../src/lib/push-ownership.ts';
import { PostgresAlertQueueRepository, type SqlExecutor } from '../src/lib/alert-queue/postgres-repository.ts';
import type { PushDeviceRecord } from '../src/lib/push-devices.ts';

// Shared by the offline WASM SQL test and the parent's real Postgres proof runner.
export async function runMemberStateSqlContract(sql: SqlExecutor) {
 const schema=await readFile(new URL('../src/lib/push-ownership-schema.sql',import.meta.url),'utf8');
 for(let i=0;i<2;i++) for(const statement of schema.split(';').filter(s=>s.trim())) await sql.query(statement);
 const a=new PostgresPushOwnershipRepository(sql),b=new PostgresPushOwnershipRepository(sql);
 const d:PushDeviceRecord={deviceId:'fixture-installation',expoPushToken:'ExpoPushToken[fixture-token-12345]',platform:'ios',bindingId:'generation-a',enabled:true,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
 await a.bind('fixture-A',d,d.bindingId!);
 await a.bind('fixture-A',d,d.bindingId!);
 assert.equal((await b.owned('fixture-A',[d])).length,1);
 assert.equal((await b.owned('fixture-B',[d])).length,0);
 assert.equal((await b.owned('fixture-A',[{...d,bindingId:undefined}])).length,0);
 const reassigned={...d,bindingId:'generation-b'};
 await b.bind('fixture-B',reassigned,reassigned.bindingId);
 assert.equal((await a.owned('fixture-A',[d])).length,0);
 assert.equal((await b.owned('fixture-B',[reassigned])).length,1);
 await a.disable('fixture-A',d.deviceId);
 assert.equal((await b.owned('fixture-B',[reassigned])).length,1);
 await b.disable('fixture-B',d.deviceId);
 assert.equal((await b.owned('fixture-B',[reassigned])).length,0);
 const renewed={...d,bindingId:'generation-c'};
 await a.bind('fixture-A',renewed,renewed.bindingId);
 assert.equal((await a.owned('fixture-A',[d])).length,0,'stale generation stays revoked after re-enable');
 const rotated={...renewed,expoPushToken:'ExpoPushToken[fixture-token-rotated]',bindingId:'generation-d'};
 await a.bind('fixture-A',rotated,rotated.bindingId);
 assert.equal((await a.owned('fixture-A',[renewed])).length,0,'rotating token revokes old pair');
 const moved={...rotated,deviceId:'fixture-installation-new',bindingId:'generation-e'};
 await b.bind('fixture-B',moved,moved.bindingId);
 assert.equal((await a.owned('fixture-A',[rotated])).length,0,'same token on different install has one owner');
 const unrelated={...d,deviceId:'fixture-unrelated',expoPushToken:'ExpoPushToken[fixture-unrelated-token]',bindingId:'generation-unrelated'};
 await a.bind('fixture-A',unrelated,unrelated.bindingId);
 assert.equal((await a.owned('fixture-A',[unrelated])).length,1);
 await sql.query('update member_push_ownership set expires_at=now()-interval \'1 second\' where resource_hash=$1',[pushOwnershipHash('installation',unrelated.deviceId)]);
 assert.equal((await a.owned('fixture-A',[unrelated])).length,0,'offline residual is bounded by registration expiry');
 // Concurrent crossed pair assignments must never create two valid owners.
 await Promise.all([a.bind('fixture-A',d,'race-a'),b.bind('fixture-B',d,'race-b')]);
 const winners=await Promise.all([a.owned('fixture-A',[{...d,bindingId:'race-a'}]),b.owned('fixture-B',[{...d,bindingId:'race-b'}])]);
 assert.equal(winners.flat().length,1);
 const rows=(await sql.query('select * from member_push_ownership')).rows;
 const serialized=JSON.stringify(rows);
 assert.ok(!serialized.includes('ExpoPushToken['));assert.ok(!serialized.includes('fixture-installation'));
 assert.ok(rows.every(r=>/^[a-f0-9]{64}$/.test(String(r.resource_hash))));
 // Exercise the existing real lease SQL, independently instantiated repositories.
 const la=new PostgresAlertQueueRepository(sql),lb=new PostgresAlertQueueRepository(sql);
 const now=new Date().toISOString(),expires=new Date(Date.now()+60_000).toISOString();
 // Bootstrap once so the test's first concurrent contention is the lease, not DDL catalog locks.
 assert.equal(await la.acquireLease('member:fixture','bootstrap',now,expires),true);await la.releaseLease('member:fixture','bootstrap');
 const claims=await Promise.all([la.acquireLease('member:fixture','A',now,expires),lb.acquireLease('member:fixture','B',now,expires)]);
 assert.equal(claims.filter(Boolean).length,1);
 const winner=claims[0]?'A':'B',loser=claims[0]?'B':'A';
 assert.equal(await la.renewLease('member:fixture',winner),true);
 assert.equal(await lb.renewLease('member:fixture',loser),false);
 await lb.releaseLease('member:fixture',loser);assert.equal(await lb.acquireLease('member:fixture',loser,now,expires),false);
 await la.releaseLease('member:fixture',winner);assert.equal(await lb.acquireLease('member:fixture',loser,now,expires),true);
 assert.equal(await la.renewLease('member:fixture',winner),false,'old owner cannot renew after takeover');
 await sql.query("update alert_delivery_leases set expires_at=clock_timestamp()-interval '1 second' where lease_key='member:fixture'");
 assert.equal(await lb.renewLease('member:fixture',loser),false,'expired owner cannot renew');
 await lb.releaseLease('member:fixture',loser);
 assert.equal(await lb.renewLease('member:fixture',loser),false,'missing row cannot be reacquired by renewal');
 console.log('PASS: idempotent schema, SQL ownership/generation/revoke/expiry/secrecy and shared lease contention');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMobileActivityHandler, mobileActivityRecords, type MobileActivityRecord } from '../src/lib/mobile-activity';
import { adminMember, directoryPage } from '../src/lib/admin-member-directory';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { MobileActivityRepository } from '../src/lib/mobile-activity-repository';
const { moduleFrom } = createRequire(import.meta.url)('./astra-security-test-helpers.cjs');
const input = { platform: 'ios', appVersion: '1.1.0', updateId: null };
const req = (body: unknown = input) => new Request('https://example.test/api/v1/me/mobile-activity', { method: 'POST', body: JSON.stringify(body) });
test('authentication, bounded input, server timestamps and throttle', async () => {
  let state: Record<string, MobileActivityRecord> = {}, reads = 0, writes = 0;
  let now = new Date('2026-10-08T15:00:00Z');
  const handler = createMobileActivityHandler({ read: async id => { assert.equal(id, 'signed-in-user'); reads++; return state; }, save: async (id, platform, record) => { assert.equal(id, 'signed-in-user'); state[platform] = record; writes++; }, now: () => now });
  assert.equal((await handler(req(), null)).status, 401); assert.equal(reads, 0);
  for (const invalid of [{...input,platform:'web'}, {...input,appVersion:'x'.repeat(100)}, {...input,updateId:'secret'}, {}, 'x'.repeat(1100)]) assert.equal((await handler(req(invalid), 'signed-in-user')).status, 400);
  assert.equal(reads, 0);
  const response = await handler(req({...input,userId:'victim',lastSeenAt:'2099-01-01'}), 'signed-in-user');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(state.ios.lastSeenAt, now.toISOString()); assert.equal(writes,1);
  await handler(req(), 'signed-in-user'); assert.equal(writes,1);
  now = new Date(now.getTime() + 5 * 60_000);
  await handler(req(), 'signed-in-user'); assert.equal(writes,2); assert.equal(state.ios.firstSeenAt,'2026-10-08T15:00:00.000Z');
  await handler(req({...input,platform:'android'}), 'signed-in-user'); assert.equal(mobileActivityRecords(state).length,2);
  await handler(req({...input,appVersion:'1.1.1'}), 'signed-in-user'); assert.equal(writes,4);
});
test('upstream failures stay private and activity has no raw metadata', async () => {
  const response = await createMobileActivityHandler({ read: async () => {throw new Error('private token');}, save: async () => {} })(req(), 'user');
  assert.equal(response.status,503); assert.doesNotMatch(await response.text(),/private token/);
  assert.deepEqual(mobileActivityRecords({ios:{...input,firstSeenAt:'bad',lastSeenAt:'bad'}}),[]);
  const member = adminMember({id:'user',publicMetadata:{mobileActivity:{ios:input}},unsafeMetadata:{mobileActivity:{ios:input}},privateMetadata:{secret:'private'}});
  assert.deepEqual(member.mobileActivity,[]); assert.equal((member as any).secret,undefined);
});
test('mobile users filter and recency apply before pagination, independent of membership', () => {
  const users = Array.from({length:100},(_,i) => ({ id:`u${i}`, firstName:`Person ${i}`, createdAt:i, privateMetadata:i%2 ? {mobileActivity:{ios:{...input,firstSeenAt:'2026-10-01T00:00:00Z',lastSeenAt:new Date(Date.UTC(2026,9,8,0,i)).toISOString()}}} : {} }));
  const first = directoryPage(users,new URLSearchParams('app=mobile&sort=mobile_activity'));
  assert.equal(first.total,50); assert.equal(first.members.length,40); assert.equal(first.members[0].id,'u99'); assert.equal(first.nextOffset,40);
  assert.equal(directoryPage(users,new URLSearchParams('app=mobile&sort=mobile_activity&offset=40')).members.length,10);
  assert.equal(directoryPage(users,new URLSearchParams('app=mobile&filter=free&q=Person%2099')).total,1);
  assert.throws(() => directoryPage(users,new URLSearchParams('app=secret')));
});

test('durable activity stays bounded, preserves first/latest use and scopes account reads', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE account_deletion_requests(user_id text PRIMARY KEY);" + readFileSync('src/lib/mobile-activity-schema.sql','utf8'));
    const repository = new MobileActivityRepository({query:async(text,params=[])=>({rows:(await db.query(text,params)).rows as Record<string,unknown>[]})});
    const record = {...input,platform:'ios' as const,firstSeenAt:'2026-10-08T15:00:00Z',lastSeenAt:'2026-10-08T15:05:00Z'};
    await repository.save('member-a',record);
    await repository.save('member-b',{...record,platform:'android'});
    await repository.save('member-a',{...record,appVersion:'1.1.1',lastSeenAt:'2026-10-08T15:10:00Z'});
    await repository.save('member-a',{...record,appVersion:'1.0.0',firstSeenAt:'2026-10-08T14:00:00Z'});
    const saved = (await repository.read('member-a')).ios;
    assert.equal(saved.appVersion,'1.1.1');assert.equal(Date.parse(saved.firstSeenAt),Date.parse('2026-10-08T14:00:00Z'));assert.equal(Date.parse(saved.lastSeenAt),Date.parse('2026-10-08T15:10:00Z'));
    assert.deepEqual(Object.keys(await repository.readMany(['member-a'])),['member-a']);
    assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM member_mobile_activity')).rows[0].count,2);
    await db.query('INSERT INTO account_deletion_requests VALUES ($1)',['member-a']);
    await assert.rejects(repository.save('member-a',record));
    await db.query('DELETE FROM member_mobile_activity WHERE user_id=$1',['member-a']);
    await assert.rejects(repository.save('member-a',record));assert.deepEqual(await repository.read('member-a'),{});
  } finally { await db.close(); }
});

test('authenticated route saves full-metadata accounts without Clerk writes and fences deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE account_deletion_requests(user_id text PRIMARY KEY);" + readFileSync('src/lib/mobile-activity-schema.sql','utf8'));
    const sql = {query:async(text:string,params:unknown[]=[])=>({rows:(await db.query(text,params)).rows as Record<string,unknown>[]})};
    let userId: string|null = 'full-owner', busy=false, lost=false, exists=true, checks=0, metadataWrites=0;
    const metadata = {olderAccountData:'x'.repeat(8078)};
    const route = moduleFrom('src/app/api/v1/me/mobile-activity/route.ts',{
      '@clerk/nextjs/server':{auth:async()=>({userId}),clerkClient:async()=>({users:{getUser:async()=>{if(!exists)throw Error('identity deleted');return {privateMetadata:metadata};},updateUserMetadata:async()=>{metadataWrites++;throw Error('metadata exceeds 8 KB');}}})},
      '@/lib/mobile-activity':{createMobileActivityHandler},
      '@/lib/mobile-activity-repository':{MobileActivityRepository:class extends MobileActivityRepository {constructor(){super(sql);}}},
      '@/lib/alert-queue/member-lease':{withMemberAlertLease:async(id:string,operation:(assertHeld:()=>Promise<void>)=>Promise<Response>,options:{requireDurable:boolean})=>{assert.equal(id,userId);assert.equal(options.requireDurable,true);if(busy)return {acquired:false};return {acquired:true,result:await operation(async()=>{checks++;if(lost)throw Error('lease lost');})};}},
    });
    assert.equal((await route.POST(req())).status,200);assert.equal(metadataWrites,0);assert.ok(checks>=2);
    const rows=await new MobileActivityRepository(sql).readMany(['full-owner']);
    assert.equal(directoryPage([{id:'full-owner',privateMetadata:metadata}],new URLSearchParams('app=mobile'),new Date(),rows).total,1);
    userId=null;assert.equal((await route.POST(req())).status,401);
    userId='other';busy=true;assert.equal((await route.POST(req())).status,503);
    busy=false;lost=true;assert.equal((await route.POST(req())).status,503);assert.deepEqual(await new MobileActivityRepository(sql).read('other'),{});
    lost=false;exists=false;assert.equal((await route.POST(req())).status,503);
    assert.equal(metadata.olderAccountData.length,8078);assert.equal(metadataWrites,0);
  } finally { await db.close(); }
});

test('legacy first activity is retained alongside the newer database summary', () => {
  const legacy={...input,platform:'ios' as const,firstSeenAt:'2026-10-01T12:00:00Z',lastSeenAt:'2026-10-07T12:00:00Z'};
  const row=adminMember({id:'member',privateMetadata:{mobileActivity:{ios:legacy}}},new Date(),[{...legacy,appVersion:'1.1.1',firstSeenAt:'2026-10-08T12:00:00Z',lastSeenAt:'2026-10-08T12:00:00Z'}]);
  assert.equal(row.mobileActivity[0].firstSeenAt,legacy.firstSeenAt);assert.equal(row.mobileActivity[0].appVersion,'1.1.1');
});

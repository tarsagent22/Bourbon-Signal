import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMobileActivityHandler, mobileActivityRecords, type MobileActivityRecord } from '../src/lib/mobile-activity';
import { adminMember, directoryPage } from '../src/lib/admin-member-directory';
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

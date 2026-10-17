import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWithMocks } from '../astra-test-harness';

function setup(stored = new Map<string,string>(), device = { isDevice: true, platform: 'ios' }) {
  let permission = 'granted'; let prompts = 0; let writes = 0; let reads = 0;
  let status: any = { enabled: false, currentDeviceRegistered: false };
  let reply: any = { enabled: true, currentDeviceRegistered: true };
  let failure: Error | null = null;
  const push = loadWithMocks('src/push/push-registration.ts', {
    'expo-constants': { expoConfig: { extra: { eas: { projectId: 'fixture' } } } },
    'expo-crypto': { randomUUID: () => 'fixture-device' }, 'expo-device': { isDevice: device.isDevice },
    'react-native': { Platform: { OS: device.platform } },
    'expo-notifications': { AndroidImportance: { HIGH: 4 }, setNotificationChannelAsync: async () => {}, getPermissionsAsync: async () => ({ status: permission }), requestPermissionsAsync: async () => { prompts++; return { status: permission }; }, getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[fixture-token]' }), addPushTokenListener: () => ({ remove() {} }), dismissAllNotificationsAsync: async () => {} },
    'expo-secure-store': { getItemAsync: async (k: string) => stored.get(k) ?? null, setItemAsync: async (k: string,v: string) => { stored.set(k,v); }, deleteItemAsync: async (k: string) => { stored.delete(k); } },
  });
  const api: any = { pushAccountId: 'user_A', accountIdentity: 'user_A:session_1', getPushDeviceStatus: async () => { reads++; return status; }, registerPushDevice: async () => { writes++; if(failure)throw failure; status = reply; return status; }, disablePushDevice: async () => (status = { enabled: false, currentDeviceRegistered: false }), clearReadCache() {} };
  return { push, api, stored, setFailure:(v:Error|null)=>failure=v, setStatus: (v: any) => status=v, setReply: (v: any) => reply=v, setPermission: (v: string) => permission=v, counts: () => ({ prompts,writes,reads }) };
}

test('automatic recovery backs off after provider failure; an explicit Retry can try immediately',async()=>{
  const f=setup(new Map([['bourbon-signal.push-enabled.user_A','1']]));
  f.setFailure(new Error('Provider temporarily rate limited'));
  await assert.rejects(()=>f.push.refreshRadarPushIfEnabled(f.api),/rate limited/);
  await f.push.refreshRadarPushIfEnabled(f.api);
  assert.equal(f.counts().writes,1);
  f.setFailure(null);
  await f.push.enableRadarPush(f.api);
  assert.equal(f.counts().writes,2);
});

test('Android emulator can register a provider token and recover without prompting', async () => {
  const f=setup(new Map(),{isDevice:false,platform:'android'});
  assert.equal((await f.push.enableRadarPush(f.api)).currentDeviceRegistered,true);
  assert.equal(f.counts().writes,1);
  assert.equal(f.counts().prompts,0);
  assert.equal((await f.push.refreshRadarPushIfEnabled(f.api)).enabled,true);
  assert.equal(f.counts().writes,1);
});

test('Android emulator registration still respects denied permission and provider failures', async () => {
  const denied=setup(new Map(),{isDevice:false,platform:'android'});
  denied.setPermission('denied');
  await assert.rejects(()=>denied.push.enableRadarPush(denied.api),/permission was not granted/);
  assert.equal(denied.counts().writes,0);
  const failed=setup(new Map(),{isDevice:false,platform:'android'});
  failed.setFailure(new Error('Provider unavailable'));
  await assert.rejects(()=>failed.push.enableRadarPush(failed.api),/Provider unavailable/);
});

test('unsupported iOS simulator keeps its existing physical-device requirement', async () => {
  const f=setup(new Map(),{isDevice:false,platform:'ios'});
  await assert.rejects(()=>f.push.enableRadarPush(f.api),/physical device/);
  assert.equal(f.counts().writes,0);
});

test('push opt-in survives deferred sync and restart; healthy reopen does not register again', async () => {
  const first = setup();
  first.setReply({ enabled: false, currentDeviceRegistered: true, warning: { code: 'PUSH_PREFERENCE_WRITE_FAILED' } });
  await first.push.enableRadarPush(first.api);
  assert.equal(first.stored.get('bourbon-signal.push-enabled.user_A'),'1');
  const reopened = setup(first.stored);
  reopened.setStatus({ enabled: false, currentDeviceRegistered: true });
  assert.equal((await reopened.push.refreshRadarPushIfEnabled(reopened.api)).enabled,true);
  assert.equal(reopened.counts().writes,1);
  const again = setup(first.stored); again.setStatus({ enabled: true, currentDeviceRegistered: true });
  await again.push.refreshRadarPushIfEnabled(again.api);
  assert.equal(again.counts().writes,0);
  assert.equal(again.counts().prompts,0);
});

test('transient failures and blocked permission retain opt-in without prompting', async () => {
  const t=setup(); await t.push.enableRadarPush(t.api);
  t.api.getPushDeviceStatus=async () => { throw new Error('offline'); };
  await assert.rejects(t.push.refreshRadarPushIfEnabled(t.api));
  assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'1');
  t.api.getPushDeviceStatus=async () => ({ enabled:true,currentDeviceRegistered:true }); t.setPermission('denied');
  await t.push.refreshRadarPushIfEnabled(t.api);
  assert.equal(t.counts().prompts,0); assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'1');
});

test('concurrent recovery coalesces and explicit off survives reopen', async () => {
  const t=setup(); t.setStatus({enabled:false,currentDeviceRegistered:true});
  await Promise.all([t.push.refreshRadarPushIfEnabled(t.api),t.push.refreshRadarPushIfEnabled(t.api)]);
  assert.equal(t.counts().writes,1);
  await t.push.disableRadarPush(t.api);
  const reopened=setup(t.stored); await reopened.push.refreshRadarPushIfEnabled(reopened.api);
  assert.equal(reopened.counts().writes,0); assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'0');
});

test('logout disconnects delivery, keeps scoped opt-in, and restores it only in a new authenticated session', async () => {
  const t=setup(); await t.push.enableRadarPush(t.api);
  const other=setup(t.stored); other.api.pushAccountId='user_B';
  await other.push.refreshRadarPushIfEnabled(other.api); assert.equal(other.counts().writes,0);
  await t.push.signOutWithRadarPushDisabled(t.api,async () => {});
  assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'1');
  assert.equal(t.stored.get('bourbon-signal.push-enabled'),'0');
  assert.equal(await t.push.refreshRadarPushIfEnabled(t.api),null);
  assert.equal(t.push.beginRadarPushSession(t.api),false,'the signed-out API cannot restart delivery');
  const next={...t.api,accountIdentity:'user_A:session_2'};
  assert.equal(t.push.beginRadarPushSession(next),true);
  assert.equal((await t.push.refreshRadarPushIfEnabled(next)).enabled,true);
  assert.equal(t.counts().writes,2);
  assert.equal(t.counts().prompts,0,'same-account recovery never asks for OS permission');
});

test('a manual Off remains off after logout and same-account login',async()=>{
  const t=setup(); await t.push.enableRadarPush(t.api); await t.push.disableRadarPush(t.api);
  await t.push.signOutWithRadarPushDisabled(t.api,async()=>{});
  const next={...t.api,accountIdentity:'user_A:session_2'}; t.push.beginRadarPushSession(next);
  await t.push.refreshRadarPushIfEnabled(next);
  assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'0');
  assert.equal(t.counts().writes,1);
});

test('authenticated maintenance resumes the saved choice after login and recovers on foreground',async()=>{
  const t=setup(); await t.push.enableRadarPush(t.api); await t.push.signOutWithRadarPushDisabled(t.api,async()=>{});
  const next={...t.api,accountIdentity:'user_A:session_2'};
  let cleanup:(()=>void)|undefined; let foreground!:(state:string)=>void;
  const {PushMaintenance}=loadWithMocks('src/push/PushResponseHandler.tsx',{
    react:{useEffect:(effect:()=>()=>void)=>{cleanup=effect();}},
    '@clerk/expo':{},'expo-notifications':{},'expo-router':{},
    'react-native':{AppState:{addEventListener:(_event:string,listener:typeof foreground)=>{foreground=listener;return {remove(){}};}}},
    '../hooks/useMobileApi':{useMobileApi:()=>next},'./push-registration':t.push,
  });
  try {
    PushMaintenance(); await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(t.counts().writes,2,'the authenticated mount starts a new push session before recovery');
    t.setStatus({enabled:false,currentDeviceRegistered:false}); foreground('active');
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(t.counts().writes,3); assert.equal(t.counts().prompts,0);
  } finally {cleanup?.();}
});

test('switching accounts in one app session never transfers push consent',async()=>{
  const t=setup(); t.push.beginRadarPushSession(t.api); await t.push.enableRadarPush(t.api);
  await t.push.signOutWithRadarPushDisabled(t.api,async()=>{});
  let writes=0;
  const other={...t.api,pushAccountId:'user_B',accountIdentity:'user_B:session_1',getPushDeviceStatus:async()=>({enabled:false,currentDeviceRegistered:false}),registerPushDevice:async()=>{writes++;return {enabled:true,currentDeviceRegistered:true};}};
  t.push.beginRadarPushSession(other); await t.push.refreshRadarPushIfEnabled(other);
  assert.equal(writes,0); assert.equal(t.stored.has('bourbon-signal.push-enabled.user_B'),false);
  assert.equal(await t.push.refreshRadarPushIfEnabled(t.api),null);
  const next={...t.api,accountIdentity:'user_A:session_2'}; t.push.beginRadarPushSession(next);
  assert.equal((await t.push.refreshRadarPushIfEnabled(next)).enabled,true);
});

test('a module reload with retained secure storage recovers a missing binding without resetting consent',async()=>{
  const first=setup(); await first.push.enableRadarPush(first.api);
  const reloaded=setup(first.stored); reloaded.push.beginRadarPushSession(reloaded.api);
  assert.equal((await reloaded.push.refreshRadarPushIfEnabled(reloaded.api)).enabled,true);
  assert.equal(reloaded.stored.get('bourbon-signal.push-enabled.user_A'),'1');
  assert.equal(reloaded.counts().writes,1); assert.equal(reloaded.counts().prompts,0);
});

test('late registration from a signed-out session is revoked without replacing a newer account capability',async ctx=>{
  const t=setup(); t.push.beginRadarPushSession(t.api);
  const revoked:string[]=[]; let binding:string|null=null; let registrations=0;
  ctx.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{revoked.push(JSON.parse(String(options.body)).revocationToken);if(binding==='A')binding=null;return Response.json({ok:true,revoked:true});});
  let release!:(value:unknown)=>void; let entered!:()=>void;
  const started=new Promise<void>(resolve=>entered=resolve);
  t.api.registerPushDevice=async()=>{entered();return new Promise(resolve=>release=resolve);};
  const enabling=t.push.enableRadarPush(t.api); const observed=assert.rejects(enabling,/could not be enabled/);
  await started;
  const result=await t.push.signOutWithRadarPushDisabled(t.api,async()=>{},10);
  assert.equal(result.pushDisabled,false);
  const other={...t.api,pushAccountId:'user_B',accountIdentity:'user_B:session_2',getPushDeviceStatus:async()=>({enabled:binding==='B',currentDeviceRegistered:binding==='B'}),registerPushDevice:async()=>{binding='B';registrations++;return {enabled:true,currentDeviceRegistered:true,revocationToken:'new-B'};}};
  t.push.beginRadarPushSession(other); await t.push.enableRadarPush(other);
  binding='A';
  release({enabled:true,currentDeviceRegistered:true,revocationToken:'late-A'}); await observed;
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(revoked,['late-A']);
  assert.equal(binding,'B'); assert.equal(registrations,2,'the active account recovers after the late server response displaced its device');
  assert.equal(t.stored.get('bourbon-signal.push-revocation-token'),'new-B');
  assert.equal(t.stored.get('bourbon-signal.push-enabled.user_B'),'1');
});

test('offline logout retains revocation and consent, then authenticated recovery disconnects the old binding first',async ctx=>{
  const t=setup(); await t.push.enableRadarPush(t.api);
  t.stored.set('bourbon-signal.push-revocation-token','old-A');
  t.api.disablePushDevice=async()=>{throw Error('offline');};
  const result=await t.push.signOutWithRadarPushDisabled(t.api,async()=>{},15,{fetcher:async()=>{throw Error('offline');}});
  assert.equal(result.pushDisabled,false); assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'1');
  assert.ok(t.stored.has('bourbon-signal.pending-push-revocation'));
  const events:string[]=[];
  ctx.mock.method(globalThis,'fetch',async()=>{events.push('revoke');return Response.json({ok:true,revoked:true});});
  const next={...t.api,accountIdentity:'user_A:session_2',getPushDeviceStatus:async()=>({enabled:true,currentDeviceRegistered:true}),registerPushDevice:async()=>{events.push('register');return {enabled:true,currentDeviceRegistered:true,revocationToken:'new-A'};}};
  t.push.beginRadarPushSession(next);
  await t.push.refreshRadarPushIfEnabled(next);
  assert.deepEqual(events,['revoke','register'],'a pending revoke bypasses the otherwise healthy cached token');
  assert.equal(t.stored.get('bourbon-signal.push-revocation-token'),'new-A');
});

test('flushing multiple pending revocations retains failures and never clears a newer live capability',async()=>{
  const t=setup();
  t.stored.set('bourbon-signal.pending-push-revocation',JSON.stringify([{deviceId:'device',revocationToken:'old-A'},{deviceId:'device',revocationToken:'old-B'}]));
  t.stored.set('bourbon-signal.push-revocation-token','current-C');
  assert.equal(await t.push.flushPendingPushRevocation(async(_url:unknown,options:RequestInit)=>JSON.parse(String(options.body)).revocationToken==='old-A'?Response.json({ok:false},{status:503}):Response.json({ok:true})),false);
  assert.deepEqual(JSON.parse(t.stored.get('bourbon-signal.pending-push-revocation')!),{deviceId:'device',revocationToken:'old-A'});
  assert.equal(t.stored.get('bourbon-signal.push-revocation-token'),'current-C');
  assert.equal(await t.push.flushPendingPushRevocation(async()=>Response.json({ok:true})),true);
  assert.equal(t.stored.has('bourbon-signal.pending-push-revocation'),false);
});

test('two signed-out sessions retain both pending capabilities when an older registration finishes offline',async ctx=>{
  const t=setup(); t.push.beginRadarPushSession(t.api);
  let online=false; const revoked:string[]=[];
  ctx.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{
    if(!online)throw Error('offline');
    revoked.push(JSON.parse(String(options.body)).revocationToken);return Response.json({ok:true});
  });
  let release!:(value:unknown)=>void; let entered!:()=>void;
  const started=new Promise<void>(resolve=>entered=resolve);
  t.api.registerPushDevice=async()=>{entered();return new Promise(resolve=>release=resolve);};
  const enabling=t.push.enableRadarPush(t.api); const observed=assert.rejects(enabling,/could not be enabled/);
  await started; await t.push.signOutWithRadarPushDisabled(t.api,async()=>{},10);
  const other={...t.api,pushAccountId:'user_B',accountIdentity:'user_B:session_1',registerPushDevice:async()=>({enabled:true,currentDeviceRegistered:true,revocationToken:'pending-B'})};
  t.push.beginRadarPushSession(other); await t.push.enableRadarPush(other);
  assert.equal((await t.push.signOutWithRadarPushDisabled(other,async()=>{})).pushDisabled,false);
  release({enabled:true,currentDeviceRegistered:true,revocationToken:'pending-A'}); await observed;
  assert.deepEqual(JSON.parse(t.stored.get('bourbon-signal.pending-push-revocation')!).map((item:any)=>item.revocationToken),['pending-B','pending-A']);
  online=true; assert.equal(await t.push.flushPendingPushRevocation(),true);
  assert.deepEqual(revoked,['pending-B','pending-A']);
});

test('turning off during registration wins and cannot be undone by queued recovery', async () => {
  const t=setup();
  let release!: () => void; let started!: () => void;
  const entered=new Promise<void>(resolve => started=resolve);
  t.api.registerPushDevice=async () => { started(); await new Promise<void>(resolve => release=resolve); return {enabled:true,currentDeviceRegistered:true}; };
  const enabling=t.push.enableRadarPush(t.api);
  await entered;
  const disabling=t.push.disableRadarPush(t.api);
  release(); await Promise.all([enabling,disabling]);
  assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'0');
  const reopened=setup(t.stored); await reopened.push.refreshRadarPushIfEnabled(reopened.api);
  assert.equal(reopened.counts().writes,0);
});

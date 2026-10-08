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
  const api: any = { pushAccountId: 'user_A', getPushDeviceStatus: async () => { reads++; return status; }, registerPushDevice: async () => { writes++; if(failure)throw failure; status = reply; return status; }, disablePushDevice: async () => (status = { enabled: false, currentDeviceRegistered: false }), clearReadCache() {} };
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

test('another account cannot inherit local opt-in; logout clears the account intent', async () => {
  const t=setup(); await t.push.enableRadarPush(t.api);
  const other=setup(t.stored); other.api.pushAccountId='user_B';
  await other.push.refreshRadarPushIfEnabled(other.api); assert.equal(other.counts().writes,0);
  await t.push.signOutWithRadarPushDisabled(t.api,async () => {});
  assert.equal(t.stored.get('bourbon-signal.push-enabled.user_A'),'0');
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

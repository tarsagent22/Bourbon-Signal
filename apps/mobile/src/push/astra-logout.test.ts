import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWithMocks } from '../astra-test-harness';
import { createMobileApi } from '../api/client';
import { createPendingPushNavigation } from './push-navigation';

// A payload accepted before logout cannot be recalled from an OS/provider queue.
// Execute the server builder and the actual logout/navigation/API paths offline.
test('MM-02 queued A notification after offline logout waits for authentication and fetches only B Radar', async () => {
  const { buildExpoPushMessages, sendExpoPushMessages } = loadWithMocks('../../src/lib/push-devices.ts', {});
  const messages = buildExpoPushMessages(['ExpoPushToken[fixture-token-12345]'], { id: 'A-private-id', bottleName: 'A-private-bottle', storeLabel: 'A-private-store', matchedArea: 'A-private-area' });
  let queued: any;
  await sendExpoPushMessages(messages, async (_input: unknown, init: RequestInit) => { queued = JSON.parse(String(init.body))[0]; return Response.json({ data: [{ status: 'ok' }] }); });
  const { push, events } = setup();
  const result = await push.signOutWithRadarPushDisabled({ disablePushDevice: async () => { throw new Error('offline'); }, clearReadCache() {} }, async () => { events.push('signed-out'); });
  assert.equal(result.pushDisabled, false); assert.ok(events.includes('signed-out'));
  assert.deepEqual(queued, { to: 'ExpoPushToken[fixture-token-12345]', title: 'Bourbon Signal', body: 'Open Radar to check your latest matches.', data: { screen: 'radar' }, sound: 'default', priority: 'high' });
  const navigation = createPendingPushNavigation();
  navigation.receive('queued-A-os-request', queued.data);
  assert.equal(navigation.take(false, true), null, 'locked UI must not fetch or show A details');
  assert.equal(navigation.take(true, false), null);
  // B does not register for push. The already-queued tap opens B's authenticated Radar.
  const route = navigation.take(true, true);
  assert.deepEqual(route, { pathname: '/(app)/(tabs)/radar', params: { section: 'matches', request: 'queued-A-os-request' } });
  let reads = 0;
  const apiB = createMobileApi({ baseUrl: 'https://offline.invalid', getToken: async () => 'fixture-B', fetcher: async input => {
    const request = new Request(input); reads++;
    assert.equal(request.headers.get('authorization'), 'Bearer fixture-B');
    assert.equal(new URL(request.url).pathname, '/api/alerts');
    assert.equal(new URL(request.url).search, '');
    return Response.json({ alerts: [], unreadCount: 0 });
  } });
  assert.deepEqual(await apiB.getMemberAlerts({ fresh: true }), { alerts: [], unreadCount: 0 });
  assert.equal(reads, 1); assert.equal(navigation.take(true, true), null);
});
function setup() {
  const events: string[] = []; const stored = new Map([['bourbon-signal.push-device-id','installation-A'],['bourbon-signal.push-enabled','1']]);
  const push = loadWithMocks('src/push/push-registration.ts', {
    'expo-constants': {}, 'expo-crypto': {}, 'expo-device': { isDevice: true }, 'react-native': { Platform: { OS: 'ios' } },
    'expo-notifications': { setNotificationHandler() {}, dismissAllNotificationsAsync: async () => { events.push('dismiss'); } },
    'expo-secure-store': { getItemAsync: async (k: string) => stored.get(k), setItemAsync: async (k: string,v: string) => { stored.set(k,v); }, deleteItemAsync: async (k: string) => { stored.delete(k); } },
  });
  return { push, events, stored };
}
test('M02 mitigation: online logout disables only current installation before Clerk signout', async () => {
  const { push, events, stored } = setup(); assert.equal(typeof push.signOutWithRadarPushDisabled, 'function');
  const result = await push.signOutWithRadarPushDisabled({ disablePushDevice: async (id: string) => { events.push(`disable:${id}`); return { enabled: false }; }, getPushDeviceStatus: async () => ({ enabled: false, currentDeviceRegistered: false }), clearReadCache: () => events.push('clear') }, async () => { events.push('signOut'); });
  assert.equal(result.pushDisabled, true); assert.ok(events.indexOf('disable:installation-A') < events.indexOf('signOut'));
  assert.notEqual(stored.get('bourbon-signal.push-enabled'), '1'); assert.ok(events.includes('clear'));
});
test('M02 mitigation: failed or hanging revocation does not trap logout or claim success', async () => {
  for (const hanging of [false, true]) {
    const { push, events, stored } = setup(); assert.equal(typeof push.signOutWithRadarPushDisabled, 'function');
    const result = await push.signOutWithRadarPushDisabled({ disablePushDevice: async () => { if (hanging) return new Promise(() => {}); throw new Error('offline'); }, clearReadCache() {} }, async () => { events.push('signOut'); }, 15);
    assert.equal(result.pushDisabled, false); assert.ok(events.includes('signOut')); assert.notEqual(stored.get('bourbon-signal.push-enabled'), '1');
  }
});

test('M02 mitigation: reads back revocation while authenticated, leaves another device enabled', async () => {
  const { push, events } = setup(); const enabled = new Set(['installation-A','installation-other']); let signedOut = false;
  const api = createMobileApi({ baseUrl: 'https://logout.invalid', getToken: async () => signedOut ? null : 'A', fetcher: async input => {
    const request = new Request(input); assert.equal(request.headers.get('authorization'), 'Bearer A');
    const url = new URL(request.url);
    let deviceId = url.searchParams.get('deviceId');
    if (request.method === 'POST') { const body = await request.json(); assert.equal(body.action, 'disable'); deviceId = body.deviceId; enabled.delete(body.deviceId); events.push('write'); }
    else events.push('readback');
    return Response.json({ supported: true, enabled: enabled.has(deviceId!), registeredDeviceCount: enabled.size, currentDeviceRegistered: enabled.has(deviceId!) });
  } });
  const result = await push.signOutWithRadarPushDisabled(api, async () => { signedOut = true; events.push('signedOut'); });
  assert.equal(result.pushDisabled,true); assert.deepEqual([...enabled], ['installation-other']);
  assert.ok(events.indexOf('readback') > events.indexOf('write')); assert.ok(events.indexOf('signedOut') > events.indexOf('readback'));
});

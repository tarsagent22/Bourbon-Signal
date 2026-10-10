// MM-01/02/03: durable versions of the independent review's real-route/TSX probes.
// Only external/native boundaries are injected. No credentials, services or device sends.
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const req = createRequire(root + '/package.json');
req('tsx/cjs');
const { build } = req('esbuild');
global.fetch = async () => { throw new Error('OFFLINE: external fetch prohibited'); };
async function load(entry, f = {}, stubs = {}) {
  const out = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', plugins: [{ name: 'offline-only', setup(b) {
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js', resolveDir: root }));
  } }] });
  const m = { exports: {} }; new Function('require', 'module', 'exports', 'f', out.outputFiles[0].text)(req, m, m.exports, f); return m.exports;
}
const common = {
  '@/lib/member-numbers': 'import {ensureMemberNumber as ensure} from '+JSON.stringify(path.join(root,'src/lib/member-numbers.ts').replaceAll('\\','/'))+';export const ensureMemberNumber=(client,user)=>ensure(client,user,{get:async()=>123,reconcile:async()=>{throw new Error("unexpected signup allocation");}});',
  '@clerk/nextjs/server': 'export const auth=async()=>({userId:"fixture-A"});export const clerkClient=async()=>({users:f.users});',
  '@/lib/server-entitlements': 'export const getServerEntitlements=async()=>f.entitlements;export const resolveServerEffectiveMembershipTier=async()=>"standard";',
  'next/server': 'export const NextRequest=Request;export const NextResponse=Response;',
};
function fixture(extra = {}) {
  const f = { metadata: { memberNumber: 123, communityDisplayName: 'Before', bottleAlertPreferences: { bottleNames: ['Original'], bottleKeys: ['original'], version: 0 }, ...extra }, entitlements: req(root + '/src/lib/entitlements.ts').getEntitlements('standard'), writes: [] };
  f.users = {
    getUser: async () => ({ id: 'fixture-A', publicMetadata: structuredClone(f.metadata), privateMetadata: { stripeSubscriptionId: 'sub_fixture' } }),
    updateUserMetadata: async (_id, p) => { f.writes.push(p); if (p.publicMetadata) f.metadata = { ...f.metadata, ...structuredClone(p.publicMetadata) }; },
  };
  return f;
}
async function watchApi(f) {
  const preferences = await load('src/app/api/user/preferences/route.ts', f, { ...common,
    '@/lib/bottle-mutes-repository': 'export const readBottleMutes=async()=>({bottles:[],version:0});export const saveBottleMutes=async()=>{};',
    '@/lib/member-collection-repository': 'export const getMemberCollectionRepository=()=>({getForUser:async()=>({bottles:[],version:0})});export class MemberCollectionConflictError extends Error{};export class MemberCollectionLimitError extends Error{};',
    '@/lib/preview-qa': 'export const isQaPreviewRequest=()=>false;export const getQaPreviewTierFromRequest=()=>"standard";export const QA_PREVIEW_PREFERENCES={};',
    '@/lib/alert-queue/member-lease': 'export const withMemberAlertLease=async(id,op)=>({acquired:true,result:await op(async()=>{})});',
  });
  return req(root + '/apps/mobile/src/api/client.ts').createMobileApi({ baseUrl: 'https://offline.invalid', getToken: async () => null, fetcher: request => request.method === 'POST' ? preferences.POST(request) : preferences.GET(request) });
}
function assertWatchSurvived(f) {
  assert.equal(f.metadata.bottleAlertPreferences.version, 1, 'unrelated writer must not roll back the revision');
  assert.ok(f.metadata.bottleAlertPreferences.bottleNames.includes('Concurrent addition'), 'acknowledged watch delta must survive');
  for (const p of f.writes.filter(p => p.publicMetadata && !('bottleAlertPreferences' in p.publicMetadata && Object.keys(p.publicMetadata).length === 1))) {
    // Other preference keys may be patched by preferences; inspect specific owned writes below.
    if ('communityDisplayName' in p.publicMetadata || 'stripeCustomerId' in p.publicMetadata || 'membershipUpdatedAt' in p.publicMetadata) assert.equal('bottleAlertPreferences' in p.publicMetadata, false);
  }
}
test('MM-01 real profile PATCH interleaved with real preferences POST preserves watch revision and positive wire contract', async () => {
  const f = fixture(); const api = await watchApi(f);
  const profile = await load('src/app/api/v1/me/profile/route.ts', f, { ...common, '@/lib/community-sightings-repository': 'export const createCommunitySightingsRepository=()=>({updateReporterDisplayName:async()=>f.duringProfile()});' });
  const { validApiResponse } = req(root + '/apps/mobile/src/api/response-validation.ts');
  assert.equal(validApiResponse('/api/v1/me/profile', await (await profile.GET()).json()), true);
  f.duringProfile = async () => { await api.updateMemberPreferences({ watchlistMutation: { bottleName: 'Concurrent addition', watched: true } }); assert.equal(f.metadata.bottleAlertPreferences.version, 1); };
  const response = await profile.PATCH(new Request('https://offline.invalid', { method: 'PATCH', body: JSON.stringify({ displayName: 'OakHunter' }), headers: { 'Content-Type': 'application/json' } }));
  assert.equal(response.status, 200); assert.equal(validApiResponse('/api/v1/me/profile', await response.json()), true);
  assert.equal(f.metadata.communityDisplayName, 'OakHunter'); assertWatchSurvived(f);
});
test('MM-01 billing portal recovery patches only its public customer key across a real watch delta', async () => {
  const f = fixture(); const api = await watchApi(f);
  f.recover = async () => { await api.updateMemberPreferences({ watchlistMutation: { bottleName: 'Concurrent addition', watched: true } }); return { data: [{ status: 'complete', payment_status: 'paid', metadata: { userId: 'fixture-A' }, customer: 'cus_fixture', subscription: 'sub_fixture' }] }; };
  const get = f.users.getUser; f.users.getUser = async () => ({ ...await get(), emailAddresses: [{ emailAddress: 'fixture@example.invalid' }] });
  // Inject a fixture-only env object into the real route without reading process secrets.
  // getStripeClient only needs presence; stub module is the only possible provider boundary.
  const source = require('node:fs').readFileSync(path.join(root, 'src/app/api/billing-portal/route.ts'), 'utf8');
  const ts = req('typescript'); const m = { exports: {} };
  const mocks = { 'next/server': { NextResponse: Response }, '@clerk/nextjs/server': { auth: async () => ({ userId: 'fixture-A' }), clerkClient: async () => ({ users: f.users }) }, stripe: class { checkout = { sessions: { list: () => f.recover() } }; billingPortal = { sessions: { create: async () => ({ url: 'https://offline.invalid/portal' }) } }; } };
  new Function('require', 'module', 'exports', 'process', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(id => mocks[id], m, m.exports, { env: { STRIPE_SECRET_KEY: 'offline-fixture' } });
  const request = new Request('https://offline.invalid'); request.nextUrl = new URL(request.url);
  assert.equal((await m.exports.POST(request)).status, 200); assert.equal(f.metadata.stripeCustomerId, 'cus_fixture'); assertWatchSurvived(f);
});
test('MM-01 membership full-snapshot branches preserve concurrent watch changes', async () => {
  for (const branch of ['activate-gift-overlay', 'suspend-gift', 'suspend-standard', 'downgrade-gift']) {
    const f = fixture({ tier: 'standard', plan: branch === 'suspend-standard' ? 'standard_monthly' : 'gift_standard_annual', giftOrderId: 'gift_fixture', giftAccessExpiresAt: '2099-01-01T00:00:00Z', giftPreviousMembership: { tier: 'standard', plan: 'standard_monthly', status: 'active' } });
    const api = await watchApi(f); const update = f.users.updateUserMetadata; let interleaved = false;
    f.users.updateUserMetadata = async (id, p) => { if (p.publicMetadata && ('membershipUpdatedAt' in p.publicMetadata) && !interleaved) { interleaved = true; await api.updateMemberPreferences({ watchlistMutation: { bottleName: 'Concurrent addition', watched: true } }); } return update(id, p); };
    const membership = await load('src/lib/membership-server.ts', f, { ...common,
      '@/lib/gift-repository': 'export const createGiftRepository=()=>{throw new Error("unexpected gift storage");};',
      '@/lib/founder-reservations': 'export const reconcileAllFounderReservationAuthority=async()=>{throw new Error("unexpected founder action");};',
    });
    if (branch === 'activate-gift-overlay') await membership.activateMembership('fixture-A', { tier: 'standard', plan: 'standard_monthly', stripeSubscriptionId: 'sub_fixture' });
    else if (branch.startsWith('suspend')) await membership.suspendMembershipForSubscription('cus_fixture', 'sub_fixture', 'past_due', 'fixture-A');
    else await membership.downgradeMembershipForSubscription('cus_fixture', 'sub_fixture', 'fixture-A');
    assert.ok(interleaved, branch); assertWatchSurvived(f);
  }
});
test('MM-02 independent builder/provider probe: bottle previews retain only a user-bound routing token', async () => {
  const { buildExpoPushMessages, sendExpoPushMessages } = req(root + '/src/lib/push-devices.ts');
  const tokens = ['ExpoPushToken[fixture-token-12345]'];
  const a = buildExpoPushMessages(tokens, { id: 'alert_A_private', bottleName: 'Account A bottle', storeLabel: 'Account A store', matchedArea: 'Account A area' })[0];
  const b = buildExpoPushMessages(tokens, { id: 'alert_B_private', bottleName: 'Account B bottle', storeLabel: 'Account B store', matchedArea: 'Account B area' })[0];
  assert.notEqual(a.dedupeKey, b.dedupeKey, 'server-side identity still distinguishes alerts');
  const payloads = [];
  const fakeProvider = async (_input, init) => { payloads.push(JSON.parse(init.body)[0]); return Response.json({ data: [{ status: 'ok', id: `ticket-${payloads.length}` }] }); };
  await sendExpoPushMessages([a], fakeProvider); await sendExpoPushMessages([b], fakeProvider);
  // Caller-supplied title/body cannot override the bottle-derived preview.
  await sendExpoPushMessages([{ ...a, title: 'Legacy private bottle', body: 'Legacy private store', data: { screen: 'radar', alertId: 'Legacy-private-alert', userId: 'A' } }], fakeProvider);
  assert.deepEqual(payloads.map(payload => payload.data), [
    { screen: 'radar', alertId: 'alert_A_private' },
    { screen: 'radar', alertId: 'alert_B_private' },
    { screen: 'radar', alertId: 'Legacy-private-alert' },
  ]);
  assert.deepEqual(payloads.map(payload => payload.title), ['Account A bottle', 'Account B bottle', 'Account A bottle']);
  for (const payload of payloads) {
    assert.equal(payload.body, 'New Radar match. Open to view the report.');
    assert.doesNotMatch(JSON.stringify(payload), /Account [AB] store|Account [AB] area|Legacy private|userId|bottleNames/);
  }
  // Preserve the integrated outbox classifier: ambiguous tickets must never turn
  // into known rejection/retry, while explicit tickets retain their bookkeeping.
  for (const data of [undefined, [], [{}], [{ status: 'unexpected' }]]) await assert.rejects(sendExpoPushMessages([a], async () => Response.json({ data })), /acceptance unknown/);
  const accepted = await sendExpoPushMessages([a], async () => Response.json({ data: [{ status: 'ok', id: 'fixture-ticket' }] }));
  assert.deepEqual(accepted, { accepted: 1, rejected: 0, tickets: [{ id: 'fixture-ticket', token: tokens[0] }], invalidTokens: [] });
  const rejected = await sendExpoPushMessages([a], async () => Response.json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
  assert.deepEqual(rejected, { accepted: 0, rejected: 1, tickets: [], invalidTokens: tokens });
});
test('MM-03 account and dedicated profile isolate late reads and mutations across authenticated layouts', async () => {
  const { loadWithMocks } = req(root + '/apps/mobile/src/astra-test-harness.ts');
  const React = createRequire(root + '/apps/mobile/package.json')('react');
  let auth = { isLoaded: true, isSignedIn: true, userId: 'A', sessionId: 'session-A' };
  const native = { StyleSheet: { create: v => v }, View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', TextInput: 'TextInput' };
  const Stack = Object.assign(() => null, { Screen: 'Screen' });
  const layoutIdentity = { current: '' };
  const layout = loadWithMocks(root + '/apps/mobile/app/(app)/_layout.tsx', { react: { ...React, useRef: () => layoutIdentity }, '@clerk/expo': { useAuth: () => auth }, 'expo-router': { Stack, Redirect: 'Redirect' }, 'react-native': native, '../../src/activity/useMobileActivity': {useMobileActivity(){}}, '../../src/push/PushResponseHandler': {PushMaintenance(){return null;}} });
  let currentApi, refresh, instance, index, currentKey;
  const instances = new Map();
  const hooks = { ...React, useRef: v => instance.refs[index++] ||= { current: v }, useState: v => { const owner = instance, i = index++; if (!(i in owner.states)) owner.states[i] = v; return [owner.states[i], value => { if (owner.mounted) owner.states[i] = typeof value === 'function' ? value(owner.states[i]) : value; }]; }, useMemo: f => f(), useCallback: f => f, useEffect: () => {} };
  const mocks = { react: hooks, '@clerk/expo': { useAuth: () => ({ ...auth, signOut: async () => {} }) }, 'expo-constants': { default: {} }, 'expo-updates': {}, 'expo-router': { useRouter: () => ({}) }, 'react-native': native,
    '../../../src/hooks/useMobileApi': { useMobileApi: () => currentApi }, '../../../src/hooks/useScreenRevalidation': { useScreenRevalidation: f => { refresh = f; } }, '../../../src/hooks/useAccessibleStatus': { useAccessibleStatus() {} }, '../../../src/push/push-registration': {},
    '../../../src/rewards/RewardUI': { rewardStyles: {}, RewardEmblem: 'RewardEmblem' },
    '../../../src/components/MemberScreen': { memberScreenStyles: {}, MemberCard: 'MemberCard', SectionTitle: 'SectionTitle', DataRow: 'DataRow', ErrorState: 'ErrorState', LoadingState: 'LoadingState' },
  };
  const account = loadWithMocks(root + '/apps/mobile/app/(app)/(tabs)/hq.tsx', mocks);
  const editor = loadWithMocks(root + '/apps/mobile/app/(app)/account/profile.tsx', mocks);
  const profile = name => ({ displayName: name, customDisplayName: name, membership: { label: 'Standard' }, entitlements: {}, identity: { label: 'Member #123' } });
  const pending = []; const deferred = () => new Promise(resolve => pending.push(resolve));
  currentApi = { getAdminAccess: deferred, getMemberProfile: deferred, getSignalPoints: deferred, getAchievements: deferred, updateMemberProfile: deferred };
  function render(screen) {
    const key = layout.default().props.children[1].key;
    if (key !== currentKey) { for (const old of instances.values()) old.mounted=false; instances.clear(); currentKey=key; }
    if (!instances.has(screen)) instances.set(screen,{key,mounted:true,states:[],refs:[]});
    instance=instances.get(screen); index=0; return screen.default();
  }
  render(account); const aKey=currentKey; const oldLoad=refresh();
  render(editor); instance.states[1]=profile('A');
  function elements(node) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]; }
  const remove=elements(render(editor)).find(e=>e.type==='Pressable' && e.props.children?.props?.children==='Remove display name');
  assert.ok(remove,'dedicated editor exposes the real mutation callback'); remove.props.onPress();
  auth={...auth,userId:'B',sessionId:'session-B'}; render(account);
  assert.notEqual(currentKey,aKey,'account changes remount the full member layout');
  const before=JSON.stringify(instance.states);
  pending[0]({allowed:true}); pending[1]({profile:profile('Account A private display')}); pending[2]({balance:12345,catalog:[],redemptions:[]}); pending[3]({badges:[{label:'A private badge'}]}); pending[4]({profile:profile('Account A mutation')});
  await oldLoad; await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(instance.states),before,'late profile, points, achievements and edit results cannot update B');
  render(editor); assert.equal(instance.states[1],null,'B editor never inherits A profile');
  const bKey=currentKey;auth={...auth,sessionId:'session-B-new'};render(account);assert.notEqual(currentKey,bKey);
  const lastSignedInKey=currentKey;
  auth={...auth,isSignedIn:false,userId:null,sessionId:null};
  assert.equal(layout.default().props.children[1].type,Stack,'root protected routes own logout, nested navigator stays stable');
  assert.equal(layout.default().props.children[1].key,lastSignedInKey,'logout never resets the native stack while it is dismissing');
});

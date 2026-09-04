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
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  } }] });
  const m = { exports: {} }; new Function('require', 'module', 'exports', 'f', out.outputFiles[0].text)(req, m, m.exports, f); return m.exports;
}
const common = {
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
test('MM-02 independent real builder/provider-boundary probe: queued OS payload has no member content or alert identifier', async () => {
  const { buildExpoPushMessages, sendExpoPushMessages } = req(root + '/src/lib/push-devices.ts');
  const tokens = ['ExpoPushToken[fixture-token-12345]'];
  const a = buildExpoPushMessages(tokens, { id: 'Account A private alert', bottleName: 'Account A bottle', storeLabel: 'Account A store', matchedArea: 'Account A area' })[0];
  const b = buildExpoPushMessages(tokens, { id: 'Account B private alert', bottleName: 'Account B bottle', storeLabel: 'Account B store', matchedArea: 'Account B area' })[0];
  assert.notEqual(a.dedupeKey, b.dedupeKey, 'server-side identity still distinguishes alerts');
  const payloads = [];
  const fakeProvider = async (_input, init) => { payloads.push(JSON.parse(init.body)[0]); return Response.json({ data: [{ status: 'ok' }] }); };
  await sendExpoPushMessages([a], fakeProvider); await sendExpoPushMessages([b], fakeProvider);
  // Even an old server-side pending message is sanitized before new OS acceptance.
  await sendExpoPushMessages([{ ...a, title: 'Legacy private bottle', body: 'Legacy private store', data: { screen: 'radar', alertId: 'Legacy-private-alert', userId: 'A' } }], fakeProvider);
  for (const payload of payloads) assert.deepEqual(payload, { to: tokens[0], title: 'Bourbon Signal', body: 'Open Radar to check your latest matches.', data: { screen: 'radar' }, priority: 'high', sound: 'default' });
  // Preserve the integrated outbox classifier: ambiguous tickets must never turn
  // into known rejection/retry, while explicit tickets retain their bookkeeping.
  for (const data of [undefined, [], [{}], [{ status: 'unexpected' }]]) await assert.rejects(sendExpoPushMessages([a], async () => Response.json({ data })), /acceptance unknown/);
  const accepted = await sendExpoPushMessages([a], async () => Response.json({ data: [{ status: 'ok', id: 'fixture-ticket' }] }));
  assert.deepEqual(accepted, { accepted: 1, rejected: 0, tickets: [{ id: 'fixture-ticket', token: tokens[0] }], invalidTokens: [] });
  const rejected = await sendExpoPushMessages([a], async () => Response.json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
  assert.deepEqual(rejected, { accepted: 0, rejected: 1, tickets: [], invalidTokens: tokens });
});
test('MM-03 independent mounted Account probe through actual authenticated layout, including stale mutations', async () => {
  const { loadWithMocks } = req(root + '/apps/mobile/src/astra-test-harness.ts');
  const React = createRequire(root + '/apps/mobile/package.json')('react');
  let auth = { isLoaded: true, isSignedIn: true, userId: 'A', sessionId: 'session-A' };
  const native = { StyleSheet: { create: v => v }, View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', TextInput: 'TextInput' };
  const Stack = Object.assign(() => null, { Screen: 'Screen' });
  const layout = loadWithMocks(root + '/apps/mobile/app/(app)/_layout.tsx', { '@clerk/expo': { useAuth: () => auth }, 'expo-router': { Stack, Redirect: 'Redirect' }, 'react-native': native });
  let currentApi, refresh, instance, index;
  const hooks = { ...React, useRef: v => instance.refs[index++] ||= { current: v }, useState: v => { const owner = instance, i = index++; if (!(i in owner.states)) owner.states[i] = v; return [owner.states[i], value => { if (owner.mounted) owner.states[i] = typeof value === 'function' ? value(owner.states[i]) : value; }]; }, useMemo: f => f(), useCallback: f => f, useEffect: () => {} };
  const account = loadWithMocks(root + '/apps/mobile/app/(app)/(tabs)/hq.tsx', { react: hooks, '@clerk/expo': { useAuth: () => ({ ...auth, signOut: async () => {} }) }, 'expo-constants': { default: {} }, 'expo-updates': {}, 'expo-router': { useRouter: () => ({}) }, 'react-native': native,
    '../../../src/hooks/useMobileApi': { useMobileApi: () => currentApi }, '../../../src/hooks/useScreenRevalidation': { useScreenRevalidation: f => { refresh = f; } }, '../../../src/hooks/useAccessibleStatus': { useAccessibleStatus() {} }, '../../../src/push/push-registration': {},
    '../../../src/components/MemberScreen': { memberScreenStyles: {}, MemberCard: 'MemberCard', SectionTitle: 'SectionTitle', DataRow: 'DataRow', ErrorState: 'ErrorState' },
  });
  const profile = name => ({ displayName: name, customDisplayName: name, membership: { label: 'Standard' }, entitlements: {}, identity: { label: 'Member #123' } });
  const pending = []; const deferred = () => new Promise(resolve => pending.push(resolve));
  const apiA = { getMemberProfile: deferred, getSignalPoints: deferred, getReferralSummary: deferred, updateMemberProfile: deferred };
  currentApi = apiA;
  function render() { const key = layout.default().key; if (!instance || instance.key !== key) { if (instance) instance.mounted = false; instance = { key, mounted: true, states: [], refs: [] }; } index = 0; return account.default(); }
  render(); const aKey = instance.key; const oldLoad = refresh();
  // Exercise real mutation handler by rendering the profile editor, then pressing Remove.
  instance.states[1] = profile('A'); instance.states[13] = true; instance.states[18] = 'profile';
  function elements(node) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]; }
  const tree = render(); const remove = elements(tree).find(e => e.type === 'Pressable' && e.props.children?.props?.children === 'Remove display name');
  assert.ok(remove, 'mounted profile editor exposes real mutation callback'); remove.props.onPress();
  auth = { ...auth, userId: 'B', sessionId: 'session-B' }; currentApi = { ...apiA }; render();
  assert.notEqual(instance.key, aKey, 'authenticated layout must replace the entire member tree on account switch');
  const before = JSON.stringify(instance.states);
  pending[0]({ referralLink: 'A-private-link' }); pending[1]({ profile: profile('Account A private display') }); pending[2]({ balance: 12345, catalog: [], redemptions: [] }); pending[3]({ profile: profile('Account A mutation') });
  await oldLoad; await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(instance.states), before, 'old profile/points/referral/mutation completions cannot update B');
  const bKey = instance.key; auth = { ...auth, sessionId: 'session-B-new' }; render(); assert.notEqual(instance.key, bKey, 'same-user replacement session also remounts');
  auth = { ...auth, isSignedIn: false }; assert.equal(layout.default().type, 'Redirect');
});

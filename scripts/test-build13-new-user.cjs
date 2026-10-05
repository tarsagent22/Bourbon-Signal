const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const req = createRequire(root + '/package.json');
req('tsx/cjs');
const { build } = req('esbuild');
const { getEntitlements } = req(root + '/src/lib/entitlements.ts');

async function route(entry, fixture) {
  const stubs = {
    '@clerk/nextjs/server': 'export const auth=async()=>({userId:"new-member"});export const clerkClient=async()=>({users:f.users});',
    '@/lib/server-entitlements': 'export const getServerEntitlements=async()=>f.access;',
    '@/lib/community-sightings-repository': 'export const createCommunitySightingsRepository=()=>{f.repositoryCreated++;return {updateReporterDisplayName:async(...args)=>{f.reporterWrites.push(args);}}};',
  };
  const output = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'f', output.outputFiles[0].text)(req, module, module.exports, fixture);
  return module.exports;
}
function member(metadata = {}) {
  const f = { metadata, privateMetadata: {}, access: getEntitlements('free'), reporterWrites: [], repositoryCreated: 0, failSave: false };
  f.users = {
    getUser: async () => ({ publicMetadata: structuredClone(f.metadata), privateMetadata: structuredClone(f.privateMetadata) }),
    updateUserMetadata: async (_, patch) => {
      if (f.failSave) throw Error('fixture unavailable');
      f.metadata = { ...f.metadata, ...patch.publicMetadata };
      f.privateMetadata = { ...f.privateMetadata, ...patch.privateMetadata };
    },
  };
  return f;
}
const request = (url, method, body) => new Request(`https://fixture.invalid${url}`, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });

test('new member can save Mikey without a numbered identity or Community storage', async () => {
  const f = member({ bottleAlertPreferences: { bottleNames: ['Eagle Rare'] } });
  const api = await route('src/app/api/v1/me/profile/route.ts', f);
  const response = await api.PATCH(request('/api/v1/me/profile', 'PATCH', {displayName:'Mikey'}));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.customDisplayName, 'Mikey');
  assert.equal(f.metadata.communityDisplayName, 'Mikey');
  assert.deepEqual(f.metadata.bottleAlertPreferences, { bottleNames: ['Eagle Rare'] });
  assert.equal(f.repositoryCreated, 0);
  assert.equal((await api.GET()).status, 200);
});
test('existing member rename updates posts and rolls back them if Clerk fails', async () => {
  const f = member({memberNumber: 184, communityDisplayName:'Before'});
  const api = await route('src/app/api/v1/me/profile/route.ts', f);
  f.failSave = true;
  assert.equal((await api.PATCH(request('/api/v1/me/profile','PATCH',{displayName:'Mikey'}))).status, 503);
  assert.deepEqual(f.reporterWrites.map(args=>args[1]), ['Mikey','Before']);
  assert.equal(f.metadata.communityDisplayName, 'Before');
  assert.equal(f.reporterWrites[0][2].label, 'Member #184');
});
test('welcome persists display name and home state and is resumable before completion', async () => {
  const f = member();
  const api = await route('src/app/api/v1/me/onboarding/route.ts', f);
  assert.equal((await (await api.GET()).json()).completed, false);
  assert.equal((await api.POST(request('/api/v1/me/onboarding','POST',{displayName:'Mikey',homeState:'NC',age21Affirmed:true}))).status, 200);
  assert.equal((await (await api.GET()).json()).completed, true);
  assert.equal(f.metadata.memberProfile.homeState, 'NC');
  const profile = await route('src/app/api/v1/me/profile/route.ts', f);
  assert.equal((await (await profile.GET()).json()).profile.homeState, 'NC');
});

const { createSignalFeedHandler } = req(root + '/src/lib/signals/signal-route.ts');
test('Free and Standard detailed filters fail explicitly before reading either feed', async () => {
  for (const tier of ['free','standard']) {
    let reads = 0;
    const api = createSignalFeedHandler({ getFilterAccess: async()=>getEntitlements(tier), getDrops: async()=>{reads++;}, getSightings: async()=>{reads++;} });
    for (const query of ['state=NC&area=Wake County ABC','bottle=Eagle%20Rare','freshness=24h']) {
      const response = await api(new Request(`https://fixture.invalid/api/v1/signals?view=market&${query}`));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'FORBIDDEN');
    }
    assert.equal(reads, 0);
  }
});
test('Barrel and Founder NC board requests reach the drop source as an exact store filter', async () => {
  for (const tier of ['barrel','bottled-in-bond']) {
    let source;
    const api = createSignalFeedHandler({getFilterAccess:async()=>getEntitlements(tier),getDrops:async(request)=>{source=new URL(request.url);return Response.json({drops:[],total:0});},getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
    assert.equal((await api(new Request('https://fixture.invalid/api/v1/signals?view=market&state=NC&area=Triad%20Municipal%20ABC'))).status, 200);
    assert.equal(source.searchParams.get('state'),'NC');
    assert.equal(source.searchParams.get('store'),'Triad Municipal ABC');
  }
});
test('state browsing stays available to Standard and Free', async () => {
  for (const tier of ['free','standard']) {
    let source;
    const api = createSignalFeedHandler({getFilterAccess:async()=>getEntitlements(tier),getDrops:async(request)=>{source=new URL(request.url);return Response.json({drops:[],total:0});},getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
    assert.equal((await api(new Request('https://fixture.invalid/api/v1/signals?view=market&state=NC'))).status, 200);
    assert.equal(source.searchParams.get('state'),'NC');
  }
});

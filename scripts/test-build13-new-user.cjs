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
    '@/lib/member-numbers': 'export const ensureMemberNumber=async(client,user)=>user;',
    '@clerk/nextjs/server': 'export const auth=async()=>({userId:f.signedOut?null:"new-member"});export const clerkClient=async()=>({users:f.users});',
    '@/lib/server-entitlements': 'export const getServerEntitlements=async()=>f.access;',
    '@/lib/community-sightings-repository': 'export const createCommunitySightingsRepository=()=>{f.repositoryCreated++;return {updateReporterDisplayName:async(...args)=>{f.reporterWrites.push(args);}}};',
    ...fixture.stubs,
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
    getUser: async () => ({ id: 'new-member', publicMetadata: structuredClone(f.metadata), privateMetadata: structuredClone(f.privateMetadata), unsafeMetadata: structuredClone(f.unsafeMetadata || {}) }),
    updateUserMetadata: async (_, patch) => {
      if (f.failSave) throw Error('fixture unavailable');
      f.metadata = { ...f.metadata, ...patch.publicMetadata };
      f.privateMetadata = { ...f.privateMetadata, ...patch.privateMetadata };
    },
  };
  return f;
}
const request = (url, method, body) => new Request(`https://fixture.invalid${url}`, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });

test('legal agreement endpoint requires auth and current affirmative consent and persists server time privately', async () => {
  const f = member();
  const api = await route('src/app/api/v1/me/legal/route.ts', f);
  f.signedOut = true;
  assert.equal((await api.GET()).status, 401);
  assert.equal((await api.POST(request('/api/v1/me/legal', 'POST', {}))).status, 401);
  f.signedOut = false;
  const initial = await (await api.GET()).json();
  assert.equal(initial.acceptance, null);
  assert.equal((await api.POST(request('/api/v1/me/legal', 'POST', { accepted: true, termsVersion: 'old' }))).status, 400);
  f.failSave = true;
  const body = { accepted: true, termsVersion: initial.termsVersion, acceptedAt: '1900-01-01' };
  assert.equal((await api.POST(request('/api/v1/me/legal', 'POST', body))).status, 503);
  assert.equal(f.privateMetadata.legalAcceptance, undefined);
  f.failSave = false;
  const response = await api.POST(request('/api/v1/me/legal', 'POST', body));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const { acceptance } = await response.json();
  assert.equal(acceptance.source, 'community');
  assert.notEqual(acceptance.acceptedAt, body.acceptedAt);
  assert.deepEqual(f.privateMetadata.legalAcceptance, acceptance);
  assert.deepEqual((await (await api.GET()).json()).acceptance, acceptance);
  assert.deepEqual(f.metadata, {});
});

test('authenticated setup records explicit signup assent without silently accepting for existing users', async () => {
  const f = member();
  const api = await route('src/app/api/v1/me/onboarding/route.ts', f);
  await api.GET();
  assert.equal(f.privateMetadata.legalAcceptance, undefined);
  const { COMMUNITY_TERMS_VERSION } = req(root + '/shared/legal-acceptance.ts');
  f.unsafeMetadata = { legalAgreement: { accepted: true, termsVersion: COMMUNITY_TERMS_VERSION } };
  assert.equal((await api.GET()).status, 200);
  assert.equal(f.privateMetadata.legalAcceptance.source, 'signup');
});

test('direct post and photo upload requests cannot bypass missing terms acceptance', async () => {
  const f = member({ memberNumber: 184 });
  f.stubs = {
    '@/lib/bourbonBible': 'export const getBourbonBible=async()=>[];export const normalizeBottleKey=s=>s.toLowerCase();export const searchBourbonBible=()=>[];',
    '@/lib/preview-qa': 'export const isQaPreviewRequest=()=>false;export const getQaPreviewTierFromRequest=()=>"free";',
    '@vercel/blob/client': 'export const handleUpload=async opts=>opts.onBeforeGenerateToken("unused", "{}");',
  };
  const post = await route('src/app/api/sightings/route.ts', f);
  const response = await post.POST(request('/api/sightings', 'POST', { bottleName: 'Example bottle', storeName: 'Example store', storeId: 'example-store', storeAddress: '1 Main St', storeState: 'NC' }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'TERMS_ACCEPTANCE_REQUIRED');
  assert.equal(f.repositoryCreated, 0);
  const tokenBefore = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-test-token';
  const errorBefore = console.error;
  console.error = () => {};
  try {
    const photo = await route('src/app/api/sightings/photo/route.ts', f);
    const upload = await photo.POST(request('/api/sightings/photo', 'POST', { type: 'blob.generate-client-token' }));
    assert.equal(upload.status, 400);
    assert.match((await upload.json()).error, /Accept the Terms of Use/);
    const attach = await photo.PATCH(request('/api/sightings/photo', 'PATCH', { sightingId: 'sighting_12345678', blob: { pathname: 'sighting-proofs/sighting_12345678/1.jpg' } }));
    assert.equal(attach.status, 409);
    assert.equal((await attach.json()).code, 'TERMS_ACCEPTANCE_REQUIRED');
    assert.equal(f.repositoryCreated, 0);
  } finally {
    console.error = errorBefore;
    if (tokenBefore === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = tokenBefore;
  }
});

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
test('Free detailed filters fail explicitly before reading either feed', async () => {
  for (const tier of ['free']) {
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
test('Every paid billing tier reaches the drop source with exact NC board filters', async () => {
  for (const tier of ['standard','barrel','bottled-in-bond']) {
    let source;
    const api = createSignalFeedHandler({getFilterAccess:async()=>getEntitlements(tier),getDrops:async(request)=>{source=new URL(request.url);return Response.json({drops:[],total:0});},getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
    assert.equal((await api(new Request('https://fixture.invalid/api/v1/signals?view=market&state=NC&area=Triad%20Municipal%20ABC'))).status, 200);
    assert.equal(source.searchParams.get('state'),'NC');
    assert.equal(source.searchParams.get('store'),'Triad Municipal ABC');
  }
});
test('state browsing stays available to Standard while Free previews remain global', async () => {
  for (const tier of ['free','standard']) {
    let source;
    const api = createSignalFeedHandler({getFilterAccess:async()=>getEntitlements(tier),getDrops:async(request)=>{source=new URL(request.url);return Response.json({drops:[],total:0});},getSightings:async()=>Response.json({sightings:[],totalSightings:0})});
    assert.equal((await api(new Request('https://fixture.invalid/api/v1/signals?view=market&state=NC'))).status, tier === 'free' ? 403 : 200);
    if (tier === 'free') assert.equal(source, undefined); else assert.equal(source.searchParams.get('state'),'NC');
  }
});

import assert from 'node:assert/strict';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
const { loadWithMocks } = ('default' in harness ? {...harness, ...(harness.default as object)} : harness) as typeof import('../apps/mobile/src/astra-test-harness.ts');
let candidateReads = 0; let signedIn = true;
const inbox = [{id:'engine', sourceType:'engine',createdAt:'2026-10-03',readAt:null,archivedAt:null}, {id:'community',sourceType:'community',createdAt:'2026-10-03',readAt:null,archivedAt:null}];
const alerts = loadWithMocks('src/app/api/alerts/route.ts', {
  'next/server': {NextResponse: Response},
  '@clerk/nextjs/server': {auth: async()=>({userId:signedIn?'member':null}),clerkClient: async()=>({users:{getUser:async()=>({publicMetadata:{},privateMetadata:{}})}})},
  '@/lib/notification-preferences': {normalizeNotificationPreferences:()=>({sightings:{enabled:false}})},
  '@/lib/server-entitlements': {getServerEntitlements:async()=>({canReceiveSightingsAlerts:false})},
  '@/lib/alert-delivery': {normalizeAlertInboxMetadata:()=>({recent:inbox}),readAlertCandidates:async()=>{candidateReads++;return [];}},
  '@/lib/alert-queue/member-lease': {},
});
const compact = await alerts.GET({nextUrl:new URL('https://example.test/api/alerts?summary=1')});
assert.equal(compact.headers.get('cache-control'),'private, no-store');
assert.deepEqual(await compact.json(),{alerts:[inbox[0]],unreadCount:1},'compact inbox retains community access filtering');
assert.equal(candidateReads,0,'mobile inbox never downloads the engine candidate export');
await alerts.GET({nextUrl:new URL('https://example.test/api/alerts')});
assert.equal(candidateReads,1,'existing web diagnostics remain available');
signedIn=false;
assert.equal((await alerts.GET({nextUrl:new URL('https://example.test/api/alerts?summary=1')})).status,401);

const bottle={id:'bottle',canonicalName:'Example Bourbon',brand:'Example',producer:'Distiller',proof:100,ageStatement:'8 years',availability:'allocated',nationalTier:'allocated',aliases:['Example 8'],summary:'long description',photo:{uri:'large photo'},guidance:{detail:'long guidance'}};
const catalog=loadWithMocks('src/app/api/bottle-catalog/route.ts',{
  'next/server':{NextResponse:Response},'@/lib/bourbonBible':{getBourbonBible:async()=>[bottle]},
  '@/lib/site-engine-contract':{siteExportHeaders:()=>({'Cache-Control':'public, max-age=300'})},
  '@/lib/bottle-scarcity':{getPublicScarcityLabel:()=> 'Allocated',getScarcityBadges:()=>[]},
  '@/data/bottle-scarcity-overrides':{BOTTLE_SCARCITY_SOURCE_REGISTRY:[]},
});
const picker=await (await catalog.GET({nextUrl:new URL('https://example.test/api/bottle-catalog?view=picker')})).json();
assert.deepEqual(picker.bottles[0],{id:bottle.id,canonicalName:bottle.canonicalName,brand:bottle.brand,producer:bottle.producer,proof:bottle.proof,ageStatement:bottle.ageStatement,availability:bottle.availability,nationalTier:bottle.nationalTier,aliases:bottle.aliases});
const full=await (await catalog.GET({nextUrl:new URL('https://example.test/api/bottle-catalog')})).json();
assert.equal(full.bottles[0].summary,bottle.summary,'full public catalog retains its original fields');
console.log('Loading APIs: compact payloads, complete bottle identity, authentication, access filtering, and existing web responses passed.');

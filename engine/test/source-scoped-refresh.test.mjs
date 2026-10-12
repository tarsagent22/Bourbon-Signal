import assert from 'node:assert/strict';
import test from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildTasteSignal, parseTastePickupPage } from '../src/collectors/south-carolina-taste.mjs';
import { buildDrops, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
import { sourceRefreshScope, mergeSourceScopedReport, verifySourceScopedEvidence } from '../src/source-scoped-refresh.mjs';
import { guardStateReport } from '../src/state-report-guard.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const url = 'https://tasteliquors.com/columbia-liquor-delivery/1792-small-batch-750ml.html';
const now = new Date().toISOString();
const html = `<script type="application/ld+json">${JSON.stringify({'@type':'LiquorStore','@id':'https://tasteliquors.com/',url:'https://tasteliquors.com/',name:'Taste Liquors',geo:{'@type':'GeoCoordinates',latitude:'34.09736390',longitude:'-81.22078620'},address:{streetAddress:'2722 N Lake Dr',addressLocality:'Columbia',addressRegion:'SC',postalCode:'29212',addressCountry:'US'}})}</script>
<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'1792 Small Batch - 750mL',offers:{'@type':'Offer',priceCurrency:'USD',price:'37.81',availability:'https://schema.org/InStock',seller:{name:'Taste Liquors',url}}})}</script>
<h1>1792 Small Batch - 750mL</h1>In-Store Pickup Available<button data-test="add-to-cart-button-available">Add to Cart</button><script>product_id: 326806</script>`;
const fresh = { ...buildTasteSignal(parseTastePickupPage(html,url), bible, now), leafSourceRuntimeId:'sc:taste-liquors' };
const candidate = {state:'SC',startedAt:now,finishedAt:now,signals:[fresh],sources:[],roadblocks:[],status:'useful'};
const previous = {state:'SC',finishedAt:now,sources:[],roadblocks:[],signals:[{...fresh,id:'sibling',storeId:'other:1',sourceChain:'other',sourceLabel:'Other retailer',leafSourceRuntimeId:undefined}],status:'useful'};

test('only reviewed source lanes in exactly SC can be dispatched', () => {
  assert.deepEqual(sourceRefreshScope({BOURBON_SIGNAL_RUN_STATES:'SC',BOURBON_SIGNAL_REFRESH_SOURCES:'taste-liquors'}), ['taste-liquors']);
  for (const [states,sources] of [['NC','taste-liquors'],['SC,NC','taste-liquors'],['SC','unknown'],['','taste-liquors']]) {
    assert.throws(() => sourceRefreshScope({BOURBON_SIGNAL_RUN_STATES:states,BOURBON_SIGNAL_REFRESH_SOURCES:sources}));
  }
});

test('fresh target reaches the real customer projection while unrelated sources are retained non-alertable', () => {
  const merged = mergeSourceScopedReport(previous,candidate,['taste-liquors'],now);
  const row = merged.signals.find(row => row.id === 'sibling');
  assert.equal(row.sourceStale,true); assert.equal(row.canAlertAsInventory,false); assert.equal(row.sourceAvailabilityVerified,false);
  const guarded = guardStateReport({previous,candidate:merged,options:{mergePartialFallback:true}}).report;
  const record = {id:fresh.canonicalBottleId,canonical:fresh.canonicalName,tier:'allocated',aliases:[]};
  const drops = buildDrops(guarded.signals,{byId:new Map([[record.id,record]]),byName:new Map()},guarded.signals);
  assert.ok(drops.some(row => row.leafSourceRuntimeId === 'sc:taste-liquors' && !row.sourceStale));
  assert.equal(verifySourceScopedEvidence(guarded,drops,['taste-liquors'],now).verified,true);
  assert.ok(buildCurrentInventoryAlertsFromDrops(drops).every(row => row.leafSourceRuntimeId === 'sc:taste-liquors'));
});

test('missing published continuity, old observations, forged evidence, or absent public target fail closed', () => {
  assert.throws(() => mergeSourceScopedReport(null,candidate,['taste-liquors'],now));
  const merged = mergeSourceScopedReport(previous,candidate,['taste-liquors'],now);
  assert.throws(() => verifySourceScopedEvidence(merged,[],['taste-liquors'],now), /customer-visible/);
  for (const changes of [{sourceStale:true},{observedAt:'2026-01-01T00:00:00Z'},{sourceProductBinding:{...fresh.sourceProductBinding,pickupAvailable:false}},{storeAddress:'Elsewhere, SC 29212'}]) {
    assert.throws(() => verifySourceScopedEvidence({...merged,signals:[{...fresh,...changes}]},[fresh],['taste-liquors'],now), /no fresh/);
  }
  assert.throws(() => verifySourceScopedEvidence({...merged,signals:[fresh,{...merged.signals[1],canAlertAsInventory:true}]},[fresh],['taste-liquors'],now), /unrequested source/);
});

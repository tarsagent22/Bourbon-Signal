import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { ARKANSAS_CITYHIVE_RESEARCH_SOURCES } from '../src/collectors/central-cityhive-research-premises.mjs';
import { centralCityHiveLibraryTier, parseCentralCityHiveInventory } from '../src/collectors/central-cityhive-expansion.mjs';
import { cityHiveResearchLifecycleEntries, cityHiveResearchSourceForState } from '../src/research-cityhive-runtime.mjs';
import { CENTRAL_CITYHIVE_STATE_IDS } from '../src/central-cityhive-policy.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/ar-cityhive/sodies-little-book-chapter-10.json',import.meta.url),'utf8'));
const source=ARKANSAS_CITYHIVE_RESEARCH_SOURCES[0];
const identity=fixture.libraryIdentity;
const bible=new BourbonBible([{id:identity.id,canonical:identity.canonicalName,normalizedKey:`library:${identity.id}`,aliases:[],tier:identity.nationalTier,strictLibraryIdentity:true,libraryAlertEligible:identity.isAlertEligible,libraryIdentities:[identity]}]);
const wrap=payload=>`<script type="application/json">${JSON.stringify(payload)}</script>`;
const captureHtml=()=>fixture.payloads.map(wrap).join('');

test('Sodie’s exact Chapter 10 detail is a pinned AR research-only allocated candidate',()=>{
  const config=cityHiveResearchSourceForState('AR');
  assert.ok(config);assert.equal(config.active,false);assert.equal(config.cadence,'shadow-only');
  assert.equal(config.sources.length,1);assert.equal(source.state,'AR');
  const lifecycle=cityHiveResearchLifecycleEntries().AR;
  assert.equal(lifecycle.publicStatus,'research_only');assert.equal(lifecycle.inventoryAlertable,false);assert.equal(lifecycle.watchAlertable,false);
  assert.equal(CENTRAL_CITYHIVE_STATE_IDS.has('AR'),false);
  assert.equal(bible.match('Little Book Chapter All The Wiser'),null,'the raw storefront title must not become a general alias');
  const signals=parseCentralCityHiveInventory(captureHtml(),source,bible,{observedAt:fixture.capture.capturedAt});
  assert.equal(signals.length,1);const row=signals[0];
  assert.equal(row.canonicalBottleId,'little-book-chapter-10');assert.equal(row.canonicalName,'Little Book Chapter 10');assert.equal(row.tier,'allocated');
  assert.equal(row.merchantId,'594311b6c90f94622d026e1e');assert.equal(row.storeAddress,source.address);
  assert.equal(row.productId,'6a03603df437b100019febf3');assert.equal(row.optionId,'c4b6d71d9d8941ce0521d41f56e30cef46056aa805a9e38a896679e9b05c2c45');
  assert.equal(row.rawName,'Little Book Chapter All The Wiser');assert.equal(row.price,190);
  assert.equal(row.sourceProductBinding.reportedQuantity,1);assert.equal(row.sourceProductBinding.pickupOfferVerified,true);
  assert.equal(row.sourceProductBinding.identityName,'Little Book Chapter 10');
  assert.equal(centralCityHiveLibraryTier(row,bible),'allocated');
});

test('Sodie’s Chapter 10 review fails closed if source option or raw chapter evidence drifts',()=>{
  const wrongOption=structuredClone(fixture.payloads);
  wrongOption[1].merchants[0].product_options[0].option_id='unreviewed-option';
  assert.deepEqual(parseCentralCityHiveInventory(wrongOption.map(wrap).join(''),source,bible,{observedAt:fixture.capture.capturedAt}),[]);
  const wrongChapter=structuredClone(fixture.payloads);
  wrongChapter[1].description='Little Book Chapter 11 "All the Wiser" is a blend. Chapter 11 is 100% bourbon.';
  wrongChapter[1].merchants[0].product_options[0].option_display_data.description=wrongChapter[1].description;
  assert.deepEqual(parseCentralCityHiveInventory(wrongChapter.map(wrap).join(''),source,bible,{observedAt:fixture.capture.capturedAt}),[]);
  const noPickup=structuredClone(fixture.payloads);noPickup[1].merchants[0].offer_types=['shipping'];
  assert.deepEqual(parseCentralCityHiveInventory(noPickup.map(wrap).join(''),source,bible,{observedAt:fixture.capture.capturedAt}),[]);
});

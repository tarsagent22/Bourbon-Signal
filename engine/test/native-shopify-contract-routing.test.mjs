import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import {nativeMichiganStateConfig,nativeMichiganVerificationId} from '../src/native-shopify-production-config.mjs';
import {nativeShopifySemanticManifest,nativeShopifyContractPaths,nativeShopifySemanticHash} from '../src/native-shopify-contract.mjs';
import {nativeShopifyCohortHash,nativeShopifyProductionAllowed} from '../src/collectors/native-shopify-onsite.mjs';
import {syntheticNativeAdmission} from './helpers/synthetic-native-shopify.mjs';
import {STATE_SOURCES,ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {executeStateFixtures,validateStateFixtures} from '../src/verify-state-fixtures.mjs';
import {validateStateVerticalSliceManifest} from '../src/state-vertical-slice-contract.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
import {normalizeHistoricalImplementationBytes} from '../src/verification/historical-implementation.mjs';
const records=JSON.parse(await readFile(new URL('./fixtures/native-shopify-preparation/bible.json',import.meta.url),'utf8')).records;
const legacy={id:'MI',active:true,label:'Held CityHive',sources:[{url:'https://thewinegardenco.com/shop/'}]};
test('ordinary MI stays disabled with state flags or CityHive evidence; valid synthetic native authority selects only Wine Palace',()=>{
 const source=ALL_STATE_SOURCES.find(s=>s.id==='MI');assert.equal(source.active,false);assert.equal(STATE_SOURCES.some(s=>s.id==='MI'),false);
 assert.equal(nativeMichiganStateConfig(legacy).active,false);assert.equal(nativeMichiganVerificationId('MI'),null);
 const synthetic=syntheticNativeAdmission('mi:wine-palace-livonia'),config=nativeMichiganStateConfig(legacy,synthetic);
 assert.equal(config.active,true);assert.equal(config.nativePickupSourceId,'mi:wine-palace-livonia');assert.equal(config.sources.length,1);assert.equal(new URL(config.sources[0].url).host,'winepalacemi.com');assert.ok(!JSON.stringify(config).includes('thewinegardenco'));
 assert.equal(nativeMichiganVerificationId('MI',synthetic),'mi:wine-palace-livonia');assert.equal(nativeMichiganStateConfig({id:'NJ'},synthetic).id,'NJ');assert.equal(legacy.sources[0].url,'https://thewinegardenco.com/shop/');
 for(const authority of [null,{...synthetic.authority,sourceId:'mi:nj-mi-cityhive'},{...synthetic.authority,enabled:false},{...synthetic.authority,promotionEvidence:{...synthetic.authority.promotionEvidence,shadowRuns:2}}])assert.equal(nativeMichiganStateConfig(legacy,{...synthetic,authority}).active,false);
 const quarantined={...synthetic,env:{BOURBON_SIGNAL_QUARANTINED_STATES:'MI'}};assert.equal(nativeMichiganStateConfig(legacy,quarantined).active,false);
});
test('native semantic files are exact leaf-scoped pending templates, never activation or customer evidence',()=>{
 for(const id of ['mi:wine-palace-livonia','tx:pogos-dallas-shopify']){
  const m=nativeShopifySemanticManifest(id);assert.deepEqual(m.collector.sourceIds,[id]);assert.equal(m.collector.cohortSha256,nativeShopifyCohortHash(id));assert.equal(m.sourceSemantics.inventoryAlertable,false);assert.equal(m.sourceSemantics.watchAlertable,false);assert.equal(m.evidence.shadow.runs,0);assert.equal(nativeShopifyProductionAllowed(id),false);
  assert.equal(validateStateVerticalSliceManifest(m).ok,false,'Pending customer paths must block integration readiness');
  const synthetic=syntheticNativeAdmission(id),changed=structuredClone(synthetic.authority);changed.manifest.collector.sourceIds=['mi:nj-mi-cityhive'];assert.equal(nativeShopifyProductionAllowed(id,{...synthetic,authority:changed}),false);
  const before=nativeShopifySemanticHash(m);m.customerPaths.finder.status='verified';assert.notEqual(nativeShopifySemanticHash(m),before,'Customer proof edits require fresh semantic evidence');
 }
 assert.throws(()=>nativeShopifyContractPaths('mi:nj-mi-cityhive'));assert.throws(()=>nativeShopifyContractPaths('tx:hotspot'));
});
test('actual source-specific fixture executor routes MI and TX to exact native bodies, rejects foreign scope, preserves0HTTP',async()=>{
 for(const id of ['mi:wine-palace-livonia','tx:pogos-dallas-shopify']){
  const file=nativeShopifyContractPaths(id).fixtures,payload=JSON.parse(await readFile(new URL('../'+file.replaceAll('\\','/'),import.meta.url),'utf8'));assert.equal(validateStateFixtures(payload).ok,true);
  const {executeNativeShopifyFixtures}=await import('../src/native-shopify-fixtures.mjs');assert.deepEqual(await executeNativeShopifyFixtures(payload,{bible:new BourbonBible(records)}),{ok:true,failures:[]});
  assert.deepEqual(await executeStateFixtures(payload,{bibleFile:fileURLToPath(new URL('./fixtures/native-shopify-preparation/bible.json',import.meta.url))}),{ok:true,failures:[]});
  const wrong={...payload,state:payload.state==='MI'?'TX':'MI'};assert.equal((await executeNativeShopifyFixtures(wrong,{bible:new BourbonBible(records)})).ok,false);
 }
});
test('new MI registration has two exact MS reversals; original MS digest remains pinned and mutations stay visible',async()=>{
 const file='engine/src/state-sources.mjs',bytes=await readFile(new URL('../src/state-sources.mjs',import.meta.url)),evidence=JSON.parse(await readFile(new URL('../data/state-expansion-evidence/MS-tupelo2go-2026-07-30.json',import.meta.url),'utf8'));
 const digest=v=>createHash('sha256').update(v).digest('hex');assert.equal(digest(normalizeHistoricalImplementationBytes(file,bytes)),evidence.implementationFilesSha256[file]);
 for(const text of [bytes.toString().replace('return nativeMichiganStateConfig(source);','return source;'),bytes.toString()+"\nimport {nativeMichiganStateConfig} from './native-shopify-production-config.mjs';\n"])assert.throws(()=>normalizeHistoricalImplementationBytes(file,Buffer.from(text)),/native descriptor .*exact/);
 const outside=Buffer.from(bytes.toString().replace("label: 'Mississippi", "label: 'Altered Mississippi"));assert.notEqual(digest(normalizeHistoricalImplementationBytes(file,outside)),evidence.implementationFilesSha256[file]);
});

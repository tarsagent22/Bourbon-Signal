import test, {mock, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {compileGroceryXapiDescriptors,createGroceryXapiPolicy,groceryXapiHash} from '../engine/src/sources/grocery-xapi-policy.mjs';
import {buildGroceryXapiPollProjection as build} from '../engine/src/sources/grocery-xapi-poll-projection.mjs';
import {collectGroceryXapiPoll} from '../engine/src/collectors/grocery-xapi-poll-runtime.mjs';
import {validatePollPolicy,validateGroceryXapiRows} from '../engine/src/sources/poll-policy.mjs';
import {BourbonBible} from '../engine/src/core/bible.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../engine/test/fixtures/grocery-xapi/2026-10-25-five-prospects-six-premises-derived.json',import.meta.url))).sources.filter(s=>s.state!=='AZ');
fixtures.push(JSON.parse(readFileSync(new URL('../engine/test/fixtures/grocery-xapi/2026-10-25-safeway1749-derived.json',import.meta.url))).source);
const integrationNow=Date.parse('2026-10-25T10:00:00.000Z'),runtimeVersion='grocery-xapi-1',runtimeSha256='a'.repeat(64);
// Saved fixture capture clocks remain untouched; these runtime clocks simulate fresh observations for deterministic integration checks, not new provider proof.
mock.method(Date,'now',()=>integrationNow);
after(()=>mock.restoreAll());
function setup(f) {
 const bindings=f.products.map(({product,expected})=>({productId:expected.productId,variantId:expected.variantId || expected.productId,canonicalBottleId:expected.canonicalId,canonicalName:expected.canonicalName || expected.canonical,rawName:product.name,volumeMl:750,packageCount:1}));
 // Canonical spelling is fixture evidence; current policy is supplied separately.
 for(let i=0;i<bindings.length;i++) bindings[i].canonicalName ||= f.products[i].expected.bottleName || 'Current canonical';
 const d={id:f.sourceId,state:f.state,banner:f.host.split('.')[1],host:f.host,merchantId:f.merchantId,premise:f.premise,expiryHours:1,bindings};
 const admission={sourceId:d.id,configSha256:groceryXapiHash(d),bindingsSha256:groceryXapiHash(bindings),runtimeVersion,runtimeSha256,reviewedAt:'2026-10-25T09:30:00.000Z',expiresAt:'2026-10-26T09:30:00.000Z'};
 const descriptors=compileGroceryXapiDescriptors({definitions:[d],admissions:[admission],runtimeVersion,runtimeSha256});
 const lookup={byState:{[d.state]:{byId:new Map(bindings.map(b=>[b.canonicalBottleId,{id:b.canonicalBottleId,canonical:b.canonicalName,tier:'allocated'}]))}}};
 lookup.byId=lookup.byState[d.state].byId;
 const policy=createGroceryXapiPolicy({descriptors,lookup,policySnapshotId:'current',enabledSourceIds:[d.id],now:integrationNow});
 const rows=bindings.map((b,i)=>({sourceRuntimeId:d.id,sourceChain:descriptors[0].chain,sourceLabel:descriptors[0].sourceLabel,state:d.state,stateCode:d.state,merchantId:d.merchantId,...{storeId:d.premise.storeId,storeName:d.premise.name,storeAddress:d.premise.address,city:d.premise.city,zip:d.premise.zip},productId:b.productId,variantId:b.variantId,canonicalBottleId:b.canonicalBottleId,canonicalName:b.canonicalName,rawName:b.rawName,tier:'allocated',sourceUrl:`https://${d.host}/shop/product-details.${b.productId}.html`,sourceProductBinding:groceryXapiHash(b),sourceConfigSha256:descriptors[0].configSha256,sourceAdmissionSha256:descriptors[0].admissionSha256,sourceRuntimeSha256:runtimeSha256,sourceCollectorVersion:runtimeVersion,sourcePolicySnapshotId:'current',observedAt:new Date(integrationNow-600000).toISOString(),eventType:'retailer_store_inventory_result',locationPrecision:'store_level',sourceAvailabilityVerified:true,availabilityStatus:'in_stock',quantity:f.products[i].expected.quantity,quantityIsExact:true,inventorySemantics:'exact_retailer_quantity',completeSnapshot:false,absenceIsOutOfStock:false,raw:{volumeMl:750,packageCount:1,fulfillmentPolicyVerified:true,reportedQuantity:f.products[i].expected.quantity}}));
 return {policy,rows,descriptors,lookup};
}
function assemble(f,prior,status='in_stock',offset=0,quantityDelta=0) {
 const {policy,rows,descriptors,lookup}=setup(f);
 const observations=rows.map(row=>({...row,confidence:.9,canAlertAsInventory:status==='in_stock',canAlertAsWatch:false,
   observedAt:new Date(Date.parse(row.observedAt)+offset).toISOString(),availabilityStatus:status,
   quantity:status==='in_stock'?row.quantity+quantityDelta:0,sourceAvailabilityVerified:status==='in_stock'||status==='out_of_stock',
   raw:{...row.raw,reportedQuantity:status==='in_stock'?row.quantity+quantityDelta:0}}));
 const source=descriptors[0];
 const market=lookup.byState[source.state];
 return {source,ctx:{snapshotId:'current',lookup:{...market,byState:lookup.byState},drops:[]},lease:{generation:2,projection:prior},result:{signals:status==='in_stock'?observations:[],observations,metadata:{scope:'one_store_bourbon_search_first_page',completeSnapshot:false,absenceIsOutOfStock:false}},owner:'test',groceryPolicy:policy,now:integrationNow};
}
import {build as bundle} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=await bundle({absWorkingDir:root,bundle:true,write:false,platform:'node',format:'cjs',packages:'external',stdin:{resolveDir:root,loader:'ts',contents:`
export {normalizeDropForSite} from './src/lib/site-engine-contract';
export {classifyPublicDrop,getDropClassificationIndex} from './src/lib/drop-classification';
export {normalizePublicDropEvidenceInput,isPublicDropFeedEligible} from './src/lib/public-drop-evidence';
export {buildCoverageContract} from './src/lib/coverage-model';
export {default as classificationArtifact} from './src/data/drop-feed-classification.generated.json';
export {default as lifecycle} from './src/config/state-lifecycle.json';
`},plugins:[{name:'offline-infrastructure',setup(builder){builder.onResolve({filter:/^next\/cache$/},()=>({path:'cache',namespace:'offline'}));builder.onResolve({filter:/vercel-blob-snapshot-storage$/},()=>({path:'storage',namespace:'offline'}));builder.onLoad({filter:/.*/,namespace:'offline'},args=>({contents:args.path==='cache'?'export const unstable_cache=fn=>fn;':'export class VercelBlobSnapshotStorage {readPointer(){throw new Error("Forbidden storage")} readObject(){throw new Error("Forbidden storage")}}',loader:'js'}));}}]});
const customerModule={exports:{}};
new Function('require','module','exports','process','fetch',bundled.outputFiles[0].text)(createRequire(import.meta.url),customerModule,customerModule.exports,{env:{},cwd:()=>root},()=>{throw new Error('Forbidden network')});
const customer=customerModule.exports;
const index=customer.getDropClassificationIndex(customer.classificationArtifact.records);
function coverage(drops,classificationIndex=index,stateCode='NV'){return customer.buildCoverageContract({lifecycle:customer.lifecycle,stateRows:[{state:stateCode,publicStatus:'active',status:'useful',signalCount:drops.length,bestLocationPrecision:'store_level'}],stores:[],locations:[],drops:drops.map(row=>customer.normalizePublicDropEvidenceInput(customer.classifyPublicDrop(customer.normalizeDropForSite(row),classificationIndex))),asOf:new Date(integrationNow).toISOString(),generatedAt:new Date(integrationNow).toISOString()}).states.find(state=>state.code===stateCode);}
test('current admitted overlay adds genuinely new physical coverage without base store records; empty/stale/withdrawn overlays cannot count',()=>{
 const f=fixtures[0],first=build(assemble(f));
  // Existing generated classification vetoes these common saved bottles. This is
 // evidence against a current coverage claim, not a reason to bypass policy.
 assert.equal(coverage(first.projection.drops).scope.inventoryMonitoredStores,0);
 // A declared future-authority simulation checks that a genuinely admitted and
 // classified limited bottle reaches coverage with no snapshot store record.
 const ids=new Set(first.drops.map(row=>row.canonicalId));
 const simulatedIndex=customer.getDropClassificationIndex(first.drops.map(row=>({id:row.canonicalId,canonicalName:row.canonicalName,nationalTier:'allocated',nationalConfidence:'high',stateOverrides:[]})));
 const futureCoverage=drops=>coverage(drops,simulatedIndex);
 const empty=futureCoverage([]),current=futureCoverage(first.projection.drops);
 assert.equal(empty.scope.inventoryMonitoredStores,0);
 assert.equal(current.scope.inventoryMonitoredStores,1);
 assert.equal(current.layers.live,1);
 assert.equal(current.capabilities.currentBottleAvailability,true);
 assert.equal(futureCoverage([...first.projection.drops,...first.projection.drops]).scope.inventoryMonitoredStores,1,'SKU or duplicate rows cannot inflate physical stores');
 assert.equal(futureCoverage(first.projection.drops.map(row=>({...row,stale:true,canAlertAsInventory:false,canAlertAsWatch:false}))).scope.inventoryMonitoredStores,0);
 const unknown=build(assemble(f,first.projection,'omitted_first_page',1000));
  assert.equal(futureCoverage(unknown.projection.drops).scope.inventoryMonitoredStores,0);
 const descriptor=assemble(f).source;
 const withdrawn=validatePollPolicy([{source_id:descriptor.id,projection:first.projection}],[descriptor],{byId:new Map(),byState:{NV:{byId:new Map()}}},{states:[]},'','current');
 assert.equal(futureCoverage(withdrawn[0].projection.drops).scope.inventoryMonitoredStores,0,'current canonical withdrawal invalidates persisted overlay before coverage');
});



test('Arizona1749 three actually limited bindings pass unchanged normal customer classification and coverage; current authority withdrawal denies consumption',()=>{
 const full=fixtures.find(f=>f.state==='AZ');
 const eligibleNames=new Set(['Wild Turkey Rare Breed Straight Bourbon','Blade and Bow Bourbon','Penelope Four Grain Bourbon']);
 const selected={...full,products:full.products.filter(entry=>eligibleNames.has(entry.expected.canonicalName))};
 assert.equal(selected.products.length,3);
 const input=assemble(selected),source=input.source;
 for(const row of input.result.observations){row.sourceChain=source.chain;row.sourceLabel=source.sourceLabel;const classified=customer.classifyPublicDrop({...row,canonicalId:row.canonicalBottleId,bottleName:row.canonicalName,type:row.eventType},index);assert.equal(classified.tier,'limited');row.tier=classified.tier;input.ctx.lookup.byId.get(row.canonicalBottleId).tier=classified.tier;}
 input.groceryPolicy=createGroceryXapiPolicy({descriptors:[source],lookup:input.ctx.lookup,policySnapshotId:'current',enabledSourceIds:[source.id],now:integrationNow});
 const result=build(input);
 assert.equal(result.drops.length,3);
 const normalized=result.drops.map(row=>customer.normalizePublicDropEvidenceInput(customer.classifyPublicDrop(customer.normalizeDropForSite(row),index)));
 assert(normalized.every(row=>row.tier==='limited' && customer.isPublicDropFeedEligible(row)));
 assert.equal(coverage(result.projection.drops,index,'AZ').scope.inventoryMonitoredStores,1);
 const consume=(registry,lookup=input.ctx.lookup)=>validateGroceryXapiRows(result.projection.drops,registry,lookup,{states:[]},'','current');
 assert.equal(coverage(consume([source]),index,'AZ').scope.inventoryMonitoredStores,1);
 const unregistered=consume([]),disabled=consume([{...source,disabled:true}]);
 const [expiredSource]=compileGroceryXapiDescriptors({definitions:[source.definition],admissions:[{...source.admission,expiresAt:'2026-10-25T09:40:00.000Z'}],runtimeVersion:source.runtimeVersion,runtimeSha256:source.runtimeSha256});
 const expired=consume([expiredSource]);
 const withdrawn=consume([source],{byId:new Map(),byState:{AZ:{byId:new Map()}}});
 for(const denied of [unregistered,disabled,expired,withdrawn]){assert(denied.every(row=>row.stale===true && row.canAlertAsInventory===false));assert.equal(coverage(denied,index,'AZ').scope.inventoryMonitoredStores,0);}
 const reserves=fixtures.filter(f=>f.state!=='AZ').map(f=>({sourceId:f.sourceId,rawPositiveBindings:f.products.length,defaultFeedEligibleBindings:0,normalCoverageStores:coverage(build(assemble(f)).drops,index,f.state).scope.inventoryMonitoredStores}));
 assert(reserves.every(row=>row.normalCoverageStores===0));
 if(process.env.XAPI_POSTCOMPAT_AUDIT_OUTPUT)writeFileSync(process.env.XAPI_POSTCOMPAT_AUDIT_OUTPUT,JSON.stringify({scope:'Offline replay with synthetic admission and fresh runtime clocks. Historical capturedAt unchanged. Actual generated classification and unchanged Arizona public identity guard used. No HTTP, production admission, deployment, current-stock or newly delivered customer-store claim.',classificationVersion:index.version,sourceId:source.id,storeId:source.definition.premise.storeId,capturedAt:full.source.capturedAt,simulatedObservedAt:input.result.observations[0].observedAt,eligibleBindings:normalized.map(row=>({canonicalBottleId:row.canonicalId,canonicalName:row.canonicalName,tier:row.tier,productId:row.productId,variantId:row.variantId,defaultFeedEligible:customer.isPublicDropFeedEligible(row)})),normalCoverageStores:1,consumptionDenial:{unregistered:0,disabled:0,expired:0,currentCanonicalWithdrawn:0},regularCaNvFeasibilityReserves:reserves,productionActivated:false,productionUsefulNewStoreCount:0},null,2));
});

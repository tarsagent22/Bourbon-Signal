import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {STATE_LIFECYCLE_CONFIG} from './state-lifecycle.mjs';
import {ACTIVE_RESEARCH_RENEWAL_STATES} from './active-research-renewal.mjs';
import {westernGroceryPromotionAllowed} from './collectors/western-grocery-production.mjs';
import {centralCityHiveProductionAllowed} from './collectors/central-cityhive-production.mjs';
import {westernGroceryCohortKey} from './western-grocery-production-config.mjs';
import {centralCityHiveProductionCohortKey} from './central-cityhive-production-config.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {parseCityHiveProducts,cityHiveNativeProductArrays,normalizeCityHivePremises} from './collectors/cityhive-surfaces.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES,WESTERN_GROCERY_RESOLVER_ZIPS} from './collectors/western-grocery-premises.mjs';
import {groceryExpansionPremiseMatches,isGroceryExpansionEmptySearch,parseGroceryExpansionInventory} from './collectors/grocery-xapi-expansion.mjs';
import {arizonaXapiLibraryQueryAssignments} from './collectors/arizona-xapi.mjs';
import {librarySearchPool} from './library-query-plan.mjs';

const protocol='bourbon-signal/active-four-renewal-capture@1',sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const closed=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const canonical=value=>{const url=new URL(value);url.searchParams.sort();return url.href;};
const grocery=state=>['WA','NM'].includes(state),sourcesFor=state=>grocery(state)?WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state):CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===state);
const cohort=state=>grocery(state)?westernGroceryCohortKey(state):centralCityHiveProductionCohortKey(state);
const verifiedAudits=new WeakSet(),verifiedZeroReports=new WeakMap();
const maintenanceKeys=['schemaVersion','mode','repository','workflowId','workflowPath','workflowState','workflowRunId','checkedAt','checkedStatuses','activeProductionRunCount','productionReenableAllowed','researchCachesVisibleToMain','reenableRequirement'];
const proofKeys=['schemaVersion','protocol','state','sourceHead','workflowRunId','sourceArtifactDigest','cohortSha256','storeIds','positiveStoreIds','rawQualifiedRows','candidateRows','receiptCount','rawReceiptDigest','sourceReceiptsDigest','maintenance','maintenanceDigest','observedFrom','observedThrough','payloadDigest'];
function authority(state,lifecycle){assert.ok(ACTIVE_RESEARCH_RENEWAL_STATES.includes(state),'Only the admitted active four may renew');assert.ok((grocery(state)?westernGroceryPromotionAllowed:centralCityHiveProductionAllowed)(state,lifecycle),'Current reviewed production semantic authority is required');}
function maintenanceValid(value,origin,startedAt){
 assert.ok(closed(value,maintenanceKeys),'Unknown or missing native maintenance proof field');
 assert.equal(value.schemaVersion,1);assert.equal(value.mode,'root_mediated_production_maintenance');assert.equal(value.repository,'tarsagent22/Bourbon-Signal');
 assert.equal(value.workflowPath,'.github/workflows/refresh-feed.yml');assert.equal(value.workflowState,'disabled_manually');assert.ok(Number.isSafeInteger(value.workflowId)&&value.workflowId>0);
 assert.equal(value.workflowRunId,String(origin.workflowRunId));assert.deepEqual(value.checkedStatuses,['queued','in_progress','requested','waiting','pending']);assert.equal(value.activeProductionRunCount,0);
 assert.equal(value.productionReenableAllowed,false);assert.equal(value.researchCachesVisibleToMain,false);assert.ok(typeof value.reenableRequirement==='string'&&value.reenableRequirement.includes('Root reviews'));
 const lag=Date.parse(startedAt)-Date.parse(value.checkedAt);assert.ok(Number.isFinite(lag)&&lag>=-5000&&lag<=60_000,'Maintenance must be the actual just-before-source observation');
}
function nativeCityHiveShape(html,source){
 assert.ok(!/<title[^>]*>[^<]*(?:access denied|just a moment)|cf-chl-|\/cdn-cgi\/challenge-platform|verify you are human/i.test(html),'Challenge is not negative inventory');
 const arrays=cityHiveNativeProductArrays(html);assert.ok(arrays.length&&arrays.length<=8,'Native product array is required');
 let merchantCount=0,selectedNativeMerchant=false;
 for(const products of arrays){assert.ok(products.length<=1000);for(const product of products){
  assert.ok(product&&typeof product.id==='string'&&product.id&&typeof product.name==='string'&&product.name&&Array.isArray(product.merchants),'Malformed native product');
  for(const merchant of product.merchants){assert.ok(merchant&&typeof merchant.merchant_id==='string'&&Array.isArray(merchant.product_options),'Malformed native merchant offers');merchantCount++;
   if(merchant.merchant_id===source.merchantId){assert.equal(normalizeCityHivePremises(merchant.full_address),normalizeCityHivePremises(source.address),'Native merchant offers must retain the exact premise');selectedNativeMerchant=true;}
   for(const option of merchant.product_options){assert.ok(option&&typeof option.product_id==='string'&&option.product_id&&typeof option.option_id==='string'&&option.option_id&&option.merchant_id===merchant.merchant_id,'Ambiguous product option');
    if(merchant.merchant_id===source.merchantId){const url=new URL(option.product_url),parts=url.pathname.split('/').filter(Boolean),query=[...url.searchParams];
     assert.ok(url.origin===new URL(source.baseUrl).origin&&!url.username&&!url.password&&!url.hash&&parts.length===4&&parts[0]==='shop'&&parts[1]==='product'&&parts[3]===option.product_id&&query.length===1&&query[0][0]==='option-id'&&query[0][1]===option.option_id,'Option URL must prove its exact child product and option identity');
     assert.equal(normalizeCityHivePremises(option.full_address),normalizeCityHivePremises(source.address),'A selected option must retain the exact registered premise even at zero quantity');
     if(Number(option.quantity)>0)assert.ok(Number.isFinite(Number(option.price))&&Number(option.price)>0&&typeof option.option_display_data?.name==='string'&&option.option_display_data.name,'A positive native offer with missing price/title is ambiguous, not a negative');}
    assert.ok((typeof option.quantity==='number'||typeof option.quantity==='string'&&/^\d+(?:\.\d+)?$/.test(option.quantity))&&Number.isFinite(Number(option.quantity))&&Number(option.quantity)>=0,'Unknown native availability');
   }
  }
 }}
 assert.ok(merchantCount===0||selectedNativeMerchant,'A foreign-merchant product payload is not a selected-store negative');
 let exact=false;parseCityHiveProducts(html,source,{sources:CENTRAL_CITYHIVE_EXPANSION_SOURCES,isAllowedMerchantConfiguration:()=>{exact=true;return true;}});assert.ok(exact,'Exact registered premise is required, including for zero stock');
}

// Reads every original captured body. metadata.complete and a fabricated empty
// signals array cannot establish a negative. No request, fallback or cache read
// is performed, and only this successful replay marks a report as trusted zero.
export async function verifyActiveRenewalRawCaptures({state,report,reportDirectory,bible,lifecycle=STATE_LIFECYCLE_CONFIG,nowMs=Date.now()}={}){
 authority(state,lifecycle);assert.equal(report?.state,state);assert.equal(report.stale,false);assert.equal(report.metadata?.complete,true);
 const metadata=report.metadata,marker=metadata.manualActiveRenewal,origin=metadata.origin;
 assert.equal(marker?.schemaVersion,1);assert.equal(marker.state,state);assert.equal(marker.authority,'research_only_no_production_activation');
 assert.ok(Object.keys(marker).every(key=>['schemaVersion','state','authority','maintenance','batchMaintenance'].includes(key)),'Unknown renewal marker field');
 assert.equal(metadata.shadowOnly,true);assert.equal(metadata.productionActivationAllowed,false);assert.equal(metadata.customerDeliveryAllowed,false);
 assert.equal(origin?.kind,'github_actions');assert.equal(origin.repository,'tarsagent22/Bourbon-Signal');assert.match(String(origin.workflowRunId),/^\d+$/);assert.match(origin.commitSha,/^[a-f0-9]{40}$/);
 assert.equal(metadata.bibleRecordsSha256,sha(bible.records),'The query profile must bind the captured full current library');
 maintenanceValid(marker.maintenance,origin,report.startedAt);
 assert.ok(!report.roadblocks?.length&&report.sources?.length&&report.sources.every(source=>source.ok===true&&source.status===200));
 assert.ok(report.sourceResults?.length&&report.sourceResults.every(source=>source.ok===true));
 assert.ok(Array.isArray(report.signals)&&report.signals.every(row=>!row.stale&&!row.sourceStale&&!row.raw?.staleFallback&&!row.raw?.sourceRuntimeNonAlertable&&row.raw?.shadowOnly===true));
 const started=Date.parse(report.startedAt),finished=Date.parse(report.finishedAt);assert.ok(Number.isFinite(started)&&finished>=started&&nowMs>=finished&&nowMs-finished<=2*60*60_000);
 const sources=sourcesFor(state),receipts=metadata.receipts;assert.ok(Array.isArray(receipts)&&receipts.length===(grocery(state)?(state==='WA'?127:43):sources.length*5),'Complete closed query profile is required');
 assert.ok(Array.isArray(metadata.requests)&&metadata.requests.length===receipts.length);
 assert.deepEqual(metadata.selectedStores,sources.map(source=>source.storeId));assert.deepEqual([...metadata.verifiedPremises].sort(),sources.map(source=>source.storeId).sort());
 const allowedIds=new Set(sources.map(source=>source.id));assert.ok(metadata.sourceAttempts&&Object.keys(metadata.sourceAttempts).length===sources.length);
 for(const[id,attempt]of Object.entries(metadata.sourceAttempts)){assert.ok(allowedIds.has(id)&&['success','no_qualified_inventory'].includes(attempt.status)&&(!attempt.httpStatus||attempt.httpStatus===200)&&!attempt.inFlight,'Source attempts include a hold or unresolved observation');}
 const seen=new Set(),paths=new Set(),captures=[],rows=new Map(),resolver=new Map(),resolverZips=new Set();
 for(const[at,receipt]of receipts.entries()){
  const clock=Date.parse(receipt.observedAt);assert.ok(Number.isFinite(clock)&&clock>=started&&clock<=finished&&clock<=nowMs&&nowMs-clock<=2*60*60_000,'Original receipt clock must be current');
  assert.ok((grocery(state)?[200,206]:[200]).includes(receipt.status)&&Number.isSafeInteger(receipt.bytes)&&receipt.bytes>0&&receipt.bytes<=(grocery(state)?4:2)*1024*1024);
  const url=new URL(receipt.url);assert.ok(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&canonical(receipt.finalUrl)===canonical(url)&&!seen.has(canonical(url)));
  seen.add(canonical(url));assert.equal(canonical(metadata.requests[at].url),canonical(url));assert.equal(metadata.requests[at].status,receipt.status);assert.equal(metadata.requests[at].ok,true);
  assert.ok(typeof receipt.artifactPath==='string'&&new RegExp('^source-captures/[A-Za-z0-9._-]+\\.'+(grocery(state)?'json':'html')+'$').test(receipt.artifactPath)&&!paths.has(receipt.artifactPath));paths.add(receipt.artifactPath);
  const body=await readFile(path.join(reportDirectory,receipt.artifactPath));assert.equal(body.length,receipt.bytes);assert.equal(sha(body),receipt.sha256);
  if(grocery(state)){
   const payload=JSON.parse(body);if(url.pathname==='/abs/pub/xapi/storeresolver/v2/all'){
    const zip=url.searchParams.get('zipcode');assert.ok(url.hostname==='www.safeway.com'&&WESTERN_GROCERY_RESOLVER_ZIPS[state].includes(zip)&&url.searchParams.get('radius')==='50'&&url.searchParams.get('size')==='100'&&!resolverZips.has(zip)&&Array.isArray(payload.instore?.stores));resolverZips.add(zip);
    for(const store of payload.instore.stores){const id=String(store.locationId),identity=value=>[value.polarisBannerName,value.domainName,value.address];if(resolver.has(id))assert.deepEqual(identity(resolver.get(id)),identity(store),'Conflicting resolver premise');else resolver.set(id,store);}
   }else{
    const source=sources.find(source=>source.host===url.hostname&&source.merchantId===url.searchParams.get('storeid')&&source.banner===url.searchParams.get('banner'));
    assert.ok(source&&url.pathname==='/abs/pub/xapi/search/substitute'&&url.searchParams.get('channel')==='instore'&&url.searchParams.get('rows')==='100'&&url.searchParams.get('start')==='0');
    assert.notEqual(payload.appCode,'GR200 :: A-CT: 408','A native backend timeout cannot establish complete positive or negative inventory');
    const docs=payload.response?.docs;
    if(Array.isArray(docs)&&docs.length){assert.ok(docs.length<=100&&docs.every(product=>product&&typeof product.name==='string'&&product.name&&String(product.id)===String(product.pid)&&/^\d+$/.test(String(product.id))&&String(product.storeId)===source.merchantId&&typeof product.containsAlcohol==='boolean'&&product.channelEligibility&&product.channelInventory),'Malformed native grocery product');}
    else assert.ok(isGroceryExpansionEmptySearch(payload,source,url.searchParams.get('q'),{httpStatus:receipt.status}),'Unrecognized or ambiguous grocery empty response');
    captures.push({source,term:url.searchParams.get('q')});for(const row of parseGroceryExpansionInventory(payload,source,bible,{observedAt:receipt.observedAt}))rows.set(row.id,row);
   }
  }else{
   const source=sources.find(source=>source.hostname===url.hostname);assert.ok(source&&url.pathname==='/shop/'&&url.searchParams.get('merchant-id')===source.merchantId);
   const html=body.toString('utf8');nativeCityHiveShape(html,source);captures.push({source,url});for(const row of parseCentralCityHiveInventory(html,source,bible,{observedAt:receipt.observedAt}))rows.set(row.id,row);
  }
 }
 const pool=new Set(librarySearchPool(bible));
 if(grocery(state)){
  assert.equal(resolverZips.size,WESTERN_GROCERY_RESOLVER_ZIPS[state].length);for(const source of sources)assert.ok(groceryExpansionPremiseMatches(source,resolver.get(source.merchantId)));
  const plan=metadata.librarySearchPlan;assert.equal(plan?.schemaVersion,1);assert.equal(plan.sourceKey,state+':grocery-xapi-expansion');assert.equal(plan.budget,8);assert.equal(plan.terms?.length,8);assert.equal(new Set(plan.terms).size,8);assert.ok(plan.terms.every(term=>pool.has(term)));assert.equal(plan.poolSize,pool.size);
  const expected=sources.flatMap(source=>['bourbon','whiskey'].map(term=>source.id+'|'+term));for(const assignment of arizonaXapiLibraryQueryAssignments(sources.length,plan))expected.push(sources[assignment.storeIndex].id+'|'+assignment.term);
  assert.deepEqual(captures.map(({source,term})=>source.id+'|'+term).sort(),expected.sort());
 }else for(const source of sources){
  const scoped=captures.filter(capture=>capture.source===source),queries=scoped.filter(capture=>capture.url.searchParams.has('ch-query')).map(capture=>capture.url.searchParams.get('ch-query'));
  assert.equal(scoped.length,5);assert.equal(queries.length,4);assert.equal(new Set(queries).size,4);assert.ok(scoped.some(capture=>canonical(capture.url)===canonical(source.categoryUrl)));
  const priority=state==='WI'?['michter','barrel proof']:['barrel proof','eagle rare','weller'];assert.ok(priority.every(term=>queries.includes(term)));assert.ok(queries.every(term=>priority.includes(term)||pool.has(term)));
 }
 const audit={state,rows:[...rows.values()],receipts,maintenance:marker.maintenance,origin,observedFrom:receipts.map(row=>row.observedAt).sort()[0],observedThrough:receipts.map(row=>row.observedAt).sort().at(-1)};
 if(!audit.rows.length)assert.equal(report.signals.length,0,'A negative capture must not carry a fabricated or backfilled positive report row');
 verifiedAudits.add(audit);if(!audit.rows.length)verifiedZeroReports.set(report,{audit,reportDigest:sha(report)});return audit;
}
export function isVerifiedActiveRenewalNegativeReport(report){const prior=verifiedZeroReports.get(report);return Boolean(prior&&prior.reportDigest===sha(report));}
const payloadDigest=candidate=>sha({state:candidate.state,generatedAt:candidate.generatedAt,drops:candidate.drops,locations:candidate.locations,sourceReceipts:candidate.sourceReceipts,workflowSource:candidate.workflowSource});
export function attachActiveRenewalCanaryProof(candidate,audit){
 assert.ok(verifiedAudits.has(audit)&&candidate.state===audit.state);const source=candidate.workflowSource;
 assert.equal(source?.status,'verified_github_shadow_artifact');assert.equal(source.headSha,audit.origin.commitSha);assert.equal(source.currentHead,source.headSha,'Active renewal requires the exact frozen source head');assert.equal(source.workflowRunId,String(audit.origin.workflowRunId));assert.match(source.artifactDigest,/^[a-f0-9]{64}$/);
 assert.ok(candidate.drops.every(row=>audit.rows.some(raw=>raw.storeId===row.storeId&&raw.canonicalBottleId===row.canonicalBottleId
  &&raw.productId===(row.productId||row.sourceProductBinding?.productId)
  &&(raw.optionId||raw.variantId)===(row.optionId||row.variantId||row.sourceProductBinding?.optionId||row.sourceProductBinding?.variantId)
  &&raw.observedAt===row.observedAt)),'Candidate product/option/store must come from the exact raw reparse');
 if(!candidate.drops.length)assert.equal(audit.rows.length,0,'Positive source rows cannot be hidden as a complete negative');
 const proof={schemaVersion:1,protocol,state:candidate.state,sourceHead:source.headSha,workflowRunId:source.workflowRunId,sourceArtifactDigest:source.artifactDigest,
  cohortSha256:cohort(candidate.state),storeIds:sourcesFor(candidate.state).map(source=>source.storeId),positiveStoreIds:[...new Set(candidate.drops.map(row=>row.storeId))].sort(),
  rawQualifiedRows:audit.rows.length,candidateRows:candidate.drops.length,receiptCount:audit.receipts.length,rawReceiptDigest:sha(audit.receipts),sourceReceiptsDigest:sha(candidate.sourceReceipts),
  maintenance:audit.maintenance,maintenanceDigest:sha(audit.maintenance),observedFrom:audit.observedFrom,observedThrough:audit.observedThrough,payloadDigest:payloadDigest(candidate)};
 return{...candidate,activeRenewalProof:proof};
}
export function isVerifiedActiveRenewalCanary(candidate,{lifecycle=STATE_LIFECYCLE_CONFIG,nowMs=Date.now()}={}){
 try{const proof=candidate?.activeRenewalProof;assert.ok(closed(proof,proofKeys));authority(candidate.state,lifecycle);assert.equal(proof.schemaVersion,1);assert.equal(proof.protocol,protocol);assert.equal(proof.state,candidate.state);
  assert.equal(candidate.schemaVersion,1);assert.equal(candidate.scope,'isolated_canary_input_no_production_activation');assert.equal(candidate.originalSourceClockPreserved,true);
  assert.equal(proof.sourceHead,candidate.workflowSource.headSha);assert.equal(candidate.workflowSource.currentHead,proof.sourceHead);assert.equal(candidate.workflowSource.state,candidate.state);assert.equal(proof.workflowRunId,candidate.workflowSource.workflowRunId);assert.equal(proof.sourceArtifactDigest,candidate.workflowSource.artifactDigest);assert.match(candidate.workflowSource.artifactId,/^\d+$/);assert.equal(candidate.workflowSource.status,'verified_github_shadow_artifact');assert.equal(candidate.workflowSource.repository,'tarsagent22/Bourbon-Signal');assert.match(proof.sourceHead,/^[a-f0-9]{40}$/);assert.match(proof.workflowRunId,/^\d+$/);assert.match(proof.sourceArtifactDigest,/^[a-f0-9]{64}$/);
  assert.equal(proof.cohortSha256,cohort(candidate.state));assert.deepEqual(proof.storeIds,sourcesFor(candidate.state).map(source=>source.storeId));assert.deepEqual(candidate.locations.map(row=>row.storeId),proof.storeIds);assert.deepEqual(proof.positiveStoreIds,[...new Set(candidate.drops.map(row=>row.storeId))].sort());assert.equal(proof.candidateRows,candidate.drops.length);assert.ok(Number.isSafeInteger(proof.rawQualifiedRows)&&proof.rawQualifiedRows>=candidate.drops.length);if(!candidate.drops.length)assert.equal(proof.rawQualifiedRows,0);
  for(const location of candidate.locations){const source=sourcesFor(candidate.state).find(source=>source.storeId===location.storeId);assert.equal(location.state,candidate.state);assert.equal(location.storeAddress,source.address);assert.equal(location.city,source.city);assert.equal(location.storeName,source.name);}
  assert.equal(proof.receiptCount,candidate.sourceReceipts.length);assert.equal(proof.receiptCount,grocery(candidate.state)?(candidate.state==='WA'?127:43):sourcesFor(candidate.state).length*5);assert.match(proof.rawReceiptDigest,/^[a-f0-9]{64}$/);assert.equal(proof.sourceReceiptsDigest,sha(candidate.sourceReceipts));assert.equal(proof.maintenanceDigest,sha(proof.maintenance));assert.equal(proof.payloadDigest,payloadDigest(candidate));
  assert.equal(proof.observedFrom,candidate.sourceReceipts.map(row=>row.observedAt).sort()[0]);assert.equal(proof.observedThrough,candidate.sourceReceipts.map(row=>row.observedAt).sort().at(-1));
  maintenanceValid(proof.maintenance,{workflowRunId:proof.workflowRunId},proof.observedFrom);const first=Date.parse(proof.observedFrom),last=Date.parse(proof.observedThrough),generated=Date.parse(candidate.generatedAt);assert.ok(Number.isFinite(first)&&last>=first&&generated>=last&&nowMs>=generated&&nowMs-first<=2*60*60_000);
  return true;
 }catch{return false;}
}

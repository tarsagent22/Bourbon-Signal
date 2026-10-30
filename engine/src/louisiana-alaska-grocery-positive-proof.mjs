import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {LOUISIANA_ALASKA_GROCERY_SOURCES as allSources,LOUISIANA_ALASKA_RESOLVER_ZIPS} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {classifyLouisianaAlaskaQuery,hasLouisianaAlaskaPositiveEvidenceOnly,louisianaAlaskaGroceryPremiseMatches,parseLouisianaAlaskaGroceryInventory} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {librarySearchPool} from './library-query-plan.mjs';
import {arizonaXapiLibraryQueryAssignments} from './collectors/arizona-xapi.mjs';
import {isLouisianaAlaskaGroceryInventory,louisianaAlaskaGroceryLibraryTier} from './louisiana-alaska-grocery-policy.mjs';
const sha=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const verifiedReports=new WeakMap(),canonical=value=>{const u=new URL(value);u.searchParams.sort();return u.href;};

// A positive-only query profile grants no empty-store or negative authority.
// Every original receipt and every separately positive product is reparsed.
export async function verifyLouisianaAlaskaPositiveCaptures({state,report,reportDirectory,bible,nowMs=Date.now()}={}){
 assert.equal(state,'LA');assert.equal(report.state,state);assert.equal(report.stale,false);
 const m=report.metadata,sources=allSources.filter(s=>s.stateCode===state),ids=sources.map(s=>s.storeId);
 assert.equal(m.origin?.kind,'github_actions');assert.equal(m.origin.repository,'tarsagent22/Bourbon-Signal');assert.match(String(m.origin.workflowRunId),/^\d+$/);assert.match(m.origin.commitSha,/^[a-f0-9]{40}$/);
 assert.ok(hasLouisianaAlaskaPositiveEvidenceOnly(m,report.signals,state),'Explicit positive-only scope with independently positive rows is required');
 assert.equal(m.shadowOnly,true);assert.equal(m.productionActivationAllowed,false);assert.equal(m.customerDeliveryAllowed,false);
 assert.equal(m.bibleRecordsSha256,sha(bible.records),'Full original library must bind the query profile');
 assert.ok(!report.roadblocks.length&&report.sources.length&&report.sources.every(s=>s.ok===true)&&report.sourceResults.every(s=>s.ok===true));
 const started=Date.parse(report.startedAt),finished=Date.parse(report.finishedAt);
 assert.ok(Number.isFinite(started)&&finished>=started&&finished<=nowMs&&nowMs-started<=2*60*60_000);
 assert.deepEqual(m.selectedStores,ids);assert.deepEqual([...m.verifiedPremises].sort(),[...ids].sort());
 const receipts=m.receipts;assert.equal(receipts.length,43);assert.equal(m.requests.length,43);
 const resolver=new Map(),zips=new Set(),urls=new Set(),paths=new Set(),queries=[],evidence=[],rows=new Map(),collectorRows=new Map();
 for(const[index,receipt]of receipts.entries()){
  const clock=Date.parse(receipt.observedAt);assert.ok(clock>=started&&clock<=finished&&clock<=nowMs&&nowMs-clock<=2*60*60_000);
  assert.ok([200,206].includes(receipt.status)&&Number.isSafeInteger(receipt.bytes)&&receipt.bytes>0&&receipt.bytes<=4*1024*1024);
  const u=new URL(receipt.url);assert.ok(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&canonical(u)===canonical(receipt.finalUrl)&&!urls.has(canonical(u)));urls.add(canonical(u));
  assert.equal(canonical(m.requests[index].url),canonical(u));assert.equal(m.requests[index].status,receipt.status);assert.equal(m.requests[index].ok,true);
  assert.match(receipt.artifactPath,/^source-captures\/[A-Za-z0-9._-]+\.json$/);assert.ok(!paths.has(receipt.artifactPath));paths.add(receipt.artifactPath);
  const body=await readFile(path.join(reportDirectory,receipt.artifactPath));assert.equal(body.length,receipt.bytes);assert.equal(sha(body),receipt.sha256);const payload=JSON.parse(body);
  if(u.pathname==='/abs/pub/xapi/storeresolver/v2/all'){
   const zip=u.searchParams.get('zipcode');assert.ok(u.hostname==='www.safeway.com'&&LOUISIANA_ALASKA_RESOLVER_ZIPS.LA.includes(zip)&&u.searchParams.get('radius')==='50'&&u.searchParams.get('size')==='100'&&!zips.has(zip)&&Array.isArray(payload.instore?.stores));zips.add(zip);
   for(const store of payload.instore.stores){const id=String(store.locationId),identity=s=>[s.polarisBannerName,s.domainName,s.address];if(resolver.has(id))assert.deepEqual(identity(store),identity(resolver.get(id)));else resolver.set(id,store);}
  }else{
   const source=sources.find(s=>s.host===u.hostname&&s.merchantId===u.searchParams.get('storeid')&&s.banner===u.searchParams.get('banner'));
   assert.ok(source&&u.pathname==='/abs/pub/xapi/search/substitute'&&u.searchParams.get('channel')==='instore'&&u.searchParams.get('rows')==='100'&&u.searchParams.get('start')==='0');
   const term=u.searchParams.get('q'),disposition=classifyLouisianaAlaskaQuery(payload,source,term,{httpStatus:receipt.status});assert.notEqual(disposition,'INVALID','Malformed, timed-out or unknown source payload cannot qualify');
   queries.push(source.id+'|'+term);evidence.push({sourceId:source.id,storeId:source.storeId,merchantId:source.merchantId,term,url:receipt.url,httpStatus:receipt.status,disposition,bodySha256:receipt.sha256});
   for(const row of parseLouisianaAlaskaGroceryInventory(payload,source,bible,{observedAt:receipt.observedAt}))rows.set(row.id,row);
   for(const row of parseLouisianaAlaskaGroceryInventory(payload,source,bible,{observedAt:report.startedAt}))collectorRows.set(row.id,[...(collectorRows.get(row.id)||[]),row]);
  }
 }
 assert.equal(zips.size,LOUISIANA_ALASKA_RESOLVER_ZIPS.LA.length);for(const source of sources)assert.ok(louisianaAlaskaGroceryPremiseMatches(source,resolver.get(source.merchantId)));
 const plan=m.librarySearchPlan,pool=new Set(librarySearchPool(bible));assert.equal(plan.schemaVersion,1);assert.equal(plan.sourceKey,'LA:grocery-xapi-expansion');assert.equal(plan.budget,8);assert.equal(plan.terms.length,8);assert.equal(new Set(plan.terms).size,8);assert.equal(plan.poolSize,pool.size);assert.ok(plan.terms.every(term=>pool.has(term)));
 const expected=sources.flatMap(s=>['bourbon','whiskey'].map(term=>s.id+'|'+term));for(const assignment of arizonaXapiLibraryQueryAssignments(sources.length,plan))expected.push(sources[assignment.storeIndex].id+'|'+assignment.term);assert.deepEqual(queries.sort(),expected.sort());
 const unconfirmed=evidence.filter(q=>q.disposition==='UNCONFIRMED_EMPTY_QUERY');assert.ok(unconfirmed.length>0);assert.deepEqual(m.queryEvidence,evidence);assert.deepEqual(m.unconfirmedNegativeQueries,unconfirmed);assert.equal(m.unconfirmedNegativeQueryCount,unconfirmed.length);assert.equal(m.confirmedEmptyQueryCount,evidence.filter(q=>q.disposition==='CONFIRMED_EMPTY').length);
 assert.ok(rows.size>0,'Unconfirmed queries plus all-zero source rows cannot qualify');
 for(const row of report.signals){const {shadowOnly,...proof}=row.sourceProductBinding||{},raw=collectorRows.get(row.id)?.find(raw=>sha(proof)===sha(raw.sourceProductBinding));assert.ok(raw&&row.observedAt===report.startedAt&&row.raw?.shadowOnly===true&&shadowOnly===true&&isLouisianaAlaskaGroceryInventory(row)
  &&row.stale!==true&&row.sourceStale!==true&&row.quarantined!==true&&!row.raw?.staleFallback&&!row.raw?.sourceRuntimeNonAlertable&&!row.raw?.cacheFallback);
  for(const key of ['productId','storeId','canonicalBottleId','canonicalName','price','quantity','quantityIsExact','inventorySemantics'])assert.deepEqual(row[key],raw[key],'Report positive differs from immutable raw '+key);
  assert.deepEqual(JSON.parse(JSON.stringify(proof)),JSON.parse(JSON.stringify(raw.sourceProductBinding)),'Report positive native binding differs from raw');
  assert.deepEqual(row.raw.product,JSON.parse(JSON.stringify(raw.raw.product)));assert.equal(row.tier,louisianaAlaskaGroceryLibraryTier(raw,bible));
  for(const key of ['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'])assert.equal(row[key],false);
 }
 const summary={schemaVersion:1,profileScope:'POSITIVE_EVIDENCE_ONLY',requestProfileComplete:true,negativeComplete:false,unconfirmedNegativeQueryCount:unconfirmed.length,unconfirmedNegativeQueries:unconfirmed,confirmedEmptyQueryCount:m.confirmedEmptyQueryCount,receiptCount:receipts.length,rawReceiptDigest:sha(receipts),qualifiedPositiveRows:rows.size,positiveStoreIds:[...new Set([...rows.values()].map(row=>row.storeId))].sort(),observedFrom:receipts.map(r=>r.observedAt).sort()[0],observedThrough:receipts.map(r=>r.observedAt).sort().at(-1)};
 const audit={rows:[...rows.values()],summary};verifiedReports.set(report,{digest:sha(report),summary:structuredClone(summary)});return audit;
}
export function verifiedLouisianaAlaskaPositiveReport(report){const prior=verifiedReports.get(report);return prior&&prior.digest===sha(report)?structuredClone(prior.summary):null;}

// Serialized positive profile checks convey a caveat only. They never grant
// empty-stock or renewal authority; source workflow preparation replays raw.
export function assertLouisianaAlaskaPositiveCanaryProfile(candidate){
 const p=candidate?.sourceQueryProfile;if(p==null)return null;
 const keys=['schemaVersion','profileScope','requestProfileComplete','negativeComplete','unconfirmedNegativeQueryCount','unconfirmedNegativeQueries','confirmedEmptyQueryCount','receiptCount','rawReceiptDigest','qualifiedPositiveRows','positiveStoreIds','observedFrom','observedThrough'];
 assert.deepEqual(Object.keys(p).sort(),keys.sort());assert.equal(candidate.state,'LA');assert.equal(candidate.originalSourceClockPreserved,true);
 assert.equal(p.schemaVersion,1);assert.equal(p.profileScope,'POSITIVE_EVIDENCE_ONLY');assert.equal(p.requestProfileComplete,true);assert.equal(p.negativeComplete,false);
 assert.equal(candidate.workflowSource?.state,'LA');assert.equal(candidate.workflowSource.status,'verified_github_shadow_artifact');assert.equal(candidate.workflowSource.headSha,candidate.workflowSource.currentHead);
 assert.match(candidate.workflowSource.artifactDigest,/^[a-f0-9]{64}$/);
 assert.ok(Number.isSafeInteger(p.unconfirmedNegativeQueryCount)&&p.unconfirmedNegativeQueryCount>0);assert.equal(p.unconfirmedNegativeQueries.length,p.unconfirmedNegativeQueryCount);
 assert.ok(p.unconfirmedNegativeQueryCount<=38&&Number.isSafeInteger(p.confirmedEmptyQueryCount)&&p.confirmedEmptyQueryCount>=0&&p.confirmedEmptyQueryCount+p.unconfirmedNegativeQueryCount<=38);
 assert.equal(p.receiptCount,43);assert.equal(candidate.sourceReceipts.length,43);assert.match(p.rawReceiptDigest,/^[a-f0-9]{64}$/);
 assert.ok(Number.isSafeInteger(p.qualifiedPositiveRows)&&p.qualifiedPositiveRows>=candidate.drops.length&&candidate.drops.length>0);
 const ids=allSources.filter(s=>s.stateCode==='LA').map(s=>s.storeId);assert.ok(p.positiveStoreIds.length>0&&new Set(p.positiveStoreIds).size===p.positiveStoreIds.length&&p.positiveStoreIds.every(id=>ids.includes(id))&&candidate.drops.every(r=>p.positiveStoreIds.includes(r.storeId)));
 assert.equal(new Set(p.unconfirmedNegativeQueries.map(q=>q.url)).size,p.unconfirmedNegativeQueries.length);
 for(const q of p.unconfirmedNegativeQueries){const source=allSources.find(s=>s.stateCode==='LA'&&s.id===q.sourceId&&s.storeId===q.storeId&&s.merchantId===q.merchantId),u=new URL(q.url);
  assert.deepEqual(Object.keys(q).sort(),['sourceId','storeId','merchantId','term','url','httpStatus','disposition','bodySha256'].sort());
  assert.ok(source&&u.origin===`https://${source.host}`&&u.pathname==='/abs/pub/xapi/search/substitute'&&u.searchParams.get('storeid')===source.merchantId&&u.searchParams.get('banner')===source.banner&&u.searchParams.get('channel')==='instore'&&u.searchParams.get('q')===q.term);
  assert.equal(q.disposition,'UNCONFIRMED_EMPTY_QUERY');assert.equal(q.httpStatus,200);assert.match(q.bodySha256,/^[a-f0-9]{64}$/);
  assert.ok(candidate.sourceReceipts.some(r=>r.url===q.url&&r.sha256===q.bodySha256));
 }
 assert.equal(p.observedFrom,candidate.sourceReceipts.map(r=>r.observedAt).sort()[0]);assert.equal(p.observedThrough,candidate.sourceReceipts.map(r=>r.observedAt).sort().at(-1));
 return structuredClone(p);
}

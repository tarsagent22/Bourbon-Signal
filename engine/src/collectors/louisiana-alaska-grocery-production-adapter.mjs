import { createHash, randomUUID } from 'node:crypto';
import akManifest from '../../data/state-integration/AK.json' with {type:'json'};
import laManifest from '../../data/state-integration/LA.json' with {type:'json'};
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectLouisianaAlaskaGrocery, hasLouisianaAlaskaPositiveEvidenceOnly } from './louisiana-alaska-grocery-expansion.mjs';
import { LOUISIANA_ALASKA_GROCERY_SOURCES, LOUISIANA_ALASKA_RESOLVER_ZIPS } from './louisiana-alaska-grocery-premises.mjs';
import {
  LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES,
  LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS,
  LOUISIANA_ALASKA_GROCERY_BUDGETS,
  louisianaAlaskaGroceryCohortKey,
  louisianaAlaskaGroceryRuntimeId,
} from '../louisiana-alaska-grocery-production-config.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../state-lifecycle.mjs';
import { evaluateStateControl, validateImmutablePromotionEvidence } from '../reliability-policy.mjs';
import { collectionSignal } from '../core/collection-context.mjs';
import { createSourceAdapter } from '../sources/source-adapter.mjs';
import { runSourceAdapters } from '../sources/source-runner.mjs';
import { summarizeSourceResult } from '../sources/source-result.mjs';
import {
  isLouisianaAlaskaGroceryInventory,
  louisianaAlaskaGroceryLibraryTier,
  toLouisianaAlaskaGroceryOnSiteSignal,
} from '../louisiana-alaska-grocery-policy.mjs';
import {
  fetchReviewedLouisianaAlaskaText,
  louisianaAlaskaRequestIdentity,
  persistLouisianaAlaskaIncidentJournal,
  validateLouisianaAlaskaIncidentJournal,
} from './louisiana-alaska-grocery-transport.mjs';

const DAY_MS = 86_400_000;
const DENIED = new Set([401, 403, 429, 435]);
const manifests={AK:akManifest,LA:laManifest};

function fail(message) { throw new Error(`Louisiana/Alaska production profile rejected: ${message}`); }
function unique(values) { return [...new Set(values)]; }
function sorted(values) { return [...values].sort(); }

export function louisianaAlaskaSourceConfigHash(state,manifest=manifests[state]){
  if(!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)||!manifest)throw new Error('Unreviewed Louisiana/Alaska promotion manifest');
  const config=Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]]));
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function louisianaAlaskaProductionAllowed(state,config=STATE_LIFECYCLE_CONFIG,{manifest=manifests[state],env=process.env}={}){
  const entry=config?.states?.[state],evidence=entry?.promotionEvidence;
  const policy={...config?.reliabilityPolicy?.promotionPolicy,
    minShadowRuns:Math.max(3,Number(config?.reliabilityPolicy?.promotionPolicy?.minShadowRuns)||3),
    minCanaryRuns:Math.max(2,Number(config?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns)||2)};
  const control=evaluateStateControl(state,env);
  return Boolean(LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)&&config?.activeStates?.includes(state)
    &&entry?.publicStatus==='active'&&entry?.lifecycle==='retailer_store_inventory'
    &&entry?.coverageTier==='sparse_live_store_inventory'&&entry?.refinementLevel==='store'
    &&entry?.promotionStage==='active'&&entry?.inventoryAlertable===false&&entry?.watchAlertable===false
    &&entry?.productionAdapter==='louisiana_alaska_grocery_onsite_v1'
    &&manifest?.schemaVersion===1&&manifest?.state===state&&manifest.lifecycle?.publicStatus==='active'
    &&manifest.lifecycle?.refinementLevel==='store'&&manifest.sourceSemantics?.inventoryAlertable===false&&manifest.sourceSemantics?.watchAlertable===false
    &&manifest.collector?.cohortSha256===louisianaAlaskaGroceryCohortKey(state)
    &&JSON.stringify(manifest.collector.sourceIds)===JSON.stringify([louisianaAlaskaGroceryRuntimeId(state)])
    &&Number(evidence?.shadowRuns)>=policy.minShadowRuns&&Number(evidence?.canaryRuns)>=policy.minCanaryRuns
    &&Number.isFinite(Date.parse(evidence?.verifiedAt||''))
    &&evidence.verticalSliceManifest===`engine/data/state-integration/${state}.json`
    &&evidence.fixtureContract===`engine/data/state-fixtures/${state}.json`
    &&control.collect&&control.publishCandidate&&validateImmutablePromotionEvidence(state,evidence,policy)
    &&evidence.immutableEvidence.provenance.repository==='tarsagent22/Bourbon-Signal'
    &&JSON.stringify(manifest.evidence?.immutablePromotionEvidence)===JSON.stringify(evidence.immutableEvidence)
    &&evidence.immutableEvidence.sourceConfigHash===louisianaAlaskaSourceConfigHash(state,manifest));
}

export function validateLouisianaAlaskaProductionResult(state, bible, result) {
  if (!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)) fail(`unreviewed state ${state}`);
  const sources = LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source => source.stateCode === state);
  const budget = LOUISIANA_ALASKA_GROCERY_BUDGETS[state];
  const metadata = result?.metadata;
  if (!sources.length || !budget || !Array.isArray(result?.signals) || !Array.isArray(result?.roadblocks) || !metadata) fail('malformed collector result');
  const closedProfile = metadata.complete === true && metadata.requestProfileComplete === true && metadata.negativeComplete === true
    && metadata.profileScope === 'COMPLETE_REVIEWED_PROFILE' && metadata.unconfirmedNegativeQueryCount === 0
    && Array.isArray(metadata.unconfirmedNegativeQueries) && metadata.unconfirmedNegativeQueries.length === 0;
  const positiveEvidenceOnly = !closedProfile && hasLouisianaAlaskaPositiveEvidenceOnly(metadata, result.signals, state);
  if (!closedProfile && !positiveEvidenceOnly) {
    fail('the complete closed positive and negative query profile is required');
  }
  if (metadata.maxRequestCount !== budget.maxRequests || !Array.isArray(metadata.requests)
    || metadata.requests.length !== budget.maxRequests) fail('request count does not match the reviewed closed profile');
  if (result.roadblocks.length !== 0) fail('collector reported a source roadblock');

  const expectedStores = sources.map(source => source.storeId);
  for (const [label, values] of [['selectedStores', metadata.selectedStores], ['verifiedPremises', metadata.verifiedPremises]]) {
    if (!Array.isArray(values) || values.length !== expectedStores.length
      || JSON.stringify(sorted(values)) !== JSON.stringify(sorted(expectedStores))) fail(`${label} does not equal the closed reviewed store cohort`);
  }

  const resolverRequests = metadata.requests.filter(request => request.kind === 'resolver');
  const inventoryRequests = metadata.requests.filter(request => request.kind === 'inventory');
  const expectedResolverZips = LOUISIANA_ALASKA_RESOLVER_ZIPS[state];
  if (!Array.isArray(expectedResolverZips) || resolverRequests.length !== expectedResolverZips.length
    || inventoryRequests.length !== budget.maxRequests - expectedResolverZips.length) fail('resolver or product-search request profile is incomplete');
  if (metadata.requests.some(request => request.ok !== true || ![200, 206].includes(Number(request.status)))) fail('a reviewed request failed');

  const actualResolverZips = resolverRequests.map(request => {
    if (louisianaAlaskaRequestIdentity(request.url) !== 'resolver') fail('unreviewed resolver request');
    return new URL(request.url).searchParams.get('zipcode');
  });
  if (JSON.stringify(sorted(actualResolverZips)) !== JSON.stringify(sorted(expectedResolverZips))) fail('resolver ZIP set drifted');

  const queryEvidence = metadata.queryEvidence;
  if (!Array.isArray(queryEvidence) || queryEvidence.length !== inventoryRequests.length) fail('query evidence does not cover every merchant search');
  const queryKeys = new Set();
  const positiveSearchStores = new Set();
  for (const request of inventoryRequests) {
    if (louisianaAlaskaRequestIdentity(request.url) !== 'inventory') fail('unreviewed product-search request');
    const source = sources.find(candidate => candidate.id === request.sourceId && candidate.merchantId === request.merchantId);
    if (!source || !request.term || request.term !== new URL(request.url).searchParams.get('q')) fail('merchant search escaped its reviewed premise');
    const evidence = queryEvidence.find(item => item.url === request.url && item.sourceId === source.id && item.term === request.term);
    if (!evidence || !/^[a-f0-9]{64}$/i.test(evidence.bodySha256 || '')
      || !(['BOUND_PRODUCTS', 'CONFIRMED_EMPTY'].includes(evidence.disposition)
        || (positiveEvidenceOnly && evidence.disposition === 'UNCONFIRMED_EMPTY_QUERY'))) {
      fail('merchant search is missing valid raw response classification');
    }
    if (evidence.disposition === 'BOUND_PRODUCTS') positiveSearchStores.add(source.storeId);
    queryKeys.add(`${source.id}|${request.term}`);
  }
  for (const source of sources) {
    if (!queryKeys.has(`${source.id}|bourbon`) || !queryKeys.has(`${source.id}|whiskey`)) fail(`base searches missing for ${source.storeId}`);
    const attempt = metadata.sourceAttempts?.[source.id];
    const expectedStatus = positiveEvidenceOnly && metadata.unconfirmedNegativeQueries.some(query => query.storeId === source.storeId)
      ? 'positive_evidence_only' : 'success';
    if (attempt?.status !== expectedStatus || attempt.inspected !== true) fail(`source attempt is incomplete for ${source.storeId}`);
  }

  const rowStoreIds = [];
  for (const row of result.signals) {
    if (!isLouisianaAlaskaGroceryInventory(row) || row.state !== state || !positiveSearchStores.has(row.storeId)
      || row.raw?.shadowOnly === true || row.sourceProductBinding?.shadowOnly === true
      || row.previewOnly === true || row.researchOnly === true) fail('a candidate row failed current exact-store inventory proof');
    if (!['limited', 'allocated', 'unicorn'].includes(louisianaAlaskaGroceryLibraryTier(row, bible))) fail('a candidate row is outside the current tracked inventory tiers');
    rowStoreIds.push(row.storeId);
  }
  const positiveStores = unique(rowStoreIds);
  if (!Array.isArray(metadata.positiveStores)
    || JSON.stringify(sorted(metadata.positiveStores)) !== JSON.stringify(sorted(positiveStores))) fail('positive store summary contradicts admitted rows');

  return Object.freeze({ state, status: closedProfile ? 'closed_profile_verified' : 'positive_evidence_only',
    negativeComplete: closedProfile, requestCount: metadata.requests.length,
    resolverRequestCount: resolverRequests.length, inventoryRequestCount: inventoryRequests.length,
    reviewedStoreCount: expectedStores.length, positiveStoreCount: positiveStores.length,
    positiveStores: Object.freeze(sorted(positiveStores)) });
}

async function readJournal(file, state) {
  try { return validateLouisianaAlaskaIncidentJournal(JSON.parse(await readFile(file, 'utf8')), state); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function isCoolingDown(journal, nowMs) {
  return Object.values(journal).some(entry => entry?.status === 'access_denied'
    || entry?.status === 'in_flight' || Date.parse(entry?.nextAllowedAt || '') > nowMs);
}

async function collectLouisianaAlaskaGroceryProductionSource(config, bible, {
  fetchText = fetchReviewedLouisianaAlaskaText,
  incidentDirectory = path.resolve('out/source-incidents/louisiana-alaska-grocery'),
  nowMs = Date.now(),
  lifecycleConfig=STATE_LIFECYCLE_CONFIG,promotionManifest,env=process.env,signal,timeoutMs,
  ...options
} = {}) {
  const state = config?.id;
  if (!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)) fail(`unreviewed state ${state}`);
  const manifest=promotionManifest||manifests[state];
  if(!louisianaAlaskaProductionAllowed(state,lifecycleConfig,{manifest,env}))return{
    state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,
    signals:[],roadblocks:[],sources:[],sourceResults:[],status:'not_promoted',stale:false,
    metadata:{blockedByPromotion:true,requestCount:0,sourceRuntimeId:louisianaAlaskaGroceryRuntimeId(state)},
    accounting:{requestCount:0,bytes:0,elapsedMs:0,completeSnapshot:false},
  };
  if (typeof fetchText !== 'function') fail('bounded fetch transport is required');
  const journals = {};
  const files = {};
  for (const candidate of LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES) {
    files[candidate] = path.join(incidentDirectory, `${candidate}.json`);
    journals[candidate] = await readJournal(files[candidate], candidate);
  }
  if (Object.values(journals).some(journal => isCoolingDown(journal, nowMs))) {
    fail('a durable host cooldown or unfinished request is active');
  }

  const guardedFetch = async (url, requestOptions = {}) => {
    const kind = louisianaAlaskaRequestIdentity(url);
    const host = new URL(url).hostname;
    const journal = journals[state];
    const prior=journal[`host:${host}`];
    if(prior?.status==='access_denied'||prior?.status==='in_flight')return{
      ok:false,status:Number(prior.httpStatus)||0,url,text:'',error:'Request suppressed by durable in-run host denial/cooldown state.',
    };
    const timestamp = new Date().toISOString();
    const timestampMs = Date.parse(timestamp);
    journal[`host:${host}`] = { status: 'in_flight', httpStatus: null, lastAttemptAt: timestamp,
      nextAllowedAt: new Date(timestampMs + DAY_MS).toISOString(), requestId: randomUUID(),
      urlSha256: createHash('sha256').update(url).digest('hex') };
    persistLouisianaAlaskaIncidentJournal(files[state], journal);
    const observe = response => {
      if (DENIED.has(Number(response.status))) {
        const retryAfterMs = Math.max(DAY_MS, (Number(response.retryAfterSeconds) || 0) * 1000);
        journal[`host:${host}`] = { status: 'access_denied', httpStatus: Number(response.status), reviewRequired: true,
          lastAttemptAt: timestamp, nextAllowedAt: new Date(timestampMs + retryAfterMs).toISOString() };
        persistLouisianaAlaskaIncidentJournal(files[state], journal);
      }
    };
    try {
      const response = await fetchText(url, { ...requestOptions, timeoutMs: Math.min(LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS,
        Number(requestOptions.timeoutMs) || LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS), onResponse: observe });
      observe(response);
      if (!DENIED.has(Number(response.status))) {
        delete journal[`host:${host}`];
        persistLouisianaAlaskaIncidentJournal(files[state], journal);
      }
      return response;
    } catch (error) {
      throw error;
    }
  };

  await mkdir(incidentDirectory, { recursive: true });
  const inherited=collectionSignal(signal),budget=LOUISIANA_ALASKA_GROCERY_BUDGETS[state];
  const boundedMs=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,budget.sourceMs):budget.sourceMs;
  const deadline=AbortSignal.timeout(boundedMs),bounded=inherited?AbortSignal.any([inherited,deadline]):deadline;
  const sourceObservedAt=new Date(nowMs).toISOString();
  bounded.throwIfAborted();
  const result = await collectLouisianaAlaskaGrocery(config, bible, { ...options, fetchText: guardedFetch, nowMs,observedAt:sourceObservedAt,signal:bounded });
  const admission = validateLouisianaAlaskaProductionResult(state, bible, result);
  const signals = result.signals.map(row => {
    const projected = toLouisianaAlaskaGroceryOnSiteSignal(row);
    if (!projected) fail(`binary on-site projection rejected ${row.storeId}/${row.productId}`);
    return { ...projected, sourceRuntimeId:louisianaAlaskaGroceryRuntimeId(state) };
  });
  return { ...result, signals, metadata: { ...result.metadata, sourceObservedAt, productionAdmission: admission } };
}

export async function collectLouisianaAlaskaGroceryProductionState(config,bible,options={}){
  const state=config?.id,startedAt=new Date().toISOString(),sourceRuntimeId=LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)
    ?louisianaAlaskaGroceryRuntimeId(state):null;
  if(!sourceRuntimeId)fail(`unreviewed state ${state}`);
  const base={state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,value:config.value,startedAt,
    finishedAt:null,lastGoodAt:null,stale:false,signals:[],sources:[],sourceResults:[],roadblocks:[],metadata:{requestCount:0,allDeliveryDisabled:true}};
  const allowed=louisianaAlaskaProductionAllowed(state,options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,
    {manifest:options.promotionManifest||manifests[state],env:options.env||process.env});
  if(!allowed)return{...base,finishedAt:new Date().toISOString(),status:'not_promoted',metadata:{...base.metadata,blockedByPromotion:true,sourceRuntimeId}};
  const budget=LOUISIANA_ALASKA_GROCERY_BUDGETS[state],url='https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all';
  const adapter=createSourceAdapter({id:sourceRuntimeId,label:config.label,url,metadata:{stateId:state,lane:'promoted_grocery_onsite'},
    execute:(_context,{signal})=>collectLouisianaAlaskaGroceryProductionSource(config,bible,{...options,
      signal:collectionSignal(options.signal?AbortSignal.any([options.signal,signal]):signal),timeoutMs:budget.sourceMs}),
    validate:value=>['closed_profile_verified','positive_evidence_only'].includes(value?.metadata?.productionAdmission?.status)
      &&Array.isArray(value.signals)?true:'AK/LA production source did not verify its reviewed request profile',recordCount:value=>value.signals.length});
  const isolated=await runSourceAdapters([adapter],{}, {...options.sourceRunnerOptions,
    previousResults:options.previousSourceResults,circuitBreaker:options.sourceCircuitBreaker,
    concurrency:1,perDomain:1,schedule:false,timeoutMs:Math.min(Number(options.sourceRunnerOptions?.timeoutMs)||budget.stateMs,budget.stateMs),maxAttempts:1});
  const result=isolated.results[0],value=result.ok?result.value:null,finishedAt=new Date().toISOString();
  const source={sourceRuntimeId,label:config.label,url:result.sourceUrl||url,ok:result.ok,status:result.error?.status||(result.ok?200:result.status),
    contentType:'application/json',signalType:'retailer_store_inventory_result',matchedBottleCount:value?.signals.length||0,locationPrecision:'store_level',error:result.error?.message||null};
  const sourceObservedAt=value?.metadata?.sourceObservedAt||null;
  const positiveEvidenceOnly=value?.metadata?.productionAdmission?.status==='positive_evidence_only';
  const status=!result.ok?'blocked':positiveEvidenceOnly?'partial_useful_positive_evidence_only'
    :value.signals.length?'useful':'monitored_no_current_inventory';
  return{...base,finishedAt,lastGoodAt:sourceObservedAt,status,
    ...(positiveEvidenceOnly ? { partial: true, partialReason: 'The retailer returned unconfirmed empty responses for some searches.' } : {}),
    signals:value?.signals||[],sources:[source],sourceResults:[{...summarizeSourceResult(result),lastGoodAt:sourceObservedAt,alertable:false}],
    roadblocks:result.ok?[]:[{state,source:config.label,sourceRuntimeId,url:source.url,status:source.status,
      error:source.error||'AK/LA source failed',nextRoute:'Review the preserved source denial journal and retry only after its cooldown or source-policy gate allows it.'}],
    sourceCircuitState:isolated.circuitState,metadata:{...(value?.metadata||base.metadata),sourceRuntimeId,allDeliveryDisabled:true,
      requestCount:value?.metadata?.requests?.length||0,blockedByPromotion:false}};
}

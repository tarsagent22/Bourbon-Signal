import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectLouisianaAlaskaGrocery } from './louisiana-alaska-grocery-expansion.mjs';
import { LOUISIANA_ALASKA_GROCERY_SOURCES, LOUISIANA_ALASKA_RESOLVER_ZIPS } from './louisiana-alaska-grocery-premises.mjs';
import {
  LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES,
  LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS,
  LOUISIANA_ALASKA_GROCERY_BUDGETS,
} from '../louisiana-alaska-grocery-production-config.mjs';
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

function fail(message) { throw new Error(`Louisiana/Alaska production profile rejected: ${message}`); }
function unique(values) { return [...new Set(values)]; }
function sorted(values) { return [...values].sort(); }

export function validateLouisianaAlaskaProductionResult(state, bible, result) {
  if (!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)) fail(`unreviewed state ${state}`);
  const sources = LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source => source.stateCode === state);
  const budget = LOUISIANA_ALASKA_GROCERY_BUDGETS[state];
  const metadata = result?.metadata;
  if (!sources.length || !budget || !Array.isArray(result?.signals) || !Array.isArray(result?.roadblocks) || !metadata) fail('malformed collector result');
  if (metadata.complete !== true || metadata.requestProfileComplete !== true || metadata.negativeComplete !== true
    || metadata.profileScope !== 'COMPLETE_REVIEWED_PROFILE' || metadata.unconfirmedNegativeQueryCount !== 0
    || !Array.isArray(metadata.unconfirmedNegativeQueries) || metadata.unconfirmedNegativeQueries.length !== 0) {
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
  for (const request of inventoryRequests) {
    if (louisianaAlaskaRequestIdentity(request.url) !== 'inventory') fail('unreviewed product-search request');
    const source = sources.find(candidate => candidate.id === request.sourceId && candidate.merchantId === request.merchantId);
    if (!source || !request.term || request.term !== new URL(request.url).searchParams.get('q')) fail('merchant search escaped its reviewed premise');
    const evidence = queryEvidence.find(item => item.url === request.url && item.sourceId === source.id && item.term === request.term);
    if (!evidence || !/^[a-f0-9]{64}$/i.test(evidence.bodySha256 || '')
      || !['BOUND_PRODUCTS', 'CONFIRMED_EMPTY'].includes(evidence.disposition)) fail('merchant search is missing valid raw response classification');
    queryKeys.add(`${source.id}|${request.term}`);
  }
  for (const source of sources) {
    if (!queryKeys.has(`${source.id}|bourbon`) || !queryKeys.has(`${source.id}|whiskey`)) fail(`base searches missing for ${source.storeId}`);
    const attempt = metadata.sourceAttempts?.[source.id];
    if (attempt?.status !== 'success' || attempt.inspected !== true) fail(`source attempt is incomplete for ${source.storeId}`);
  }

  const rowStoreIds = [];
  for (const row of result.signals) {
    if (!isLouisianaAlaskaGroceryInventory(row) || row.state !== state
      || row.raw?.shadowOnly === true || row.sourceProductBinding?.shadowOnly === true
      || row.previewOnly === true || row.researchOnly === true) fail('a candidate row failed current exact-store inventory proof');
    if (!['limited', 'allocated', 'unicorn'].includes(louisianaAlaskaGroceryLibraryTier(row, bible))) fail('a candidate row is outside the current tracked inventory tiers');
    rowStoreIds.push(row.storeId);
  }
  const positiveStores = unique(rowStoreIds);
  if (!Array.isArray(metadata.positiveStores)
    || JSON.stringify(sorted(metadata.positiveStores)) !== JSON.stringify(sorted(positiveStores))) fail('positive store summary contradicts admitted rows');

  return Object.freeze({ state, status: 'closed_profile_verified', requestCount: metadata.requests.length,
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

export async function collectLouisianaAlaskaGroceryProductionState(config, bible, {
  fetchText = fetchReviewedLouisianaAlaskaText,
  incidentDirectory = path.resolve('out/production-source-attempts/louisiana-alaska-grocery'),
  nowMs = Date.now(),
  ...options
} = {}) {
  const state = config?.id;
  if (!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(state)) fail(`unreviewed state ${state}`);
  if (typeof fetchText !== 'function') fail('bounded fetch transport is required');
  const journals = {};
  const files = {};
  for (const candidate of LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES) {
    files[candidate] = path.join(incidentDirectory, `${candidate}.json`);
    journals[candidate] = await readJournal(files[candidate], candidate);
  }
  const combined = Object.assign({}, ...Object.values(journals));
  if (isCoolingDown(combined, nowMs)) fail('a durable host cooldown or unfinished request is active');

  const guardedFetch = async (url, requestOptions = {}) => {
    const kind = louisianaAlaskaRequestIdentity(url);
    const host = new URL(url).hostname;
    const timestamp = new Date().toISOString();
    const timestampMs = Date.parse(timestamp);
    const journal = journals[state];
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
  const result = await collectLouisianaAlaskaGrocery(config, bible, { ...options, fetchText: guardedFetch, nowMs });
  const admission = validateLouisianaAlaskaProductionResult(state, bible, result);
  const signals = result.signals.map(row => {
    const projected = toLouisianaAlaskaGroceryOnSiteSignal(row);
    if (!projected) fail(`binary on-site projection rejected ${row.storeId}/${row.productId}`);
    return projected;
  });
  return { ...result, signals, metadata: { ...result.metadata, productionAdmission: admission } };
}

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { matchesShowermansPickup, parseShowermansInventory, showermans } from './collectors/showermans-michigan-retail.mjs';
import { centralCityHiveAllocatedQueryFilter } from './collectors/central-cityhive-market-policy.mjs';
import { CITYHIVE_DENIAL_MINIMUM_MS, CITYHIVE_DENIAL_STATUSES, fetchReviewedFirstPartyText,
  persistCityHiveIncidentJournal, readCityHiveIncidentJournal } from './collectors/central-cityhive-transport.mjs';
import { librarySourceSearchPlan } from './library-search-runtime.mjs';

const label = `${showermans.storeName} pickup inventory`;
const config = Object.freeze({ id: 'MI', label, tier: 'B', active: false, strategy: 'retailer_store_inventory', cadence: 'shadow-only',
  sources: [{ kind: 'html', url: showermans.pickupUrl, precisionOnly: true }, { kind: 'html', url: showermans.categoryUrl, precisionOnly: true }], apiCandidates: [] });
const hosts = [{ state: 'MI', hostname: showermans.hostname }];
const sha = value => createHash('sha256').update(value).digest('hex');
const silent = { alertable: false, inventoryAlertable: false, watchAlertable: false };

export const showermansResearchSourceForState = state => state === 'MI' ? config : null;

export async function collectShowermansResearchReport(candidate, bible, {
  env = process.env, fetchText = fetchReviewedFirstPartyText, signal, cursorDir,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  reportDirectory = env.BOURBON_SIGNAL_STATE_OUT_FILE ? path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE) : path.resolve('out/research-showermans'),
  incidentFile = path.resolve('out/research-source-attempts/mi-showermans.json'),
} = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || process.env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || candidate !== config) {
    throw new Error('Showerman’s is registered for isolated source collection');
  }
  const now = Date.now(), startedAt = new Date(now).toISOString();
  const receipts = [], roadblocks = [], products = new Map();
  let journal = await readCityHiveIncidentJournal(incidentFile, 'MI', hosts), verified = false;
  const pending = journal.inFlight || Date.parse(journal.hosts[showermans.hostname]?.nextAllowedAt) > now;
  const budget = AbortSignal.timeout(60_000), requestSignal = signal ? AbortSignal.any([signal, budget]) : budget;
  const plan = pending ? null : await librarySourceSearchPlan(bible, { sourceKey: showermans.sourceId, budget: 1,
    broadTerms: [], cursorDir, queryFilter: centralCityHiveAllocatedQueryFilter(bible, 'MI') });
  const search = new URL(showermans.baseUrl);
  if (plan?.terms.length === 1) search.search = new URLSearchParams({ s: plan.terms[0], post_type: 'product' });
  let denied = false, complete = false;

  async function capture(url) {
    requestSignal.throwIfAborted();
    const result = await fetchText(url, { signal: requestSignal, timeoutMs: 10_000,
      isAllowedUrl: checked => checked.href === url, onResponse(response) {
        if (!CITYHIVE_DENIAL_STATUSES.has(response.status)) return;
        denied = true;
        const received = Date.now(), backoff = Math.max(CITYHIVE_DENIAL_MINIMUM_MS, (Number(response.retryAfterSeconds) || 0) * 1000);
        journal = { ...journal, inFlight: null, hosts: { ...journal.hosts, [showermans.hostname]: {
          httpStatus: response.status, lastAttemptAt: new Date(received).toISOString(),
          nextAllowedAt: new Date(Math.min(received + backoff, 8_640_000_000_000_000)).toISOString(),
        } } };
        persistCityHiveIncidentJournal(incidentFile, journal);
        throw new Error(`Showerman’s sent HTTP ${response.status}`);
      } });
    const observedAt = new Date().toISOString();
    if (!result.ok || result.status !== 200 || result.url !== url) throw new Error('First-party storefront response was incomplete');
    const bytes = Buffer.from(result.text), digest = sha(bytes);
    const artifactPath = `source-captures/showermans-${receipts.length + 1}-${digest.slice(0, 12)}.html`;
    const filename = path.join(reportDirectory, artifactPath);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes, { signal: requestSignal });
    receipts.push({ url, finalUrl: result.url, status: 200, observedAt, sha256: digest, bytes: bytes.length, artifactPath });
    return { text: result.text, observedAt };
  }

  if (pending) roadblocks.push({ state: 'MI', source: label, status: 'source_cooldown_or_unresolved' });
  else if (plan.terms.length !== 1) roadblocks.push({ state: 'MI', source: label, status: 'no_indexed_search_terms' });
  else {
    journal = { ...journal, inFlight: { attemptId: randomUUID(), startedAt } };
    persistCityHiveIncidentJournal(incidentFile, journal);
    try {
      const pickup = await capture(showermans.pickupUrl);
      verified = matchesShowermansPickup(pickup.text);
      if (!verified) throw new Error('Review exact storefront and curbside pickup terms before collecting inventory');
      for (const url of [showermans.categoryUrl, search.href]) {
        await sleep(1_500);
        const observation = await capture(url);
        const rows = parseShowermansInventory(observation.text, bible, { ...observation, requestUrl: url, pickupVerified: true });
        for (const row of rows) if (!products.has(row.id)) products.set(row.id, row);
      }
      complete = true;
    } catch (error) {
      roadblocks.push({ state: 'MI', source: label, status: denied ? 'source_denial' : 'incomplete_source', error: error.message });
    } finally {
      if (!denied) persistCityHiveIncidentJournal(incidentFile, { ...journal, inFlight: null });
    }
  }
  const finishedAt = new Date().toISOString(), signals = [...products.values()];
  const source = { sourceRuntimeId: showermans.sourceId, sourceId: showermans.sourceId, label, url: showermans.categoryUrl,
    status: complete ? 200 : 0, ok: complete, matchedBottleCount: signals.length, ...silent };
  const origin = env.GITHUB_ACTIONS === 'true' && /^\d+$/.test(env.GITHUB_RUN_ID || '') && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')
    ? {kind: 'github_actions', repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID, commitSha: env.GITHUB_SHA }
    : {kind: 'local_shadow_not_workflow_issued'};
  return { state: 'MI', label, strategy: config.strategy, cadence: config.cadence, startedAt, finishedAt, stale: false,
    status: signals.length ? complete ? 'useful' : 'partial_useful' : 'no_trusted_inventory', lastGoodAt: complete ? finishedAt : null,
    signals, sources: [source], sourceResults: [source], roadblocks,
    metadata: { complete, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
      verifiedPremises: verified ? [showermans.storeId] : [], receipts, plan, origin, bibleRecordsSha256: sha(JSON.stringify(bible.records)) } };
}

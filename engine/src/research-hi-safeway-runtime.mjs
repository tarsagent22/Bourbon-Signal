import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import {
  HI_SAFEWAY_SOURCES, HI_SAFEWAY_RESOLVER_ZIPS, hiSafewayPremiseMatches, parseHiSafewayInventory,
} from './collectors/hi-safeway-grocery.mjs';
import {
  validateLouisianaAlaskaIncidentJournal, persistLouisianaAlaskaIncidentJournal,
} from './collectors/louisiana-alaska-grocery-transport.mjs';
import { fetchWithMeta } from './core/fetcher.mjs';

const DAY_MS = 86_400_000;
const DENIAL_STATUSES = new Set([401, 403, 429, 435]);
const INCIDENT_DIR = path.resolve('out/research-source-attempts/hi-safeway-journals');
const STORE_KEY = '7bad9afbb87043b28519c4443106db06';
const SEARCH_KEY = 'e914eec9448c4d5eb672debf5011cf8f';
const hostKey = 'host:www.safeway.com';
const hash = value => createHash('sha256').update(value).digest('hex');

const HI_CONFIG = Object.freeze({
  id: 'HI', label: 'Hawaii Safeway exact-store research', tier: 'B', active: false,
  strategy: 'retailer_store_inventory', cadence: 'shadow-only',
  value: 'Four resolver-bound Hawaii Safeway premises; research only.',
  sources: Object.freeze([{ kind: 'api', url: 'https://www.safeway.com/abs/pub/xapi/search/substitute', precisionOnly: true }]),
  apiCandidates: Object.freeze([]),
});

export const hiSafewayResearchSourceForState = state => state === 'HI' ? HI_CONFIG : null;

async function readJournal(incidentDir, state) {
  const file = path.join(incidentDir, `${state}.json`);
  let value = {};
  try { value = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { file, value: validateLouisianaAlaskaIncidentJournal(value, state) };
}

function activeHostEntry(journals, nowMs) {
  for (const { value } of Object.values(journals)) {
    const entry = value[hostKey];
    if (entry?.status === 'access_denied') return entry;
    if (entry?.status === 'in_flight' && Date.parse(entry.nextAllowedAt) > nowMs) return entry;
  }
  return null;
}

function exactUrl(left, right) {
  try {
    const a = new URL(left), b = new URL(right);
    a.searchParams.sort(); b.searchParams.sort();
    return a.href === b.href;
  } catch { return false; }
}

function premiseFingerprint(store) {
  return JSON.stringify([
    store?.locationId, store?.polarisBannerName, store?.domainName,
    store?.address?.line1, store?.address?.city, store?.address?.state,
    store?.address?.country, store?.address?.zipcode,
  ]);
}

export async function collectHiSafewayResearchReport(config, bible, {
  env = process.env,
  fetchText = fetchWithMeta,
  reportDirectory = path.resolve('out/research-hi-safeway'),
  incidentDir = INCIDENT_DIR,
  signal,
} = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || config !== HI_CONFIG) {
    throw new Error('HI Safeway research requires registered isolated shadow source');
  }

  const startedAt = new Date().toISOString();
  const journals = { HI: await readJournal(incidentDir, 'HI') };

  const receipts = [];
  const signals = [];
  const roadblocks = [];
  const verifiedPremises = new Set();
  let complete = true;
  let stoppedForHostState = false;

  async function recordHostEntry(entry) {
    const journal = journals.HI;
    const next = { ...journal.value, [hostKey]: entry };
    persistLouisianaAlaskaIncidentJournal(journal.file, next);
    journal.value = next;
  }

  async function capture(url, { kind, source = null, zip = null, term = null } = {}) {
    const prior = activeHostEntry(journals, Date.now());
    if (prior) {
      stoppedForHostState = true;
      return null;
    }
    if (receipts.length >= HI_SAFEWAY_RESOLVER_ZIPS.length + HI_SAFEWAY_SOURCES.length) {
      throw new Error('HI Safeway request ceiling exceeded');
    }

    const requestStartedAt = new Date().toISOString();
    const requestId = randomUUID();
    await recordHostEntry({
      status: 'in_flight', httpStatus: null, lastAttemptAt: requestStartedAt,
      nextAllowedAt: new Date(Date.parse(requestStartedAt) + DAY_MS).toISOString(),
      requestId, urlSha256: hash(url),
    });

    let response;
    try {
      response = await fetchText(url, {
        signal,
        timeoutMs: 15_000,
        maxBytes: 4 * 1024 * 1024,
        maxRedirects: 0,
        headers: {
          accept: 'application/json',
          'ocp-apim-subscription-key': kind === 'resolver' ? STORE_KEY : SEARCH_KEY,
        },
      });
    } catch (error) {
      // Retain the in-flight latch on transport uncertainty; a human must
      // inspect and clear it before another HI lane request.
      throw error;
    }

    const status = Number(response.status) || 0;
    const receivedAt = new Date().toISOString();
    if (DENIAL_STATUSES.has(status)) {
      const retryAfter = Math.max(0, Number(response.retryAfterSeconds) || 0);
      await recordHostEntry({
        status: 'access_denied', httpStatus: status, reviewRequired: true,
        lastAttemptAt: receivedAt,
        nextAllowedAt: new Date(Math.max(Date.parse(receivedAt) + DAY_MS, Date.parse(receivedAt) + retryAfter * 1000)).toISOString(),
      });
    }

    if (response.ok && !exactUrl(response.url, url)) throw new Error('HI Safeway final URL identity changed');
    const body = Buffer.from(response.text || '');
    if (body.length > 4 * 1024 * 1024) throw new Error('HI Safeway body exceeds reviewed cap');
    const digest = hash(body);
    const artifactPath = `source-captures/${String(receipts.length + 1).padStart(2, '0')}-${digest.slice(0, 12)}.json`;
    await mkdir(path.join(reportDirectory, 'source-captures'), { recursive: true });
    await writeFile(path.join(reportDirectory, artifactPath), body);

    const receipt = {
      kind, state: 'HI', sourceId: source?.id || null, storeId: source?.storeId || null,
      merchantId: source?.merchantId || null, storeAddress: source?.address || null,
      zip, term, url, finalUrl: response.url || null,
      status, ok: response.ok === true, requestStartedAt, observedAt: receivedAt,
      bytes: body.length, sha256: digest, artifactPath,
    };
    receipts.push(receipt);
    if (DENIAL_STATUSES.has(status)) {
      roadblocks.push({ state: 'HI', source: 'Safeway', url, status, error: 'Public route denied/rate limited; durable host stop recorded' });
      return { ...response, status, body, receipt, ok: false };
    }
    if (status >= 100) {
      const { [hostKey]: _prior, ...next } = journals.HI.value;
      persistLouisianaAlaskaIncidentJournal(journals.HI.file, next);
      journals.HI.value = next;
    }
    return { ...response, status, body, receipt };
  }

  const priorHostState = activeHostEntry(journals, Date.now());
  if (priorHostState) {
    complete = false;
    roadblocks.push({ state: 'HI', source: 'Safeway', status: priorHostState.httpStatus || 'in_flight',
      error: 'HI Safeway incident journal has a denial or unresolved in-flight observation; no request made' });
    stoppedForHostState = true;
  }

  const resolver = new Map();
  const resolverConflicts = new Set();
  if (!stoppedForHostState) {
    for (const zip of HI_SAFEWAY_RESOLVER_ZIPS) {
      const url = `https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=${zip}&radius=50&size=100`;
      const result = await capture(url, { kind: 'resolver', zip });
      if (!result || ![200, 206].includes(result.status)) { complete = false; break; }
      let payload;
      try { payload = JSON.parse(result.body); } catch { complete = false; break; }
      if (!Array.isArray(payload?.instore?.stores)) { complete = false; break; }
      for (const store of payload.instore.stores) {
        const id = String(store?.locationId || '');
        if (!id || resolverConflicts.has(id)) continue;
        const previous = resolver.get(id);
        if (!previous) resolver.set(id, store);
        else if (premiseFingerprint(previous) !== premiseFingerprint(store)) {
          resolver.delete(id);
          resolverConflicts.add(id);
        }
      }
    }
  }

  if (!stoppedForHostState) {
    for (const source of HI_SAFEWAY_SOURCES) {
      if (resolverConflicts.has(source.merchantId)
        || !hiSafewayPremiseMatches(source, resolver.get(source.merchantId))) { complete = false; continue; }
      verifiedPremises.add(source.storeId);
      const host = 'https://www.safeway.com';
      const query = new URLSearchParams({
        'request-id': String(Date.now()), url: host, pageurl: host, pagename: 'search', rows: '100', start: '0',
        'search-type': 'keyword', storeid: source.merchantId, featured: 'true', 'search-uid': '',
        q: 'bourbon', channel: 'instore', banner: 'safeway',
      });
      const url = `${host}/abs/pub/xapi/search/substitute?${query}`;
      const result = await capture(url, { kind: 'inventory', source, term: 'bourbon' });
      if (!result || ![200, 206].includes(result.status)) { complete = false; break; }
      let payload;
      try { payload = JSON.parse(result.body); } catch { complete = false; continue; }
      if (payload?.appCode !== 'GR200 :: A-CT: 200' || !Array.isArray(payload?.response?.docs)
        || payload.response.docs.length > 100 || payload.response.start !== 0
        || payload.response.miscInfo?.query !== 'bourbon') { complete = false; continue; }

      for (const row of parseHiSafewayInventory(payload, source, bible, { observedAt: result.receipt.observedAt })) {
        signals.push({
          ...row,
          sourceRuntimeId: 'research:hi:safeway-xapi', alertable: false,
          eligibleForOnSite: false, eligibleForDropFeed: false, eligibleForWatch: false,
          eligibleForDelivery: false, deliveryEligible: false, eligibleForEmail: false, eligibleForSms: false,
          sourceProductBinding: { ...row.sourceProductBinding, shadowOnly: true },
          raw: { ...row.raw, shadowOnly: true },
        });
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const healthy = complete && verifiedPremises.size === HI_SAFEWAY_SOURCES.length;
  const source = {
    sourceRuntimeId: 'research:hi:safeway-xapi', label: HI_CONFIG.label,
    url: HI_CONFIG.sources[0].url, ok: healthy, status: healthy ? 200 : 0,
    signalType: 'retailer_store_inventory_result', matchedBottleCount: signals.length,
    error: healthy ? null : 'Incomplete four-store Safeway research cohort',
  };
  return {
    state: 'HI', label: HI_CONFIG.label, tier: 'B', strategy: HI_CONFIG.strategy, cadence: 'shadow-only',
    startedAt, finishedAt, lastGoodAt: healthy ? finishedAt : null,
    status: signals.length ? healthy ? 'useful' : 'partial_useful' : 'no_trusted_inventory',
    stale: false, signals, sources: [source],
    sourceResults: [{ ...source, alertable: false, inventoryAlertable: false, watchAlertable: false }], roadblocks,
    metadata: {
      complete: healthy, selectedStores: HI_SAFEWAY_SOURCES.map(item => item.storeId),
      verifiedPremises: [...verifiedPremises], receipts,
      bibleRecordsSha256: hash(JSON.stringify(bible.records)), shadowOnly: true,
      productionActivationAllowed: false, customerDeliveryAllowed: false,
      inventorySemantics: 'binary in-store only; no unit count or retailer inventory timestamp',
      retrievalScope: 'one first-page bourbon query per verified premise; targeted reviewed SKU evidence only',
      exhaustiveRetrievalVerified: false,
      observation: 'per-response receipt clock; live local research; never production activation',
    },
  };
}

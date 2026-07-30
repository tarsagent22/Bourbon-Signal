import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import { ALL_STATE_SOURCES } from './state-sources.mjs';
import { BrowserPage, ensureBrowserCdp, getOrCreateTarget, killBrowserCdp, sleep, writeJson } from './core/browser-session.mjs';

const DEFAULT_CDP_URL = process.env.BROWSER_DISCOVERY_CDP_URL || 'http://127.0.0.1:18881';
const DEFAULT_OUT_DIR = process.env.BROWSER_DISCOVERY_OUT_DIR || 'out/browser-probe';
const DEFAULT_MAX_STATES = Number(process.env.BROWSER_DISCOVERY_MAX_STATES || 3);
const DEFAULT_MAX_SOURCES = Number(process.env.BROWSER_DISCOVERY_MAX_SOURCES || 2);
const DEFAULT_MAX_PAGES = Number(process.env.BROWSER_DISCOVERY_MAX_PAGES || 6);
const DEFAULT_MAX_DURATION_MS = Number(process.env.BROWSER_DISCOVERY_MAX_DURATION_MS || 8 * 60_000);
const DEFAULT_CONCURRENCY = Math.max(1, Math.min(3, Number(process.env.BROWSER_DISCOVERY_CONCURRENCY) || 3));
const CANDIDATE_REGISTRY_PATH = fileURLToPath(new URL('../data/state-expansion-candidates.json', import.meta.url));

function secureSource(source) {
  try {
    return new URL(source?.url || '').protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    url.username = '';
    url.password = '';
    for (const key of [...new Set(url.searchParams.keys())]) {
      const replacement = /^(?:api[-_]?key|key|token|access[-_]?token|auth|authorization|secret|session|signature|sig|jwt)$/iu.test(key)
        ? '[REDACTED]'
        : '[VALUE]';
      url.searchParams.set(key, replacement);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function likelyEndpoint(value) {
  return /api|search|product|inventory|availability|store|locator|ccstore|webapi|asmx|ajax|json|graphql/i.test(value || '');
}

function retainedEndpointCandidate(value, resourceType = null) {
  const normalizedType = String(resourceType || '').toLowerCase();
  if (['image', 'font', 'media', 'stylesheet'].includes(normalizedType)) return false;
  try {
    const url = new URL(value);
    if (/google-analytics\.com$|googletagmanager\.com$|doubleclick\.net$|reddit\.com$/iu.test(url.hostname)) return false;
    if (/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|webm|mp3)$/iu.test(url.pathname)) return false;
  } catch {
    return false;
  }
  return likelyEndpoint(value);
}

function sourceMap() {
  return new Map(ALL_STATE_SOURCES.map((state) => [state.id, (state.sources || []).filter(secureSource)]));
}

export function createBrowserDiscoveryPlan({
  stateIds,
  registryStates,
  sourceByState,
  maxStates = DEFAULT_MAX_STATES,
  maxSourcesPerState = DEFAULT_MAX_SOURCES,
  maxPages = DEFAULT_MAX_PAGES,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  const knownStates = new Set((registryStates || []).map((state) => state.state || state.id));
  const selectedIds = (stateIds || []).map((state) => String(state).trim().toUpperCase()).filter(Boolean);
  if (!selectedIds.length) throw new Error('Browser discovery requires an explicit state allowlist.');
  if (selectedIds.length > maxStates) throw new Error(`Browser discovery state allowlist exceeds ${maxStates}.`);
  if (!sourceByState?.get) throw new Error('Browser discovery requires an explicit source allowlist.');
  const sources = [];
  for (const state of selectedIds) {
    if (!knownStates.has(state)) throw new Error(`Unknown or disallowed browser discovery state ${state}.`);
    const allowedSources = (sourceByState.get(state) || []).filter(secureSource).slice(0, maxSourcesPerState);
    if (!allowedSources.length) throw new Error(`No HTTPS source allowlist exists for ${state}.`);
    for (const source of allowedSources) sources.push({ state, source: { label: source.label || source.name || source.url, url: source.url } });
  }
  if (sources.length > maxPages) throw new Error(`Browser discovery page limit (${maxPages}) is below selected source count.`);
  return {
    stateIds: selectedIds,
    registryStates,
    sourceByState,
    sources,
    maxStates,
    maxSourcesPerState,
    maxPages,
    maxDurationMs,
    concurrency: Math.max(1, Math.min(3, Number(concurrency) || 1)),
    perDomainConcurrency: 1,
    profileMode: 'ephemeral_isolated',
  };
}

export function groupSourcesByDomain(items = []) {
  const groups = new Map();
  items.forEach((item, index) => {
    const domain = new URL(item.source.url).hostname.toLowerCase();
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push({ ...item, planIndex: index });
  });
  return [...groups.entries()].map(([domain, groupedItems]) => ({ domain, items: groupedItems }));
}

export function compactBrowserDiscoveryResult({ state, source, page = {}, network = [] } = {}) {
  const byUrl = new Map();
  for (const resource of page.resources || []) {
    const rawUrl = resource.name || resource.url;
    if (!retainedEndpointCandidate(rawUrl, resource.initiatorType || resource.resourceType)) continue;
    const url = normalizeEndpoint(rawUrl);
    if (!url) continue;
    byUrl.set(url, { url, method: null, status: null, resourceType: null });
  }
  for (const event of network || []) {
    const rawUrl = event.url || event.response?.url || event.request?.url;
    if (!retainedEndpointCandidate(rawUrl, event.resourceType)) continue;
    const url = normalizeEndpoint(rawUrl);
    if (!url) continue;
    const previous = byUrl.get(url) || { url, method: null, status: null, resourceType: null };
    byUrl.set(url, {
      ...previous,
      method: event.method || previous.method,
      status: event.status || previous.status,
      resourceType: event.resourceType || previous.resourceType,
    });
  }
  return {
    state,
    source: { label: source?.label || null, url: source?.url || null },
    page: { url: page.url || null, title: String(page.title || '').slice(0, 240) || null },
    endpointCandidates: [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url)).slice(0, 80),
  };
}

async function discoverSource(page, item, startedAt, maxDurationMs) {
  if (Date.now() - startedAt > maxDurationMs) throw new Error('Browser discovery duration budget exhausted.');
  await page.navigate(item.source.url, {
    idleMs: Number(process.env.BROWSER_DISCOVERY_IDLE_MS || 400),
    maxSettleMs: Number(process.env.BROWSER_DISCOVERY_MAX_SETTLE_MS || 2_000),
  });
  const extracted = await page.extractPage();
  return compactBrowserDiscoveryResult({ state: item.state, source: item.source, page: extracted, network: page.networkSummary() });
}

export async function removeEphemeralProfile(profileDir, { remove = rm, wait = sleep, attempts = 4 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(profileDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
      if (attempt < attempts) await wait(250 * attempt);
    }
  }
  return false;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, value = 'true'] = arg.slice(2).split('=');
    return [key, value];
  }));
  const requestedStates = String(args.states || process.env.BROWSER_DISCOVERY_STATES || 'OR,NH,PA')
    .split(',').map((state) => state.trim().toUpperCase()).filter(Boolean);
  const registry = JSON.parse(await readFile(CANDIDATE_REGISTRY_PATH, 'utf8'));
  const registryStates = [...registry.states, ...(registry.scopedControlMarkets || []).map((market) => ({ ...market, state: market.id }))];
  const plan = createBrowserDiscoveryPlan({
    stateIds: requestedStates,
    registryStates,
    sourceByState: sourceMap(),
    maxStates: Number(args['max-states'] || DEFAULT_MAX_STATES),
    maxSourcesPerState: Number(args['max-sources'] || DEFAULT_MAX_SOURCES),
    maxPages: Number(args['max-pages'] || DEFAULT_MAX_PAGES),
    maxDurationMs: Number(args['max-duration-ms'] || DEFAULT_MAX_DURATION_MS),
    concurrency: Number(args.concurrency || DEFAULT_CONCURRENCY),
  });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'bourbon-signal-browser-probe-'));
  let browser;
  const pages = new Set();
  try {
    browser = await ensureBrowserCdp(DEFAULT_CDP_URL, { profileDir, requireFresh: true, timeoutMs: 30_000 });
    const startedAt = Date.now();
    const recordsByIndex = new Map();
    const roadblocksByIndex = new Map();
    const groups = groupSourcesByDomain(plan.sources);
    let nextGroup = 0;
    async function worker() {
      const target = await getOrCreateTarget(DEFAULT_CDP_URL);
      const page = new BrowserPage(target.webSocketDebuggerUrl, { pageTimeoutMs: Math.min(plan.maxDurationMs, 55_000) });
      pages.add(page);
      await page.connect();
      await page.configureEndpointDiscovery();
      while (true) {
        const groupIndex = nextGroup;
        nextGroup += 1;
        if (groupIndex >= groups.length) return;
        for (const item of groups[groupIndex].items) {
          try {
            recordsByIndex.set(item.planIndex, await discoverSource(page, item, startedAt, plan.maxDurationMs));
          } catch (error) {
            roadblocksByIndex.set(item.planIndex, { state: item.state, sourceUrl: item.source.url, reason: (error instanceof Error ? error.message : String(error)).slice(0, 240) });
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(plan.concurrency, groups.length) }, () => worker()));
    const records = [...recordsByIndex.entries()].sort(([left], [right]) => left - right).map(([, record]) => record);
    const roadblocks = [...roadblocksByIndex.entries()].sort(([left], [right]) => left - right).map(([, roadblock]) => roadblock);
    const output = {
      schemaVersion: 'bourbon-signal-browser-source-discovery-v1',
      generatedAt: new Date().toISOString(),
      profileMode: plan.profileMode,
      pageLimit: plan.maxPages,
      durationLimitMs: plan.maxDurationMs,
      concurrency: plan.concurrency,
      perDomainConcurrency: plan.perDomainConcurrency,
      records,
      roadblocks,
    };
    await writeJson(path.join(DEFAULT_OUT_DIR, 'browser-discovery-summary.json'), output);
    for (const state of plan.stateIds) {
      const stateOutput = { ...output, records: records.filter((record) => record.state === state), roadblocks: roadblocks.filter((roadblock) => roadblock.state === state) };
      await writeJson(path.join(DEFAULT_OUT_DIR, `${state}-browser-discovery.json`), stateOutput);
    }
    console.log(JSON.stringify({ states: plan.stateIds, pages: records.length, roadblocks: roadblocks.length }, null, 2));
  } finally {
    for (const page of pages) page.close();
    await killBrowserCdp(browser);
    const removed = await removeEphemeralProfile(profileDir);
    if (!removed) console.warn(`Browser profile cleanup deferred: ${profileDir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}

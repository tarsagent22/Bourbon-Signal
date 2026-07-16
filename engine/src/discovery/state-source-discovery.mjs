import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createBraveClient } from './brave-client.mjs';
import { fingerprintSource } from './platform-fingerprints.mjs';
import { queriesForState } from './query-templates.mjs';
import { stateMatchesText } from './state-name-registry.mjs';

const DEFAULT_REGISTRY_PATH = fileURLToPath(new URL('../../data/state-expansion-candidates.json', import.meta.url));

function asDate(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : -Infinity;
}

function nowIso(now) {
  const value = now();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function selectRotatingStateCohort(states, { now = new Date().toISOString(), cohortSize = 4 } = {}) {
  const nowMs = Date.parse(now);
  return [...states]
    .filter((state) => !state.nextEligibleAt || Date.parse(state.nextEligibleAt) <= nowMs)
    .sort((left, right) => asDate(left.lastDiscoveryAt) - asDate(right.lastDiscoveryAt) || left.state.localeCompare(right.state))
    .slice(0, Math.max(0, cohortSize));
}

function candidateMatchesState(candidate, state) {
  return stateMatchesText(state.state, `${candidate.title || ''}\n${candidate.description || ''}\n${candidate.url || ''}`);
}

function candidateId(state, domain) {
  return `${state.toLowerCase()}-${String(domain || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}`;
}

function toDiscoveryCandidate({ state, queryTemplateId, result, discoveredAt }) {
  return {
    id: candidateId(state.state, result.domain),
    state: state.state,
    title: result.title,
    url: result.url,
    domain: result.domain,
    description: result.description,
    discoveredAt,
    queryTemplateIds: [queryTemplateId],
    platformHints: fingerprintSource(result),
    evidenceKind: 'search_discovery_only',
    inventoryEvidence: false,
    promotionEligible: false,
  };
}

export async function discoverStateSources({
  states,
  stateIds,
  client,
  outDir = path.resolve('out/discovery'),
  maxQueriesPerRun = 12,
  maxQueriesPerState = 4,
  now = () => new Date(),
} = {}) {
  if (!client?.search) throw new Error('A direct Brave client is required for discovery.');
  const requestedStateIds = (stateIds || []).map((state) => String(state).toUpperCase());
  const selected = (requestedStateIds.length ? states.filter((state) => requestedStateIds.includes(state.state)) : selectRotatingStateCohort(states, { now: nowIso(now) }));
  if (requestedStateIds.length && selected.length !== requestedStateIds.length) throw new Error('One or more requested discovery states are not in the candidate registry.');
  await mkdir(outDir, { recursive: true });
  let remainingRunQueries = Math.max(0, maxQueriesPerRun);
  const reports = [];
  for (const state of selected) {
    const stateLimit = Math.min(maxQueriesPerState, Number(state.requestBudget?.maxQueriesPerRun ?? maxQueriesPerState), remainingRunQueries);
    const queries = queriesForState(state.state).slice(0, Math.max(0, stateLimit));
    const byDomain = new Map();
    let cacheHitCount = 0;
    for (const template of queries) {
      const response = await client.search(template.query);
      if (response.cacheHit) cacheHitCount += 1;
      for (const result of response.results || []) {
        if (!candidateMatchesState(result, state)) continue;
        const existing = byDomain.get(result.domain);
        if (existing) {
          if (!existing.queryTemplateIds.includes(template.id)) existing.queryTemplateIds.push(template.id);
          continue;
        }
        byDomain.set(result.domain, toDiscoveryCandidate({ state, queryTemplateId: template.id, result, discoveredAt: nowIso(now) }));
      }
    }
    remainingRunQueries -= queries.length;
    const report = {
      schemaVersion: 'bourbon-signal-state-source-discovery-v1',
      generatedAt: nowIso(now),
      state: state.state,
      lifecycleStageAtDiscovery: state.lifecycleStage,
      queryCount: queries.length,
      cacheHitCount,
      candidates: [...byDomain.values()].sort((left, right) => left.domain.localeCompare(right.domain)),
      inventoryEvidence: false,
      promotionSideEffects: false,
    };
    await writeFile(path.join(outDir, `${state.state}.json`), JSON.stringify(report, null, 2));
    reports.push(report);
    if (!remainingRunQueries) break;
  }
  return reports;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, value = 'true'] = arg.slice(2).split('=');
    return [key, value];
  }));
  const registry = JSON.parse(await readFile(process.env.BOURBON_SIGNAL_CANDIDATE_REGISTRY || DEFAULT_REGISTRY_PATH, 'utf8'));
  const stateIds = String(args.states || process.env.BOURBON_SIGNAL_DISCOVERY_STATES || '')
    .split(',').map((state) => state.trim().toUpperCase()).filter(Boolean);
  const client = createBraveClient();
  const reports = await discoverStateSources({
    states: registry.states,
    stateIds: stateIds.length ? stateIds : undefined,
    client,
    maxQueriesPerRun: Number(args['max-queries'] || process.env.BOURBON_SIGNAL_DISCOVERY_MAX_QUERIES || 12),
    maxQueriesPerState: Number(args['max-queries-per-state'] || process.env.BOURBON_SIGNAL_DISCOVERY_MAX_QUERIES_PER_STATE || 4),
  });
  console.log(JSON.stringify(reports.map((report) => ({ state: report.state, queryCount: report.queryCount, candidateCount: report.candidates.length })), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}

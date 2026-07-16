#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBoundedHttpClient } from './probe-http.mjs';
import { probeSource } from './probe-source.mjs';

function option(args, name, fallback = '') {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function normalizeStates(states) {
  const values = Array.isArray(states) ? states : String(states || '').split(',');
  const normalized = [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter(Boolean))];
  if (!normalized.length || normalized.some((state) => !/^[A-Z]{2}$/.test(state))) throw new Error('Provide one or more two-letter --states values.');
  if (normalized.length > 5) throw new Error('Source probing is bounded to five states per run.');
  return normalized;
}

function compactCandidate(candidate) {
  return {
    id: String(candidate?.id || '').slice(0, 160),
    state: String(candidate?.state || '').toUpperCase(),
    title: String(candidate?.title || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    url: String(candidate?.url || ''),
    domain: String(candidate?.domain || '').slice(0, 200),
    sourceClass: Array.isArray(candidate?.queryTemplateIds) ? candidate.queryTemplateIds[0] : null,
    publicApiUrls: Array.isArray(candidate?.publicApiUrls) ? candidate.publicApiUrls.slice(0, 2) : [],
  };
}

export function sourceAuthorityForUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith('.gov') ? 'official' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function probeStateSources({
  states,
  discoveryDir = path.resolve('out/discovery'),
  outDir = path.resolve('out/probes'),
  httpClient = createBoundedHttpClient(),
  maxSourcesPerState = 8,
  now = () => new Date().toISOString(),
} = {}) {
  const selected = normalizeStates(states);
  const boundedLimit = Math.max(1, Math.min(12, Number(maxSourcesPerState) || 8));
  await mkdir(outDir, { recursive: true });
  const reports = [];
  for (const state of selected) {
    let discovery;
    try {
      discovery = JSON.parse(await readFile(path.join(discoveryDir, `${state}.json`), 'utf8'));
    } catch {
      throw new Error(`Discovery report is required before probing ${state}.`);
    }
    const candidates = (Array.isArray(discovery.candidates) ? discovery.candidates : [])
      .filter((candidate) => candidate?.state === state && candidate?.evidenceKind === 'search_discovery_only' && /^https:\/\//i.test(candidate?.url || ''))
      .slice(0, boundedLimit)
      .map(compactCandidate);
    const results = [];
    for (const source of candidates) {
      const result = await probeSource(source, { httpClient });
      results.push({
        ...result,
        sourceId: source.id,
        sourceTitle: source.title,
        sourceDomain: source.domain,
        sourceAuthority: sourceAuthorityForUrl(source.url),
        inventoryEvidence: false,
        promotionEligible: false,
        requiresReview: true,
      });
    }
    const summary = {
      discovered: Array.isArray(discovery.candidates) ? discovery.candidates.length : 0,
      probed: results.length,
      probeable: results.filter((row) => !['rejected', 'blocked_terms_identity_ambiguity', 'agent_investigation_required'].includes(row.resultClass)).length,
      blocked: results.filter((row) => ['rejected', 'blocked_terms_identity_ambiguity', 'agent_investigation_required'].includes(row.resultClass)).length,
      exactQuantityCandidates: results.filter((row) => row.resultClass === 'exact_quantity_candidate').length,
      browserEscalations: results.filter((row) => row.browserEscalationEligible).length,
    };
    const report = {
      schemaVersion: 'bourbon-signal-state-source-probes-v1',
      generatedAt: now(),
      state,
      canPublish: false,
      canPromote: false,
      maxSourcesPerState: boundedLimit,
      summary,
      results,
      expansionCandidates: results.map((row) => ({
        state,
        source: row.sourceTitle || row.sourceDomain || row.sourceUrl,
        sourceAuthority: row.sourceAuthority,
        runnerReachability: row.status && row.status < 400 ? 1 : 0,
        coverageTier: row.resultClass,
        exactStoreGap: 100,
        alertGradeGap: 100,
        expectedRequestBudget: 1,
        sourceStability: 0,
        implementationEffort: 5,
        reversibility: 5,
        strategicAdjacency: 0,
      })),
    };
    await writeFile(path.join(outDir, `${state}.json`), `${JSON.stringify(report, null, 2)}\n`);
    reports.push(report);
  }
  return reports;
}

async function main(args = process.argv.slice(2)) {
  const reports = await probeStateSources({
    states: option(args, 'states'),
    discoveryDir: path.resolve(option(args, 'discovery-dir', 'out/discovery')),
    outDir: path.resolve(option(args, 'out-dir', 'out/probes')),
    maxSourcesPerState: Number(option(args, 'max-sources', '8')),
  });
  const expansionCandidates = reports.flatMap((report) => report.expansionCandidates);
  process.stdout.write(`${JSON.stringify({
    summary: reports.reduce((total, report) => ({
      candidates: total.candidates + report.summary.discovered,
      probeable: total.probeable + report.summary.probeable,
      blocked: total.blocked + report.summary.blocked,
    }), { candidates: 0, probeable: 0, blocked: 0 }),
    expansionCandidates,
    states: reports.map((report) => ({ state: report.state, ...report.summary })),
    canPublish: false,
    canPromote: false,
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Source probing failed'}\n`); process.exitCode = 1; });
}

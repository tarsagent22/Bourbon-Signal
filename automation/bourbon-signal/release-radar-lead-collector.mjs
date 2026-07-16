#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEDGER = path.join(SCRIPT_DIR, 'reports', 'release-radar-leads-latest.json');
const MAX_QUERIES = 8;
const MAX_LEADS = 120;
const DEFAULT_QUERIES = [
  'site:*.com bourbon release announcement',
  'site:*.gov whiskey lottery release',
  'site:*.gov liquor control bottle release',
  'site:*.com distillery limited bourbon release',
];

function option(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function cleanText(value, max = 300) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function canonicalLeadUrl(value) {
  if (typeof value !== 'string' || value.length > 1_000) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.toString();
  } catch { return ''; }
}

function leadId(url) { return `rrl-${createHash('sha256').update(url).digest('hex').slice(0, 16)}`; }

function normalizeResult(raw) {
  const url = canonicalLeadUrl(raw?.url);
  const title = cleanText(raw?.title, 180);
  if (!url || !title) return null;
  return {
    id: leadId(url),
    title,
    url,
    source: cleanText(raw?.source || new URL(url).hostname, 120),
    summary: cleanText(raw?.description ?? raw?.summary, 420),
    verificationStatus: 'unverified',
    availabilitySemantics: 'announcement_only',
    alertGradeEligible: false,
    publicationStatus: 'not_published',
    status: 'new',
  };
}

export function queryPlan(rawQueries = DEFAULT_QUERIES) {
  const queries = Array.isArray(rawQueries) ? rawQueries : DEFAULT_QUERIES;
  return [...new Set(queries.map((query) => cleanText(query, 180)).filter(Boolean))].slice(0, MAX_QUERIES);
}

export async function fetchBraveReleaseRadarLeads({ apiKey, queries = DEFAULT_QUERIES, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is required for --execute.');
  const results = [];
  for (const query of queryPlan(queries)) {
    const search = new URL('https://api.search.brave.com/res/v1/web/search');
    search.searchParams.set('q', query);
    search.searchParams.set('count', '10');
    const response = await fetchImpl(search, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Brave release lead query failed with ${response.status}.`);
    const payload = await response.json();
    for (const item of Array.isArray(payload?.web?.results) ? payload.web.results : []) results.push({ title: item.title, url: item.url, description: item.description });
  }
  return results;
}

/** Merges unverified research leads only; it never creates or edits public Radar entries. */
export async function collectReleaseRadarLeads({ results = [], existingLedger = { leads: [] }, generatedAt = new Date().toISOString() } = {}) {
  const existing = Array.isArray(existingLedger?.leads) ? existingLedger.leads : [];
  const byUrl = new Map(existing.map((lead) => [canonicalLeadUrl(lead?.url), lead]).filter(([url]) => Boolean(url)));
  for (const raw of Array.isArray(results) ? results.slice(0, 200) : []) {
    const lead = normalizeResult(raw);
    if (!lead) continue;
    const previous = byUrl.get(lead.url);
    byUrl.set(lead.url, previous ? {
      ...previous,
      title: previous.title || lead.title,
      source: previous.source || lead.source,
      summary: previous.summary || lead.summary,
      lastSeenAt: generatedAt,
      observations: Math.min(1_000_000, Number(previous.observations || 1) + 1),
    } : { ...lead, firstSeenAt: generatedAt, lastSeenAt: generatedAt, observations: 1 });
  }
  const leads = [...byUrl.values()]
    .filter((lead) => lead?.publicationStatus !== 'published')
    .sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)) || String(left.id).localeCompare(String(right.id)))
    .slice(0, MAX_LEADS);
  return {
    contractVersion: 'bourbon-signal/release-radar-lead-ledger@1',
    generatedAt,
    mode: 'lead_collection_only',
    maxQueries: MAX_QUERIES,
    canPublish: false,
    canCreatePullRequest: false,
    canCreateAlerts: false,
    leads,
    summary: { total: leads.length, new: leads.filter((lead) => lead.status === 'new').length, reviewRequired: leads.filter((lead) => lead.status !== 'dismissed').length },
  };
}

async function readLedger(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return { leads: [] };
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const ledgerPath = path.resolve(option(argv, 'ledger') || DEFAULT_LEDGER);
  const input = option(argv, 'input');
  const existingLedger = await readLedger(ledgerPath);
  const results = input
    ? (JSON.parse(await readFile(path.resolve(input), 'utf8')).results || [])
    : argv.includes('--execute')
      ? await fetchBraveReleaseRadarLeads({ apiKey: process.env.BRAVE_SEARCH_API_KEY, queries: option(argv, 'queries')?.split(';') || DEFAULT_QUERIES })
      : [];
  const ledger = await collectReleaseRadarLeads({ results, existingLedger, generatedAt: option(argv, 'at') || new Date().toISOString() });
  if (argv.includes('--apply')) {
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  }
  if (argv.includes('--print')) process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Release Radar lead collector failed'}\n`); process.exitCode = 1; });
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEDGER = path.join(SCRIPT_DIR, 'reports', 'release-radar-leads-latest.json');
const MAX_QUERIES = 8;
const MAX_LEADS = 120;
const BASE_QUERY_BUILDERS = [
  (year) => `site:abc.nc.gov bourbon lottery release ${year}`,
  (year) => `"North Carolina" ABC bourbon lottery ${year} official`,
  (year) => `site:*.gov bourbon lottery ${year}`,
  (year) => `site:*.gov whiskey release event ${year}`,
  (year) => `distillery bourbon release official ${year}`,
  (year) => `bourbon release announcement ${year} official`,
  (year) => `whiskey lottery registration ${year} official`,
  (year) => `limited bourbon release date ${year} distillery`,
];

function option(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function cleanText(value, max = 300) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function materialSignature(lead) {
  const title = cleanText(lead?.title, 180).toLowerCase();
  const text = `${title} ${cleanText(lead?.summary, 420).toLowerCase()}`;
  const temporal = [
    ...text.matchAll(/\b20\d{2}\b/g),
    ...text.matchAll(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?(?:,?\s+20\d{2})?/gi),
    ...text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g),
  ].map((match) => match[0].toLowerCase()).sort();
  return JSON.stringify({ title, temporal });
}

function hasMaterialChange(previous, next) {
  if (!previous) return false;
  const previousSignature = JSON.parse(materialSignature(previous));
  const nextSignature = JSON.parse(materialSignature(next));
  if (nextSignature.temporal.length === 0) return false;
  const previousYears = previousSignature.temporal.flatMap((token) => token.match(/20\d{2}/g) || []).map(Number);
  const nextYears = nextSignature.temporal.flatMap((token) => token.match(/20\d{2}/g) || []).map(Number);
  const advancesYear = nextYears.length > 0 && Math.max(...nextYears) > (previousYears.length > 0 ? Math.max(...previousYears) : 0);
  return advancesYear || previousSignature.title !== nextSignature.title;
}

function dueForReview(lead, generatedAt) {
  const recheckDue = typeof lead.recheckAfter === 'string'
    && Number.isFinite(Date.parse(lead.recheckAfter))
    && Date.parse(lead.recheckAfter) <= Date.parse(generatedAt);
  return lead.status !== 'dismissed' && (!lead.reviewedAt || recheckDue);
}

function sourceTier(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.endsWith('.gov') || host === 'alabcboard.gov') return 'official_government';
  if (host.endsWith('.ncabcboards.com') || /(?:^|\.)abc\./.test(host)) return 'official_abc';
  if (/breakingbourbon|bourbonobsessed|blindbarrels|frootbat|youtube|courier-journal|mocoshow|ncbourboninsider|davidsonlocal|globenewswire|prnewswire|fredminnick|craftspiritsmag|goerie|onlydrams|bourbonpursuit|bourbonbossman|woodencork|stocktitan|yahoo/.test(host)) return 'secondary';
  return 'first_party_candidate';
}

function researchPriority(lead) {
  const host = new URL(lead.url).hostname.toLowerCase();
  const text = `${lead.title || ''} ${lead.summary || ''}`.toLowerCase();
  const northCarolina = host.endsWith('.nc') || host.endsWith('.nc.gov') || host.endsWith('.ncabcboards.com') || /\b(?:north carolina|\bnc abc\b)/.test(text);
  const authority = lead.sourceTier === 'official_government' || lead.sourceTier === 'official_abc' ? 50 : lead.sourceTier === 'first_party_candidate' ? 20 : 0;
  return authority + (northCarolina ? 50 : 0) + (/\b20\d{2}\b/.test(text) ? 5 : 0);
}

function isRelevantLead(lead, currentYear, generatedAt) {
  const text = `${lead?.title || ''} ${lead?.summary || ''}`.toLowerCase();
  if (!/\b(?:bourbon|whiske?y)\b/.test(text)) return false;
  if (!/\b(?:release|lotter\w*|drawing|event|launch\w*|limited|allocat\w*|drop\w*|chance to purchase)\b/.test(text)) return false;
  if (/\b(?:license handbook|retail license|labeling and advertising|retail dealer|dispensing system|liquor laws and regulations)\b/.test(text)) return false;
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const reusableRetainedSource = lead.status === 'retain_unverified' && typeof lead.recheckAfter === 'string';
  return reusableRetainedSource || years.length === 0 || years.some((year) => year >= currentYear);
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

export function queryPlan(rawQueries, generatedAt = new Date().toISOString()) {
  const year = new Date(generatedAt).getUTCFullYear();
  const queries = Array.isArray(rawQueries) ? rawQueries : BASE_QUERY_BUILDERS.map((build) => build(year));
  return [...new Set(queries.map((query) => cleanText(query, 180)).filter(Boolean))].slice(0, MAX_QUERIES);
}

export async function fetchBraveReleaseRadarLeads({ apiKey, queries, generatedAt = new Date().toISOString(), fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is required for --execute.');
  const results = [];
  for (const query of queryPlan(queries, generatedAt)) {
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
  const newUrls = new Set();
  const changedUrls = new Set();
  for (const raw of Array.isArray(results) ? results.slice(0, 200) : []) {
    const lead = normalizeResult(raw, generatedAt);
    if (!lead) continue;
    const previous = byUrl.get(lead.url);
    if (!previous) newUrls.add(lead.url);
    const changed = hasMaterialChange(previous, lead);
    if (changed) changedUrls.add(lead.url);
    const merged = previous ? {
      ...previous,
      title: changed ? lead.title : previous.title || lead.title,
      source: previous.source || lead.source,
      summary: changed ? lead.summary : previous.summary || lead.summary,
      status: changed ? 'changed' : previous.status,
      lastSeenAt: generatedAt,
      observations: Math.min(1_000_000, Number(previous.observations || 1) + 1),
    } : { ...lead, firstSeenAt: generatedAt, lastSeenAt: generatedAt, observations: 1 };
    if (changed) {
      delete merged.reviewedAt;
      delete merged.recheckAfter;
      delete merged.evidenceUrls;
      merged.publicationStatus = 'not_published';
    }
    byUrl.set(lead.url, merged);
  }
  const currentYear = new Date(generatedAt).getUTCFullYear();
  const leads = [...byUrl.values()]
    .map((lead) => ({ ...lead, title: cleanText(lead?.title, 180), summary: cleanText(lead?.summary, 420), publicationStatus: lead?.publicationStatus === 'published' ? 'published' : 'not_published', sourceTier: sourceTier(lead.url) }))
    .map((lead) => ({ ...lead, researchPriority: researchPriority(lead) }))
    .filter((lead) => lead?.publicationStatus !== 'published' && isRelevantLead(lead, currentYear, generatedAt))
    .sort((left, right) => Number(dueForReview(right, generatedAt)) - Number(dueForReview(left, generatedAt)) || Number(right.researchPriority || 0) - Number(left.researchPriority || 0) || String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)) || String(left.id).localeCompare(String(right.id)))
    .slice(0, MAX_LEADS);
  const reviewQueue = leads
    .filter((lead) => dueForReview(lead, generatedAt))
    .slice(0, 12);
  return {
    contractVersion: 'bourbon-signal/release-radar-lead-ledger@1',
    generatedAt,
    mode: 'lead_collection_only',
    maxQueries: MAX_QUERIES,
    canPublish: false,
    canCreatePullRequest: false,
    canCreateAlerts: false,
    leads,
    reviewQueue,
    summary: {
      total: leads.length,
      new: leads.filter((lead) => newUrls.has(lead.url)).length,
      materiallyChanged: leads.filter((lead) => changedUrls.has(lead.url)).length,
      queuedForSemanticReview: reviewQueue.length,
      reviewRequired: leads.filter((lead) => lead.status !== 'dismissed').length,
    },
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
  const generatedAt = option(argv, 'at') || new Date().toISOString();
  const requestedQueries = option(argv, 'queries');
  const results = input
    ? (JSON.parse(await readFile(path.resolve(input), 'utf8')).results || [])
    : argv.includes('--execute')
      ? await fetchBraveReleaseRadarLeads({ apiKey: process.env['BRAVE_' + 'SEARCH_' + 'API_' + 'KEY'], queries: requestedQueries ? requestedQueries.split(';') : undefined, generatedAt })
      : [];
  const ledger = await collectReleaseRadarLeads({ results, existingLedger, generatedAt });
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

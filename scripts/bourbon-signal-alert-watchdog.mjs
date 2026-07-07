#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.hermes', 'bourbon-signal', 'alerts');
const OUT_FILE = path.join(OUT_DIR, 'latest-alert-watchdog.json');
const BASE_URL = process.env.BOURBON_SIGNAL_LIVE_BASE_URL || 'https://www.bourbonsignal.com';
const SECRET = process.env.BOURBON_SIGNAL_ALERT_SECRET || process.env.ALERT_DELIVERY_SECRET || process.env.CRON_SECRET || '';
const MAX_MS = Number(process.env.BOURBON_SIGNAL_ALERT_WATCHDOG_TIMEOUT_MS || 120_000);
const QUIET = process.argv.includes('--quiet');
const APPLY = process.argv.includes('--apply');

function nowIso() { return new Date().toISOString(); }
async function fetchJson(route, options = {}) {
  const url = new URL(route, BASE_URL).toString();
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      signal: AbortSignal.timeout(options.timeoutMs || MAX_MS),
    });
    const text = await res.text().catch(() => '');
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, ms: Date.now() - started, json, text: json ? undefined : text.slice(0, 500) };
  } catch (error) {
    return { ok: false, status: null, ms: Date.now() - started, error: error.message };
  }
}
function pickDeliverySummary(data) {
  if (!data || typeof data !== 'object') return null;
  const keys = ['ok', 'dryRun', 'deliveryEnabled', 'onSiteDeliveryEnabled', 'emailDeliveryEnabled', 'smsDeliveryEnabled', 'emailClientConfigured', 'smsClientConfigured', 'rawEligibleCandidateCount', 'candidateCount', 'usersConsidered', 'paidUsersConsidered', 'usersMatched', 'onSiteAlertsCreated', 'emailsSent', 'emailsWouldSend', 'smsSent', 'smsWouldSend', 'skippedOnSiteDedupe', 'skippedDedupe', 'skippedEmailDeliveryDisabled', 'skippedSmsDeliveryDisabled', 'skippedEmailRecipientNotAllowed', 'skippedSmsRecipientNotAllowed', 'errors'];
  return Object.fromEntries(keys.map((key) => [key, data[key]]));
}
function analyze({ unauth, dryRun }) {
  const failures = [];
  const warnings = [];
  if (unauth.status !== 401) failures.push(`/api/alerts/deliver unauthenticated expected 401, got ${unauth.status ?? 'network_error'}.`);
  if (!SECRET) failures.push('No alert delivery secret provided to watchdog environment. Set BOURBON_SIGNAL_ALERT_SECRET, ALERT_DELIVERY_SECRET, or CRON_SECRET.');
  if (!dryRun.ok || dryRun.status !== 200 || dryRun.json?.ok !== true) failures.push(`Authorized dry-run failed with status ${dryRun.status ?? 'network_error'}.`);
  const s = dryRun.json || {};
  if (s.onSiteDeliveryEnabled !== true) failures.push('On-site alert delivery is disabled.');
  if (s.emailDeliveryEnabled !== true) failures.push('Email alert delivery is disabled.');
  if (s.smsDeliveryEnabled !== true) warnings.push('SMS alert delivery is disabled.');
  if (s.emailClientConfigured !== true) failures.push('Email client is not configured.');
  if (s.smsDeliveryEnabled === true && s.smsClientConfigured !== true) failures.push('SMS delivery is enabled but SMS client is not configured.');
  if (Array.isArray(s.errors) && s.errors.length) failures.push(`Dry-run returned ${s.errors.length} error(s): ${s.errors.slice(0, 3).map((e) => e.message || JSON.stringify(e)).join(' | ')}`);
  if (Number(s.rawEligibleCandidateCount || 0) > 0 && Number(s.candidateCount || 0) === 0) failures.push('Eligible candidates exist but all were removed by safety guardrails; inspect candidate contract.');
  const explainable = Number(s.usersMatched || 0) > 0
    || Number(s.candidateCount || 0) === 0
    || Number(s.paidUsersConsidered || 0) === 0
    || Number(s.skippedOnSiteDedupe || 0) > 0
    || Number(s.emailsWouldSend || 0) > 0
    || Number(s.smsWouldSend || 0) > 0
    || Number(s.onSiteAlertsCreated || 0) > 0;
  if (Number(s.rawEligibleCandidateCount || 0) > 0 && !explainable) warnings.push('Candidates exist but dry-run outcome is not clearly explained by matches, sends, or dedupe.');
  return { failures, warnings };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  const unauth = await fetchJson('/api/alerts/deliver?dryRun=1', { timeoutMs: 30_000 });
  const dryRun = await fetchJson('/api/alerts/deliver?dryRun=1', { headers });
  const analysis = analyze({ unauth, dryRun });
  const payload = {
    ok: analysis.failures.length === 0,
    checkedAt: nowIso(),
    baseUrl: BASE_URL,
    applyMode: APPLY,
    unauth: { status: unauth.status, ok: unauth.ok, ms: unauth.ms },
    dryRun: { status: dryRun.status, ok: dryRun.ok, ms: dryRun.ms, summary: pickDeliverySummary(dryRun.json) },
    failures: analysis.failures,
    warnings: analysis.warnings,
  };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  if (!QUIET || !payload.ok) console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok) process.exit(1);
}

main().catch(async (error) => {
  await mkdir(OUT_DIR, { recursive: true });
  const payload = { ok: false, checkedAt: nowIso(), error: error.message };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  if (!QUIET) console.error(error);
  process.exit(1);
});

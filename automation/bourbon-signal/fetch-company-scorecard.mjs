#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDedicatedScorecardReadSecret, isAggregateScorecard } from '../../src/lib/ops-auth.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SCORECARD_FEED_PATH = '/api/ops/company-scorecard';
const SCORECARD_ALLOWED_ORIGINS = new Set([
  'https://www.bourbonsignal.com',
  'https://bourbonsignal.com',
  'https://localhost:3000',
  'https://127.0.0.1:3000',
  'https://[::1]:3000',
]);

function option(args, name, fallback = null) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

export function resolveScorecardFeedUrl(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new Error('Scorecard URL must be an allowlisted HTTPS origin.');
  }
  const originOnly = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  if (url.protocol !== 'https:' || !originOnly || !SCORECARD_ALLOWED_ORIGINS.has(url.origin)) {
    throw new Error('Scorecard URL must be an allowlisted HTTPS origin.');
  }
  return `${url.origin}${SCORECARD_FEED_PATH}`;
}

export function readScorecardSecret(env = process.env) {
  const configured = env.COMPANY_SCORECARD_READ_SECRET;
  if (typeof configured !== 'string' || !configured.trim()) throw new Error('COMPANY_SCORECARD_READ_SECRET is required.');
  const secret = getDedicatedScorecardReadSecret(env);
  if (!secret) throw new Error('COMPANY_SCORECARD_READ_SECRET must be distinct from CRON_SECRET.');
  return secret;
}

export async function fetchCompanyScorecard({ args = process.argv, env = process.env, fetchImpl = fetch } = {}) {
  const apply = args.includes('--apply');
  const baseUrl = option(args, 'url', env.BOURBON_SIGNAL_BASE_URL || 'https://www.bourbonsignal.com');
  const feedUrl = resolveScorecardFeedUrl(baseUrl);
  const secret = readScorecardSecret(env);
  const response = await fetchImpl(feedUrl, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Company scorecard feed returned ${response.status}.`);
  const scorecard = await response.json();
  if (!isAggregateScorecard(scorecard)) throw new Error('Company scorecard feed returned an invalid or non-aggregate payload.');
  if (apply) {
    await mkdir(REPORT_DIR, { recursive: true });
    const stamp = scorecard.generatedAt.replace(/[:.]/g, '-');
    await Promise.all([
      writeFile(path.join(REPORT_DIR, 'company-scorecard-latest.json'), `${JSON.stringify(scorecard, null, 2)}\n`),
      writeFile(path.join(REPORT_DIR, `company-scorecard-${stamp}.json`), `${JSON.stringify(scorecard, null, 2)}\n`),
    ]);
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...scorecard }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchCompanyScorecard().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

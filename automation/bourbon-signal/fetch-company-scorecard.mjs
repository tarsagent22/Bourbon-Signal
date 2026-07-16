#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isAggregateScorecard } from '../../src/lib/ops-auth.ts';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');

function option(args, name, fallback = null) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const baseUrl = String(option(process.argv, 'url', process.env.BOURBON_SIGNAL_BASE_URL || 'https://www.bourbonsignal.com')).replace(/\/$/, '');
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is required.');
  const response = await fetch(`${baseUrl}/api/ops/company-scorecard`, {
    headers: { Authorization: `Bearer ${secret}` },
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

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

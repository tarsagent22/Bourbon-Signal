#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildStateRecoveryPlan, MAX_STATE_RECOVERY_ATTEMPTS } from './state-recovery-plan.mjs';

function option(argv, name, fallback = null) {
  const direct = argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

export async function runStateRecoveryPlanner(argv = process.argv.slice(2)) {
  const contractPath = path.resolve(option(argv, '--contract', 'out/site/state-health.json'));
  const contract = await readJson(contractPath);
  if (!contract?.states) throw new Error(`State operating contract is missing or invalid: ${contractPath}`);
  const ledgerPath = option(argv, '--verification-ledger');
  const ledger = ledgerPath ? await readJson(path.resolve(ledgerPath), { failures: [] }) : null;
  const explicit = option(argv, '--states');
  const ledgerFailureStateIds = ledger
    ? (ledger.failures || []).flatMap((failure) => failure.states || [])
    : [];
  const failedStateIds = explicit
    ? explicit.split(',')
    : ledgerFailureStateIds.length
      ? [...new Set([...(contract?.summary?.retryStateIds || []), ...ledgerFailureStateIds])]
      : null;
  const plan = buildStateRecoveryPlan(contract, {
    failedStateIds,
    attempt: option(argv, '--attempt', '0'),
    maxAttempts: option(argv, '--max-attempts', String(MAX_STATE_RECOVERY_ATTEMPTS)),
  });
  const githubOutput = option(argv, '--github-output') || process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    await appendFile(githubOutput, [
      `states=${plan.retryStateIds.join(',')}`,
      `next_attempt=${plan.nextAttempt}`,
      `has_recovery=${plan.retryStateIds.length > 0}`,
      '',
    ].join('\n'), 'utf8');
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runStateRecoveryPlanner()
    .then((plan) => console.log(JSON.stringify(plan, null, 2)))
    .catch((error) => { console.error(error); process.exit(1); });
}

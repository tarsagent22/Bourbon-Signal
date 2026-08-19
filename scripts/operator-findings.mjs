#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  MAX_FINDINGS_PER_REPORT,
  createFindingService,
  rankFindings,
  validateFinding,
} from './lib/operator-findings.mjs';

const execFileAsync = promisify(execFile);

function option(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

async function readFindings(file) {
  if (!file) throw new Error('--file is required for this command.');
  const payload = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const findings = Array.isArray(payload) ? payload : payload.findings;
  if (!Array.isArray(findings)) throw new Error('Finding input must be an array or an object with a findings array.');
  return findings;
}

async function runGh(args) {
  const { stdout } = await execFileAsync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, windowsHide: true });
  const output = stdout.trim();
  if (!output) return null;
  try { return JSON.parse(output); } catch { return output; }
}

function validationResult(findings) {
  const results = findings.map((finding, index) => ({ index, id: finding?.id || null, ...validateFinding(finding) }));
  const errors = results.filter((result) => !result.ok);
  if (findings.length > MAX_FINDINGS_PER_REPORT) errors.push({ index: null, id: null, ok: false, errors: [`report contains more than ${MAX_FINDINGS_PER_REPORT} findings`] });
  return { ok: errors.length === 0, count: findings.length, errors };
}

function printableActions(result) {
  return {
    mode: result.mode,
    actions: result.actions?.map((action) => ({ action: action.action, id: action.finding.id, issueNumber: action.issueNumber || null })) || {
      action: result.action.action,
      id: result.action.finding.id,
      issueNumber: result.action.issueNumber || null,
    },
  };
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const [command] = argv;
  const repo = option(argv, 'repo');
  const apply = argv.includes('--apply');
  const service = createFindingService({ runGh: dependencies.runGh || runGh });

  if (command === 'validate') {
    const findings = await readFindings(option(argv, 'file'));
    const result = validationResult(findings);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return result;
  }

  if (command === 'read') {
    const entries = await service.read({ repo, state: option(argv, 'state') || 'all' });
    const result = {
      count: entries.length,
      findings: entries.map(({ issue, finding }) => ({ issueNumber: issue.number, issueState: issue.state, url: issue.url, finding })),
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  if (command === 'rank') {
    const file = option(argv, 'file');
    const findings = file
      ? await readFindings(file)
      : (await service.read({ repo, state: option(argv, 'state') || 'open' })).map((entry) => entry.finding);
    const result = { count: findings.length, findings: rankFindings(findings).slice(0, MAX_FINDINGS_PER_REPORT) };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  if (command === 'upsert') {
    const findings = await readFindings(option(argv, 'file'));
    const result = await service.upsert({ findings, repo, apply });
    const printable = printableActions(result);
    console.log(JSON.stringify(printable, null, 2));
    return printable;
  }

  if (command === 'reconcile') {
    const findings = await readFindings(option(argv, 'file'));
    const source = option(argv, 'source');
    const resolvedIds = String(option(argv, 'resolved-ids') || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (!source) throw new Error('reconcile requires --source.');
    const result = await service.reconcile({ findings, resolvedIds, source, repo, apply });
    const printable = printableActions(result);
    console.log(JSON.stringify(printable, null, 2));
    return printable;
  }

  if (command === 'update') {
    const id = option(argv, 'id');
    const status = option(argv, 'status');
    if (!id || !status) throw new Error('update requires --id and --status.');
    const result = await service.update({ id, status, repo, apply });
    const printable = printableActions(result);
    console.log(JSON.stringify(printable, null, 2));
    return printable;
  }

  throw new Error('Usage: operator-findings.mjs validate --file FILE | read [--repo OWNER/REPO] | rank [--file FILE] | upsert --file FILE [--apply] | reconcile --file FILE --source SOURCE [--resolved-ids ID,ID] [--apply] | update --id ID --status STATUS [--apply]');
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

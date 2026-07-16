#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findingsFromRadar } from '../../scripts/lib/finding-adapters.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const DEFAULT_INPUT = path.join(ROOT, 'automation', 'bourbon-signal', 'release-radar-reported-stories.json');

function option(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

export async function buildRadarFindingReport({ input = DEFAULT_INPUT } = {}) {
  const ledger = JSON.parse(await readFile(path.resolve(input), 'utf8'));
  return {
    contractVersion: 'bourbon-signal/finding-report@1',
    generatedAt: ledger.updatedAt,
    source: 'release-radar',
    findings: findingsFromRadar(ledger),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const report = await buildRadarFindingReport({ input: option(argv, 'input') || DEFAULT_INPUT });
  if (argv.includes('--apply')) {
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(path.join(REPORT_DIR, 'radar-findings-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ mode: argv.includes('--apply') ? 'apply' : 'dry-run', ...report }, null, 2));
  return report;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

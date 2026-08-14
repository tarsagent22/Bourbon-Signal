#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDailyCompanyBrief, renderDailyCompanyBrief } from '../../scripts/lib/operator-briefs.mjs';
import { collectFindings, option, readGithubBacklog, readScorecard } from '../../scripts/lib/operator-report-inputs.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const DEFAULT_SCORECARD = path.join(REPORT_DIR, 'company-scorecard-latest.json');
const DEFAULT_FINDING_REPORTS = [
  'daily-reliability-latest.json',
  'weekly-engine-brief-latest.json',
  'source-roi-latest.json',
].map((file) => path.join(REPORT_DIR, file));

export async function generateDailyCompanyBrief(argv = process.argv.slice(2)) {
  const scorecard = await readScorecard(option(argv, 'scorecard') || DEFAULT_SCORECARD);
  const explicitFindings = option(argv, 'findings');
  const githubBacklog = option(argv, 'github-backlog');
  if (explicitFindings && githubBacklog) throw new Error('Use either --findings or --github-backlog, not both.');
  const findings = githubBacklog
    ? await readGithubBacklog(path.resolve(githubBacklog))
    : await collectFindings(explicitFindings ? explicitFindings.split(',').map((file) => path.resolve(file)) : DEFAULT_FINDING_REPORTS);
  const generatedAt = option(argv, 'at') || scorecard.generatedAt;
  const brief = buildDailyCompanyBrief({ scorecard, findings, generatedAt });
  const markdown = renderDailyCompanyBrief(brief);
  if (argv.includes('--apply')) {
    await mkdir(REPORT_DIR, { recursive: true });
    const stamp = generatedAt.replace(/[:.]/g, '-');
    await Promise.all([
      writeFile(path.join(REPORT_DIR, 'daily-company-brief-latest.json'), `${JSON.stringify(brief, null, 2)}\n`),
      writeFile(path.join(REPORT_DIR, 'daily-company-brief-latest.md'), markdown),
      writeFile(path.join(REPORT_DIR, `daily-company-brief-${stamp}.json`), `${JSON.stringify(brief, null, 2)}\n`),
      writeFile(path.join(REPORT_DIR, `daily-company-brief-${stamp}.md`), markdown),
    ]);
  }
  if (argv.includes('--json')) console.log(JSON.stringify({ mode: argv.includes('--apply') ? 'apply' : 'dry-run', ...brief }, null, 2));
  else console.log(markdown);
  return { brief, markdown, mode: argv.includes('--apply') ? 'apply' : 'dry-run' };
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) generateDailyCompanyBrief().catch((error) => { console.error(error.message); process.exitCode = 1; });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateFinding } from './operator-findings.mjs';

async function maybeReadJson(file) {
  try { return JSON.parse(await readFile(path.resolve(file), 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function readScorecard(file) {
  const payload = await maybeReadJson(file);
  const scorecard = payload?.scorecard || payload;
  if (scorecard?.contractVersion !== 'bourbon-signal/company-scorecard@1') throw new Error(`Canonical company scorecard not found at ${file}`);
  return scorecard;
}

export async function collectFindings(files) {
  const byId = new Map();
  for (const file of files) {
    const payload = await maybeReadJson(file);
    if (!payload) continue;
    const findings = Array.isArray(payload) ? payload : payload.findings;
    if (!Array.isArray(findings)) continue;
    for (const entry of findings) {
      const finding = { ...(entry.finding || entry) };
      delete finding.rankScore;
      const validation = validateFinding(finding);
      if (!validation.ok) throw new Error(`Invalid finding in ${file}: ${validation.errors.join('; ')}`);
      const current = byId.get(finding.id);
      if (!current || Date.parse(finding.observedAt) > Date.parse(current.observedAt)) byId.set(finding.id, finding);
    }
  }
  return [...byId.values()];
}

export async function readGithubBacklog(file) {
  const payload = await maybeReadJson(file);
  if (!payload || !Array.isArray(payload.findings) || payload.count !== payload.findings.length) {
    throw new Error(`Canonical GitHub backlog export not found at ${file}`);
  }
  const findings = [];
  for (const entry of payload.findings) {
    if (!Number.isInteger(entry?.issueNumber) || !['OPEN', 'CLOSED'].includes(entry?.issueState) || !entry.finding) {
      throw new Error(`Invalid canonical GitHub backlog entry in ${file}`);
    }
    const finding = { ...entry.finding };
    delete finding.rankScore;
    const validation = validateFinding(finding);
    if (!validation.ok) throw new Error(`Invalid finding in ${file}: ${validation.errors.join('; ')}`);
    findings.push(finding);
  }
  return findings;
}

export function option(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

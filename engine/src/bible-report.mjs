import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const bible = JSON.parse(await readFile(path.resolve('out/bourbon-bible.json'), 'utf8'));
const additions = JSON.parse(await readFile(path.resolve('data/bourbon-bible-additions.json'), 'utf8'));
const byTier = bible.records.reduce((acc, r) => { acc[r.tier] = (acc[r.tier] || 0) + 1; return acc; }, {});
const sourceCounts = {};
for (const r of bible.records) for (const s of r.sources || []) sourceCounts[s] = (sourceCounts[s] || 0) + 1;

const lines = [
  '# Bourbon Bible Expansion Report',
  '',
  `Generated: ${bible.generatedAt}`,
  '',
  `Canonical records: ${bible.count}`,
  '',
  '## Tier counts',
  '',
  ...Object.entries(byTier).sort().map(([tier, count]) => `- ${tier}: ${count}`),
  '',
  '## Cross-reference / alias decisions',
  '',
  ...(bible.verifiedAliasNotes || additions.verifiedAliasNotes || []).map((n) => `- **${n.canonical}:** ${n.note}`),
  '',
  '## New state-data additions',
  '',
  ...additions.families.map((f) => `- **${f.canonical}** (${f.tier}; ${f.producer || 'unknown producer'}) — aliases: ${(f.aliases || []).slice(0, 5).join(', ')} — sources: ${(f.sourceStates || []).join(', ')}`)
];
await writeFile(path.resolve('out/bourbon-bible-report.md'), lines.join('\n'));
console.log(`Bible report written for ${bible.count} records.`);

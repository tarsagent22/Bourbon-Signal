import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createLabelIndex, matchBottleLabel } = require('../apps/mobile/src/scanner/label-matching.ts') as typeof import('../apps/mobile/src/scanner/label-matching');
const { createBottleSearchIndex, rankBottleCatalog } = require('../apps/mobile/src/cellar/bottle-search.ts') as typeof import('../apps/mobile/src/cellar/bottle-search');
const { resolveLabeledBottleArtwork } = require('../shared/labeled-bottle-artwork.ts') as typeof import('../shared/labeled-bottle-artwork');
const seed: import('../apps/mobile/src/api/types').RadarBottleOption[] = require('../apps/mobile/src/cellar/bottle-catalog-seed.json');

const args = process.argv.slice(2);
const output = args.includes('--report') ? args[args.indexOf('--report') + 1] : undefined;
const input = args.includes('--input') ? args[args.indexOf('--input') + 1] : undefined;
const payload = input ? JSON.parse(await readFile(input, 'utf8')) : null;
const catalog = payload ? payload.bottles.map((b: any) => ({ ...b, name: b.canonicalName || b.name })) : seed;
const search = createBottleSearchIndex(catalog), labels = createLabelIndex(catalog);
const missingArtwork: object[] = [], missingSearch: object[] = [], missingLabel: object[] = [];
const measure = (work: () => unknown) => { const start = performance.now(); work(); return Math.round((performance.now() - start) * 100) / 100; };
let searchMs = 0, labelMs = 0, artworkMs = 0;
for (const bottle of catalog) {
  searchMs += measure(() => { if (!rankBottleCatalog(search, bottle.name, 12).some(b => b.id === bottle.id)) missingSearch.push({ id: bottle.id, name: bottle.name }); });
  labelMs += measure(() => { if (!matchBottleLabel(labels, bottle.name).some(b => b.id === bottle.id)) missingLabel.push({ id: bottle.id, name: bottle.name }); });
  artworkMs += measure(() => { if (!resolveLabeledBottleArtwork({ bottleId: bottle.id, bottleName: bottle.name }, catalog)) missingArtwork.push({ id: bottle.id, name: bottle.name }); });
}
const seedIds = new Set(seed.map(b => b.id));
const metadataConflicts = catalog.flatMap((b: any) => {
  const namedAge = b.name.match(/\b(\d{1,2})\s*(?:y|years?)\b/i)?.[1];
  const metadataAge = b.ageStatement?.match(/^0*(\d{1,2})\s*(?:y|years?)\b/i)?.[1];
  return namedAge && metadataAge && Number(namedAge) !== Number(metadataAge)
    ? [{ id: b.id, name: b.name, ageStatement: b.ageStatement, status: 'requires-source-review' }] : [];
});
const report = {
  checkedAt: new Date().toISOString(), scope: input || 'bundled offline catalog', bottles: catalog.length,
  uniqueIds: new Set(catalog.map((b: any) => b.id)).size,
  searchCoverage: catalog.length - missingSearch.length, labelTextCoverage: catalog.length - missingLabel.length,
  matchingArtwork: catalog.length - missingArtwork.length,
  notBundled: catalog.filter((b: any) => !seedIds.has(b.id)).map((b: any) => ({ id: b.id, name: b.name })),
  timingsMs: { searchAll: Math.round(searchMs), labelAll: Math.round(labelMs), artworkAll: Math.round(artworkMs) },
  missingSearch, missingLabel, missingArtwork,
  metadataConflicts,
  evidence: 'Exact catalog text retrieval and reviewed artwork identity only. This does not measure camera OCR or physical-device loading times.',
};
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, missingSearch: missingSearch.length, missingLabel: missingLabel.length, missingArtwork: missingArtwork.length, notBundled: report.notBundled.length }, null, 2));
if (args.includes('--require-search') && missingSearch.length) process.exitCode = 1;
if (args.includes('--require-label') && missingLabel.length) process.exitCode = 1;

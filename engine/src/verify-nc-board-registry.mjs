import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function fail(message) {
  throw new Error(`NC board registry verification failed: ${message}`);
}

const registry = await readJson(path.resolve('..', 'src', 'config', 'nc-abc-boards.json'));
const site = await readJson(path.resolve('out', 'site', 'locations.json'));
const boards = registry.boards || [];
if (registry.contractVersion !== 'bourbon-signal-nc-abc-board-registry-v1') fail('unsupported registry contract');
if (boards.length !== 173) fail(`expected 173 canonical board IDs, found ${boards.length}`);
if (new Set(boards.map((board) => board.id)).size !== boards.length) fail('canonical board IDs are not unique');
if (new Set(boards.map((board) => board.sourceId)).size !== boards.length) fail('official board source IDs are not unique');
const siteBoards = (site.locations || [])
  .filter((location) => location.state === 'NC' && location.type === 'county_board');
const siteBoardNames = new Set(siteBoards.map((location) => location.name));
const missing = boards.filter((board) => !siteBoardNames.has(board.label));
if (missing.length) fail(`${missing.length} canonical boards are missing from the checked-in customer export: ${missing.slice(0, 5).map((board) => board.label).join(', ')}`);
const officialSiteBoards = siteBoards.filter((location) => location.sourceUrl === registry.sourceUrl);
const canonicalByLabel = new Map(boards.map((board) => [board.label, board]));
const unexpectedOfficialRows = officialSiteBoards.filter((row) => !canonicalByLabel.has(row.name));
if (officialSiteBoards.length !== boards.length || unexpectedOfficialRows.length) {
  fail(`checked-in official board rows drifted: ${officialSiteBoards.length} rows, ${unexpectedOfficialRows.length} unexpected`);
}
for (const row of officialSiteBoards) {
  const canonical = canonicalByLabel.get(row.name);
  const sourceId = String(row.notes || '').match(/option id\s+(\d+)/i)?.[1] || '';
  if (!canonical || canonical.sourceId !== sourceId || canonical.id !== `nc-abc-board-${sourceId}`) {
    fail(`checked-in official board ID drifted for ${row.name}`);
  }
}
console.log(`NC board registry verified: all ${boards.length} canonical IDs are present in the checked-in customer export.`);

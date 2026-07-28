import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function fail(message) {
  throw new Error(`NC directory verification failed: ${message}`);
}

const official = await readJson(path.join(OUT, 'location-bible-official.json'));
const site = await readJson(path.join(OUT, 'site', 'locations.json'));
const canonicalRegistry = await readJson(path.resolve('..', 'src', 'config', 'nc-abc-boards.json'));
const canonicalBoards = canonicalRegistry.boards || [];
const officialNc = (official.locations || []).filter((location) => location.state === 'NC');
const siteNc = (site.locations || []).filter((location) => location.state === 'NC');
const boards = officialNc.filter((location) => location.type === 'county_board');
const stores = officialNc.filter((location) => location.type === 'store');
const ncSourceReport = (official.sourceReports || []).find((report) => report.id === 'NC_ABC_STORE_LOCATOR');
const sourceObservedAt = Date.parse(ncSourceReport?.observedAt || '');

if (!ncSourceReport || !['ok', 'partial'].includes(ncSourceReport.status)) fail('NC official locator source did not complete successfully');
if (ncSourceReport.boards !== canonicalBoards.length) fail(`NC official locator report has ${ncSourceReport.boards} boards; expected ${canonicalBoards.length}`);
if (!Number.isFinite(sourceObservedAt) || Date.now() - sourceObservedAt > 36 * 60 * 60 * 1000) fail('NC official locator source report is missing or older than 36 hours');
if (boards.length < 170) fail(`expected at least 170 official ABC boards, found ${boards.length}`);
if (stores.length < 450) fail(`expected at least 450 official ABC stores, found ${stores.length}`);

if (canonicalRegistry.contractVersion !== 'bourbon-signal-nc-abc-board-registry-v1') {
  fail('canonical board registry contract is missing or unsupported');
}
if (canonicalBoards.length !== 173) fail(`expected 173 canonical board IDs, found ${canonicalBoards.length}`);
if (new Set(canonicalBoards.map((board) => board.id)).size !== canonicalBoards.length) fail('canonical board IDs are not unique');
if (new Set(canonicalBoards.map((board) => board.label)).size !== canonicalBoards.length) fail('canonical board labels are not unique');

const canonicalByLabel = new Map(canonicalBoards.map((board) => [board.label, board]));
const officialByLabel = new Map(boards.map((board) => [board.name, board]));
const missingCanonicalBoards = canonicalBoards.filter((board) => !officialByLabel.has(board.label));
const unexpectedOfficialBoards = boards.filter((board) => !canonicalByLabel.has(board.name));
if (missingCanonicalBoards.length || unexpectedOfficialBoards.length) {
  fail(`canonical board/source mismatch: ${missingCanonicalBoards.length} missing, ${unexpectedOfficialBoards.length} unexpected`);
}
for (const canonical of canonicalBoards) {
  const officialBoard = officialByLabel.get(canonical.label);
  const sourceId = String(officialBoard?.notes || '').match(/option id\s+(\d+)/i)?.[1] || '';
  if (sourceId !== canonical.sourceId || canonical.id !== `nc-abc-board-${canonical.sourceId}`) {
    fail(`canonical board ID mismatch for ${canonical.label}`);
  }
}

const siteBoardNames = new Set(siteNc
  .filter((location) => location.type === 'county_board')
  .map((location) => location.name));
const omittedCanonicalBoards = canonicalBoards.filter((board) => !siteBoardNames.has(board.label));
if (omittedCanonicalBoards.length) fail(`${omittedCanonicalBoards.length} canonical boards were omitted from the customer location export`);

const malformedStores = stores.filter((store) => !store.id || !store.name || !store.address || !store.city || store.searchable === false);
if (malformedStores.length) fail(`${malformedStores.length} official stores lack a searchable identity, address, or city`);

const siteIds = new Set(siteNc.map((location) => location.id));
const omitted = officialNc.filter((location) => !siteIds.has(location.id));
if (omitted.length) fail(`${omitted.length} official NC boards/stores were omitted from the customer location export`);

console.log(`NC directory verified: ${canonicalBoards.length} canonical board IDs match ${boards.length} official boards, ${stores.length} official stores, ${new Set(stores.map((store) => store.city)).size} cities, and all ${officialNc.length} current official rows are exported.`);

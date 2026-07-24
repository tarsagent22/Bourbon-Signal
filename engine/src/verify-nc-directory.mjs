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
const officialNc = (official.locations || []).filter((location) => location.state === 'NC');
const siteNc = (site.locations || []).filter((location) => location.state === 'NC');
const boards = officialNc.filter((location) => location.type === 'county_board');
const stores = officialNc.filter((location) => location.type === 'store');

if (boards.length < 170) fail(`expected at least 170 official ABC boards, found ${boards.length}`);
if (stores.length < 450) fail(`expected at least 450 official ABC stores, found ${stores.length}`);

const malformedStores = stores.filter((store) => !store.id || !store.name || !store.address || !store.city || store.searchable === false);
if (malformedStores.length) fail(`${malformedStores.length} official stores lack a searchable identity, address, or city`);

const siteIds = new Set(siteNc.map((location) => location.id));
const omitted = officialNc.filter((location) => !siteIds.has(location.id));
if (omitted.length) fail(`${omitted.length} official NC boards/stores were omitted from the customer location export`);

console.log(`NC directory verified: ${boards.length} official boards, ${stores.length} official stores, ${new Set(stores.map((store) => store.city)).size} cities, all ${officialNc.length} current official rows exported.`);

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseNcStores, cleanHtml } from './lib/sighting-store-directory-sources.mjs';
const registry = JSON.parse(await readFile('src/config/nc-abc-boards.json', 'utf8'));
const capture = process.argv[2];
if (!capture) throw Error('Provide a source capture directory');
await mkdir(capture, { recursive: true });
const boards = []; let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < registry.boards.length) {
    const board = registry.boards[next++];
    const response = await fetch('https://abc2.nc.gov/Search/StoreSearch', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ StoreLocatorBoard: board.sourceId }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`${board.label}: ${response.status}`);
    const html = await response.text();
    await writeFile(`${capture}/${board.sourceId}.html`, html);
    const stores = parseNcStores(html, { id: board.sourceId, name: board.label });
    // Match the address in each official marker, never infer coordinates by row order.
    const markers = [...html.matchAll(/\['<div style="float:left;width:350px;">'[\s\S]*?,\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*,\s*\d+\]/g)];
    const members = stores.map(store => {
      const expected = `${store.address} ${store.city}, US NC ${store.zip}`;
      const matches = markers.filter(m => cleanHtml(m[0]).includes(expected));
      const point = matches.length === 1 ? { latitude: Number(matches[0][1]), longitude: Number(matches[0][2]) } : null;
      const valid = point && point.latitude > 33 && point.latitude < 37 && point.longitude > -85 && point.longitude < -75;
      return { id: store.id, name: store.name, address: store.address, city: store.city, state: 'NC', ...(valid ? point : {}) };
    });
    boards.push({ ...board, sourceUrl: `https://abc2.nc.gov/Districts/Board/${board.sourceId}`, sourceSha256: createHash('sha256').update(html).digest('hex'), members });
  }
}));
boards.sort((a,b) => a.id.localeCompare(b.id));
await writeFile('src/data/nearby-board-directory.json', JSON.stringify({ observedAt: new Date().toISOString(), sourceUrl: registry.sourceUrl, boards }, null, 2)+'\n');
console.log(JSON.stringify({ boards: boards.length, members: boards.reduce((n,b)=>n+b.members.length,0), mapped: boards.reduce((n,b)=>n+b.members.filter(s=>s.latitude).length,0), boardsWithoutPins: boards.filter(b=>!b.members.some(s=>s.latitude)).map(b=>b.label) }));

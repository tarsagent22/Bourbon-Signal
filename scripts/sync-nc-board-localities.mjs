import { readFile, writeFile } from "node:fs/promises";

// Discovery labels only. The Commission's county is the board office's county,
// not a claim that the board covers every store or town in that county.
const registry = JSON.parse(await readFile("src/config/nc-abc-boards.json", "utf8"));
const directory = JSON.parse(await readFile("src/data/sighting-store-directory.generated.json", "utf8"));
const rows = [];
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < registry.boards.length) {
    const board = registry.boards[next++];
    const sourceUrl = `https://abc2.nc.gov/Districts/Board/${board.sourceId}`;
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${board.filterLabel}: HTTP ${response.status}`);
    const html = await response.text();
    const county = html.match(/<label for="County">County<\/label>:[\s\S]*?<div class="col-6">([^<]+)<\/div>/)?.[1]?.trim();
    if (!county || !/^[A-Za-z .'-]+$/.test(county)) throw new Error(`Missing official county: ${board.filterLabel}`);
    const counts = new Map();
    for (const store of directory.stores.filter(store => store.state === "NC" && String(store.boardId) === board.sourceId && store.city)) counts.set(store.city, (counts.get(store.city) || 0) + 1);
    const cities = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
    rows.push({ value: board.filterLabel, county: `${county} County`, cities, sourceUrl });
  }
}));
rows.sort((a, b) => a.value.localeCompare(b.value));
await writeFile("src/config/nc-board-localities.json", JSON.stringify({
  observedAt: new Date().toISOString().slice(0, 10),
  storeDirectoryGeneratedAt: directory.generatedAt,
  note: "County identifies the board office; cities identify official store addresses. Discovery labels do not change board coverage or alert matching.",
  boards: rows,
}, null, 2) + "\n");
console.log(`Saved official locality labels for ${rows.length} existing boards.`);

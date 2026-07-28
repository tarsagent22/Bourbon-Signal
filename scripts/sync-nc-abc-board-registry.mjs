import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://abc2.nc.gov/Search/ABCStoreLocator";
const REGISTRY_PATH = path.resolve("src/config/nc-abc-boards.json");

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseBoards(html) {
  const select = html.match(/<select[^>]+name=["']StoreLocatorBoard["'][\s\S]*?<\/select>/i)?.[0];
  if (!select) throw new Error("Official NC StoreLocatorBoard selector was not found");
  return [...select.matchAll(/<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map((match) => {
      const sourceId = match[1].trim();
      const label = decodeHtml(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      return { sourceId, label };
    })
    .filter((board) => board.sourceId && board.label && !board.label.toLowerCase().startsWith("select "))
    .map((board) => ({
      id: `nc-abc-board-${board.sourceId}`,
      sourceId: board.sourceId,
      label: board.label,
      filterLabel: board.label.replace(/ Board$/, ""),
    }));
}

const response = await fetch(SOURCE_URL, {
  headers: { "user-agent": "BourbonSignalBoardRegistry/1.0 (+https://bourbonsignal.com)" },
});
if (!response.ok) throw new Error(`Official NC ABC board source returned HTTP ${response.status}`);
const boards = parseBoards(await response.text());
if (boards.length < 170) throw new Error(`Official NC ABC board source returned only ${boards.length} boards`);
if (new Set(boards.map((board) => board.id)).size !== boards.length) throw new Error("Official NC ABC board IDs are not unique");
if (new Set(boards.map((board) => board.label)).size !== boards.length) throw new Error("Official NC ABC board labels are not unique");

const current = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
const comparableCurrent = { sourceUrl: current.sourceUrl, boards: current.boards };
const comparableSource = { sourceUrl: SOURCE_URL, boards };
const changed = JSON.stringify(comparableCurrent) !== JSON.stringify(comparableSource);

if (process.argv.includes("--write")) {
  const next = {
    contractVersion: "bourbon-signal-nc-abc-board-registry-v1",
    sourceUrl: SOURCE_URL,
    observedAt: new Date().toISOString().slice(0, 10),
    boards,
  };
  await writeFile(REGISTRY_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`Wrote ${boards.length} official NC ABC boards to ${REGISTRY_PATH}.`);
} else if (changed) {
  throw new Error(`Canonical NC ABC board registry drifted from the official source (${current.boards?.length || 0} stored, ${boards.length} official). Run npm run update:nc-board-registry.`);
} else {
  console.log(`Canonical NC ABC board registry matches all ${boards.length} official board options.`);
}

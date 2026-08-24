import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer";
const FILES = {
  state: "2025_Gaz_state_national.zip",
  county: "2025_Gaz_counties_national.zip",
  place: "2025_Gaz_place_national.zip",
};
const OUTPUT = fileURLToPath(new URL("../src/data/us-geography-2025.generated.json", import.meta.url));

function zipText(buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Census ZIP has no end-of-central-directory record.");
  const entries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid Census ZIP central directory.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (name.toLowerCase().endsWith(".txt")) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid Census ZIP local entry.");
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(start, start + compressedSize);
      if (method === 0) return compressed.toString("utf8");
      if (method === 8) return inflateRawSync(compressed).toString("utf8");
      throw new Error(`Unsupported Census ZIP compression method ${method}.`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Census ZIP contains no text file.");
}

function parse(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split("|").map((value) => value.trim());
  return lines.map((line) => {
    const values = line.split("|");
    return Object.fromEntries(headers.map((header, index) => [header, String(values[index] || "").trim()]));
  });
}

async function download(name) {
  const url = `${BASE}/${name}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Census download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { url, bytes, rows: parse(zipText(bytes)), sha256: createHash("sha256").update(bytes).digest("hex") };
}

const [stateFile, countyFile, placeFile] = await Promise.all([
  download(FILES.state), download(FILES.county), download(FILES.place),
]);
const stateRows = stateFile.rows.filter((row) => row.USPS !== "PR");
const fipsToCode = new Map(stateRows.map((row) => [row.GEOID, row.USPS]));
const states = stateRows.map((row) => [row.GEOID, row.USPS, row.NAME]).sort((left, right) => left[1].localeCompare(right[1]));
const counties = countyFile.rows
  .filter((row) => fipsToCode.has(row.GEOID.slice(0, 2)))
  .map((row) => [row.GEOID, fipsToCode.get(row.GEOID.slice(0, 2)), row.NAME])
  .sort((left, right) => left[0].localeCompare(right[0]));
const places = placeFile.rows
  .filter((row) => fipsToCode.has(row.GEOID.slice(0, 2)))
  .map((row) => [row.GEOID, fipsToCode.get(row.GEOID.slice(0, 2)), row.NAME])
  .sort((left, right) => left[0].localeCompare(right[0]));
const output = {
  metadata: {
    schemaVersion: 1,
    vintage: "2025",
    publisher: "United States Census Bureau",
    product: "2025 U.S. Gazetteer Files",
    generatedAt: "2025-09-10",
    sources: [stateFile, countyFile, placeFile].map(({ url, sha256 }) => ({ url, sha256 })),
  },
  states,
  counties,
  places,
};
await writeFile(OUTPUT, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Wrote ${states.length} states, ${counties.length} counties, and ${places.length} places to ${OUTPUT}`);

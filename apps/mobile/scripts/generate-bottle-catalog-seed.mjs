import { writeFile } from "node:fs/promises";

const sourceUrl = process.argv[2] || "https://www.bourbonsignal.com/api/bottle-catalog";
const outputUrl = new URL("../src/cellar/bottle-catalog-seed.json", import.meta.url);
const response = await fetch(sourceUrl, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload?.bottles) || payload.bottles.length < 1100) {
  throw new Error(`Catalog is incomplete (${Array.isArray(payload?.bottles) ? payload.bottles.length : 0} bottles)`);
}
const compact = payload.bottles.map((bottle) => ({
  id: String(bottle.id || "").trim(),
  name: String(bottle.canonicalName || bottle.name || "").trim(),
  ...(Array.isArray(bottle.aliases) && bottle.aliases.length ? { aliases: bottle.aliases.filter(Boolean) } : {}),
  ...(bottle.brand ? { brand: String(bottle.brand) } : {}),
  ...(bottle.producer ? { producer: String(bottle.producer) } : {}),
  ...(Number.isFinite(bottle.proof) ? { proof: bottle.proof } : {}),
  ...(bottle.ageStatement ? { ageStatement: String(bottle.ageStatement) } : {}),
})).filter((bottle) => bottle.id && bottle.name)
  .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
await writeFile(outputUrl, `${JSON.stringify(compact)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, bottles: compact.length, output: outputUrl.pathname }));

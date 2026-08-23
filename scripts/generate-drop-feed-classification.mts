import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const outputUrl = new URL("../src/data/drop-feed-classification.generated.json", import.meta.url);
const compareCodeUnits = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const bibleModule = await import("../src/lib/bourbonBible.ts");
const { getBourbonBible } = (bibleModule.default || bibleModule) as typeof import("../src/lib/bourbonBible.ts");

const bible = await getBourbonBible();
const records = bible
  .map((bottle) => ({
    id: bottle.id,
    canonicalName: bottle.canonicalName,
    aliases: [...(bottle.aliases || [])].sort(),
    nationalTier: bottle.nationalTier,
    stateOverrides: [...(bottle.stateOverrides || [])]
      .map((override) => ({
        ...override,
        sourceIds: [...override.sourceIds].sort(),
      }))
      .sort((a, b) => compareCodeUnits(a.jurisdiction, b.jurisdiction)),
  }))
  .sort((a, b) => compareCodeUnits(a.id, b.id));

const expected = `${JSON.stringify({ modelVersion: "drop-feed-classification-v1", records })}\n`;
if (process.argv.includes("--write")) {
  await writeFile(outputUrl, expected, "utf8");
  console.log(`Wrote ${records.length} Drop Feed classification records.`);
} else {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  assert.equal(current, expected, "Drop Feed classification artifact is stale. Run npm run generate:drop-feed-classification.");
  console.log(`Drop Feed classification artifact is current (${records.length} records).`);
}

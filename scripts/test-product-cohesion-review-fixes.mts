import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const secure=r("src/lib/secure-backup-export.ts");
const local=r("scripts/backup-neon-local.mjs");
const web=r("src/app/dashboard/page.tsx");
const mobile=r("apps/mobile/app/(app)/(tabs)/cellar.tsx");
assert.match(secure,/BASE_REQUIRED_TABLES[\s\S]*?"hunt_outcomes"/);
assert.ok((local.match(/'hunt_outcomes'/g)||[]).length>=2);
for(const source of [web,mobile]){
  assert.match(source,/canWatchCellarSuggestions/);
  assert.match(source,/trackedBottleLimit/);
  assert.match(source,/Upgrade to watch|Standard adds Radar watch/);
}
console.log("Review-fix contracts passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sources = [
  "src/lib/faq-content.ts",
  "src/components/sections/HuntWorkflow.tsx",
  "src/components/sections/HowWeHunt.tsx",
  "docs/LAUNCH_MEMBERSHIP_PLAN.md",
  "docs/ALERT_STATE_PLAYBOOK.md",
  "docs/COMMUNITY_METADATA_STORAGE_DECISION.md",
  "docs/MOBILE_SIGNAL_API_V1.md",
  "apps/mobile/store/app-privacy.md",
  "apps/mobile/store/app-store-metadata.json",
].map(read).join("\n");

assert.doesNotMatch(sources, /worth acting on/i);
assert.doesNotMatch(sources, /(?:confirmed|unconfirmed) community/i, "Community copy does not expose a confirmed/unconfirmed taxonomy");
assert.doesNotMatch(sources, /public[^\n]{0,80}(?:two|2)[- ]hour[^\n]{0,80}countdown/i);
assert.doesNotMatch(sources, /My Collection (?:begins|starts) (?:at|with) Barrel/i);
assert.doesNotMatch(sources, /only\s+(?:10|ten)|10[- ]bottle limit/i, "the Free cap is never an acquisition headline");
assert.match(sources, /Standard[^\n]{0,160}unlimited (?:basic )?Cellar/i);
assert.match(sources, /Barrel[^\n]{0,160}Bourbon DNA/i);
assert.match(sources, /Hunt Outcome[^\n]{0,160}optional|optional[^\n]{0,160}Hunt Outcome/i);
assert.match(sources, /Hunt Outcome[^\n]{0,160}private|private[^\n]{0,160}Hunt Outcome/i);
assert.match(sources, /SMS/, "SMS remains documented as an active delivery channel");
assert.match(read("apps/mobile/store/app-privacy.md"), /Usage Data[^\n]*Product Interaction/);

console.log("Launch product copy and privacy contracts passed.");

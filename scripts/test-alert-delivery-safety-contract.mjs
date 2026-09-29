import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/alert-delivery.ts", import.meta.url), "utf8");
const timeZoneRoute = await readFile(new URL("../src/app/api/user/time-zone/route.ts", import.meta.url), "utf8");
const preferencesRoute = await readFile(new URL("../src/app/api/user/preferences/route.ts", import.meta.url), "utf8");
const repairScript = await readFile(new URL("../scripts/repair-clerk-alert-metadata.mts", import.meta.url), "utf8");

assert.match(source, /privateMetadata\.lifecycleTimeZone/,
  "alert delivery must use the member-captured IANA timezone");
assert.match(source, /skippedOutsideDeliveryHours/,
  "delivery summaries must distinguish quiet-hour suppression");
assert.match(source, /skippedMissingDeliveryTimeZone/,
  "delivery summaries must expose fail-closed missing-timezone suppression");
assert.ok((source.match(/isWithinMemberAlertDeliveryWindow\(/g) || []).length >= 4,
  "the local-time gate must run before member processing and again at email, SMS, and push provider boundaries");
assert.match(source, /compactClerkAlertDelivery\(/,
  "normal alert bookkeeping must use bounded Clerk metadata");
assert.doesNotMatch(source, /\.slice\(0,\s*1000\)/,
  "Clerk metadata must not retain thousand-entry baseline arrays");
assert.match(timeZoneRoute, /withMemberAlertLease\(userId/,
  "timezone capture must serialize with delivery and repair metadata writers");
assert.match(timeZoneRoute, /requireDurable:\s*true/,
  "timezone capture must fail closed when the shared lease is unavailable");
assert.match(preferencesRoute, /publicMetadataPatch\.monitoringScopes = compactMonitoringScopesForMetadata/,
  "future preference saves must keep monitoring scope metadata compact");
assert.match(repairScript, /if \(!renewed\) throw new Error\("Member alert lease was lost/,
  "repair apply and rollback must fail closed when lease renewal fails");
assert.match(repairScript, /repairRollbackIsSafe/,
  "repair rollback must compare the exact mutated fields before restoring them");
assert.match(repairScript, /async function updateRepairFieldsUnderLease/,
  "Clerk repair writes must be fenced by a dedicated lease-held wrapper");
assert.match(repairScript, /await updateRepairFields\([\s\S]*?await assertRepairLease/,
  "repair writes must prove lease ownership again after the Clerk mutation");

console.log("alert delivery safety contract verified");

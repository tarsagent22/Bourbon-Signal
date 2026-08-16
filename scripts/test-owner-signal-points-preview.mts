import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, settingsServer, settingsClient, pointsApi, redemptionsApi] = await Promise.all([
  readFile(new URL("../src/app/account/signal-points/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/settings/SettingsPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/signal-points/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/signal-points/redemptions/route.ts", import.meta.url), "utf8"),
]);
assert.match(route, /requireSignalPointsPageAccess/);
assert.match(route, /<SignalPointsPanel preview/);
assert.match(settingsServer, /if \(userId\)/);
assert.match(settingsServer, /\/account\/signal-points/);
assert.doesNotMatch(settingsClient, /Signal Points|SignalPointsPanel/, "ordinary account client bundle must not reveal the private preview");
assert.match(pointsApi, /requireSignalPointsApiAccess/);
assert.match(redemptionsApi, /requireSignalPointsApiAccess/);
console.log("Owner Signal Points preview contract passed.");

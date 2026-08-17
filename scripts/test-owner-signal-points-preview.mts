import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, dashboard, panel, settingsServer, settingsClient, pointsApi, redemptionsApi] = await Promise.all([
  readFile(new URL("../src/app/account/signal-points/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/SignalPointsPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/settings/SettingsPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/signal-points/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/signal-points/redemptions/route.ts", import.meta.url), "utf8"),
]);
assert.match(route, /requireSignalPointsPageAccess/);
assert.match(route, /<SignalPointsPanel preview/);
assert.match(dashboard, /import SignalPointsPanel/);
assert.match(dashboard, /<SignalPointsPanel[\s\S]*preview[\s\S]*compact[\s\S]*expanded=/);
assert.match(panel, /id="signal-points"[\s\S]*id="dashboard-section-memberPoints"/);
assert.doesNotMatch(settingsServer, /Signal Points|signal-points|ownerPreview/);
assert.doesNotMatch(settingsClient, /Signal Points|SignalPointsPanel/);
assert.match(pointsApi, /requireSignalPointsApiAccess/);
assert.match(redemptionsApi, /requireSignalPointsApiAccess/);
console.log("Dashboard Signal Points placement contract passed.");

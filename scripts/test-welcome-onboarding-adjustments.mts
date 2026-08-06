import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coverageMonitoringFootprint,
  welcomeLocalPreviewCanChooseTarget,
  welcomeLocalSearchPlaceholder,
} from "../src/lib/welcome-onboarding.ts";
import {
  retargetWelcomeLocalPreviewRecord,
  type WelcomeLocalPreviewRecord,
} from "../src/lib/welcome-local-preview.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const stateFixture = (code: string, name: string, overrides: Record<string, unknown> = {}) => ({
  code,
  name,
  areas: [],
  scope: {
    knownBoards: 0,
    verifiedSourceTargets: 0,
  },
  ...overrides,
});

const northCarolina = stateFixture("NC", "North Carolina", {
  areas: ["Charlotte", "Raleigh"],
  scope: { knownBoards: 173, verifiedSourceTargets: 47 },
});
const virginia = stateFixture("VA", "Virginia", {
  areas: ["Arlington"],
  scope: { knownBoards: 0, verifiedSourceTargets: 382 },
});
const emptyState = stateFixture("AK", "Alaska");

assert.equal(welcomeLocalSearchPlaceholder(northCarolina), "Try Charlotte or an ABC board");
assert.doesNotMatch(welcomeLocalSearchPlaceholder(northCarolina), /Arlington|Store 49/i);
assert.equal(welcomeLocalSearchPlaceholder(virginia), "Try Arlington or a store");
assert.equal(welcomeLocalSearchPlaceholder(emptyState), "Try a city or store in Alaska");

assert.deepEqual(coverageMonitoringFootprint(northCarolina), {
  count: 173,
  label: "ABC boards in monitoring library",
  unit: "boards",
});
assert.deepEqual(coverageMonitoringFootprint(virginia), {
  count: 382,
  label: "Stores in monitoring library",
  unit: "stores",
});
assert.deepEqual(coverageMonitoringFootprint(emptyState), {
  count: 0,
  label: "Stores in monitoring library",
  unit: "stores",
});

assert.equal(welcomeLocalPreviewCanChooseTarget("eligible"), true);
assert.equal(welcomeLocalPreviewCanChooseTarget("active"), true);
for (const status of ["loading", "expired", "ineligible", "error"] as const) {
  assert.equal(welcomeLocalPreviewCanChooseTarget(status), false, `${status} cannot choose a preview target`);
}

const existing: WelcomeLocalPreviewRecord = {
  userId: "user_1",
  redeemedAt: "2026-08-06T12:00:00.000Z",
  expiresAt: "2026-08-06T12:15:00.000Z",
  target: {
    kind: "store",
    stateCode: "VA",
    label: "Virginia ABC Store 49",
    status: "actively-monitored",
    city: "Arlington",
    address: "881 North Quincy Street Arlington VA 22203",
    areaLabel: "Arlington",
  },
  recent: [],
  earlier: [],
};
const retargeted = retargetWelcomeLocalPreviewRecord(existing, {
  target: {
    kind: "city",
    stateCode: "NC",
    label: "Charlotte",
    status: "actively-monitored",
    city: "Charlotte",
    address: null,
    areaLabel: "Charlotte",
  },
  recent: [{ historical: false, brand_name: "Example" }],
  earlier: [],
});
assert.equal(retargeted.userId, existing.userId);
assert.equal(retargeted.redeemedAt, existing.redeemedAt, "changing target must not restart the preview");
assert.equal(retargeted.expiresAt, existing.expiresAt, "changing target must not extend the preview");
assert.equal(retargeted.target.stateCode, "NC");
assert.equal(retargeted.recent.length, 1);

const welcomePage = read("src/app/welcome/page.tsx");
const previewRoute = read("src/app/api/welcome/local-preview/route.ts");
const previewRepository = read("src/lib/welcome-local-preview-repository.ts");
const coverageSummary = read("src/components/coverage/CoverageSummary.tsx");

assert.match(welcomePage, /welcomeLocalSearchPlaceholder\(coverageState \|\| fallbackCoverageState\(activeState\)\)/);
assert.match(welcomePage, /welcomeLocalPreviewCanChooseTarget\(localPreviewStatus\)/);
assert.match(welcomePage, /const runLocalPreviewSearch[\s\S]*!welcomeLocalPreviewCanChooseTarget\(localPreviewStatus\)/, "active previews can search for a replacement target");
assert.match(welcomePage, /localPreview\.target\.stateCode === activeState/);
assert.doesNotMatch(welcomePage, /placeholder="Try Arlington or Store 49"/);
assert.match(previewRoute, /context\.access === "active"/);
assert.match(previewRoute, /replaceWelcomeLocalPreview/);
assert.match(previewRepository, /expires_at > NOW\(\)/, "retarget writes must fail closed after expiration");
assert.match(coverageSummary, /coverageMonitoringFootprint\(state\)/);
assert.doesNotMatch(coverageSummary, /current signals/i);

console.log("Welcome onboarding adjustments contract passed.");

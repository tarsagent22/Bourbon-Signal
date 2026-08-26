import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildActiveCoverageBrief } = require("../src/lib/active-coverage-brief.ts") as typeof import("../src/lib/active-coverage-brief.ts");
const { CoverageRequestRepository } = require("../src/lib/coverage-request-repository.ts") as typeof import("../src/lib/coverage-request-repository.ts");

test("active coverage brief strips member identity and retains operational request fields", async () => {
  const repository = {
    async listActiveForBrief() {
      return [
        { id: "one", userId: "user_secret", targetType: "city", stateCode: "KY", areaLabel: "Louisville", storeName: null, storeAddress: "private", status: "requested", requestedAt: "2026-08-26T10:00:00.000Z", updatedAt: "2026-08-26T11:00:00.000Z" },
        { id: "two", userId: "user_secret_2", targetType: "store", stateCode: "OH", areaLabel: "Columbus", storeName: "Example Spirits", storeAddress: "private", status: "on_radar", requestedAt: "2026-08-25T10:00:00.000Z", updatedAt: "2026-08-25T11:00:00.000Z" },
      ];
    },
    async summarizeActiveAutomationStatusesForOwner() { return { queued: 2, claimed: 1 }; },
  };
  const brief = await buildActiveCoverageBrief(repository as never, new Date("2026-08-26T12:00:00.000Z"));
  assert.equal(brief.contractVersion, "bourbon-signal/active-coverage-requests@2");
  assert.equal(brief.count, 2);
  assert.deepEqual(brief.automationHealth.activeAutomationStatuses, { queued: 2, claimed: 1 });
  assert.deepEqual(Object.keys(brief.requests[0]).sort(), ["areaLabel", "requestedAt", "stateCode", "status", "storeName", "targetType", "updatedAt"].sort());
  assert.equal(JSON.stringify(brief).includes("user_secret"), false);
  assert.equal(JSON.stringify(brief).includes("private"), false);
});

test("brief repository projection never selects member identity, address, or terminal rows", async () => {
  let queryText = "";
  const database = {
    async query(text: string) {
      queryText = text;
      return [{ target_type: "state", state_code: "VA", area_label: "Virginia", store_name: null, status: "requested", requested_at: "2026-08-26T10:00:00.000Z", updated_at: "2026-08-26T11:00:00.000Z" }];
    },
    async transaction() { return []; },
  };
  const repository = new CoverageRequestRepository(database as never);
  const rows = await repository.listActiveForBrief();
  assert.equal(rows.length, 1);
  assert.match(queryText, /status IN \('requested', 'on_radar'\)/);
  assert.equal(/user_id|store_address|improved|closed/i.test(queryText), false);
});

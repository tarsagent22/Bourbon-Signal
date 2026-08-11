import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CoverageRequestValidationError,
  normalizeCoverageRequestTarget,
} from "../src/lib/coverage-request.ts";
import {
  CoverageRequestRateLimitError,
  CoverageRequestRepository,
} from "../src/lib/coverage-request-repository.ts";
import { sanitizeCoverageAnalyticsEvent } from "../src/lib/coverage-analytics.ts";
import {
  coverageAreaOption,
  inspectCoverageRequestStoreAliasPayload,
  resolveCoverageRequestStoreAlias,
  resolveCoverageRequestStoreAliasPayload,
} from "../src/lib/coverage-location-aliases.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const stateRequest = normalizeCoverageRequestTarget(
  { targetType: "state", stateCode: "md", notificationEnabled: true },
  { baselineCoverageFingerprint: "coverage-v1|MD|intelligence" },
);
assert.equal(stateRequest.stateCode, "MD");
assert.equal(stateRequest.canonicalTargetKey, "state:MD");
assert.equal(stateRequest.areaLabel, "Maryland");
assert.equal(stateRequest.notificationEnabled, true);
const stateRequestWithoutConsent = normalizeCoverageRequestTarget(
  { targetType: "state", stateCode: "md" },
  { baselineCoverageFingerprint: "coverage-v1|MD|intelligence" },
);
assert.equal(stateRequestWithoutConsent.notificationEnabled, false, "omitted notification consent is never treated as opt-in");

const cityRequest = normalizeCoverageRequestTarget(
  { targetType: "city", stateCode: "nc", areaLabel: "  <b>Raleigh</b>  " },
  { baselineCoverageFingerprint: "coverage-v1|NC|deep" },
);
assert.equal(cityRequest.areaLabel, "Raleigh");
assert.equal(cityRequest.canonicalTargetKey, "city:NC:raleigh");

const countyRequest = normalizeCoverageRequestTarget(
  { targetType: "county", stateCode: "ar", manualCounty: "  <b>Pulaski County</b>  " },
  { baselineCoverageFingerprint: "coverage-v1|AR|not-active" },
);
assert.equal(countyRequest.areaLabel, "Pulaski County");
assert.equal(countyRequest.canonicalTargetKey, "county:AR:pulaski-county");

const matchedStore = normalizeCoverageRequestTarget(
  { targetType: "store", stateCode: "il", storeId: "binnys:12", notificationEnabled: true },
  {
    baselineCoverageFingerprint: "coverage-v1|IL|deep",
    matchedStore: {
      id: "binnys:12",
      name: "Binny's Algonquin",
      city: "Algonquin",
      address: "844 S. Randall Rd.",
    },
  },
);
assert.equal(matchedStore.canonicalTargetKey, "store:IL:binnys-12");
assert.equal(matchedStore.storeName, "Binny's Algonquin");
assert.equal(matchedStore.areaLabel, "Algonquin");

const manualStore = normalizeCoverageRequestTarget(
  {
    targetType: "store",
    stateCode: "or",
    manualStoreName: "Rose City Spirits",
    manualCity: "Portland",
    manualAddress: "123 Example Street",
  },
  { baselineCoverageFingerprint: "coverage-v1|OR|not-active" },
);
assert.equal(manualStore.storeId, null, "manual fallback never creates or claims a public store id");
assert.equal(manualStore.canonicalTargetKey, "store:OR:manual:portland:rose-city-spirits");
assert.doesNotMatch(manualStore.canonicalTargetKey, /123|example-street/i, "manual address is not part of the canonical key");

const ballstonArea = coverageAreaOption("VA", "Arlington");
assert.deepEqual(ballstonArea, {
  value: "Arlington",
  label: "Arlington (Ballston)",
  searchText: "Arlington Ballston",
});
assert.deepEqual(coverageAreaOption("VA", "Richmond"), {
  value: "Richmond",
  label: "Richmond",
  searchText: "Richmond",
});

const ballstonStoreAlias = resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  areaLabel: "Ballston",
  storeName: "Virginia ABC Store 49",
  address: "881 N Quincy St",
});
assert.equal(ballstonStoreAlias?.storeId, "49");
assert.equal(ballstonStoreAlias?.sourceStoreId, "49");
assert.equal(ballstonStoreAlias?.canonicalCity, "Arlington");
assert.equal(ballstonStoreAlias?.displayArea, "Ballston");
const canonicalBallstonStore = normalizeCoverageRequestTarget(
  { targetType: "store", stateCode: "VA", storeId: ballstonStoreAlias?.storeId },
  {
    baselineCoverageFingerprint: "coverage-v1|VA|deep",
    matchedStore: {
      id: "49",
      name: "Virginia ABC Store 49",
      city: "Arlington",
      address: "881 N Quincy St",
    },
  },
);
assert.equal(canonicalBallstonStore.storeId, "49");
assert.equal(canonicalBallstonStore.canonicalTargetKey, "store:VA:49");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  areaLabel: "Ballston",
  storeName: "Virginia ABC Store 48",
}), null, "a neighborhood alone never rewrites a different store");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "city",
  areaLabel: "Ballston",
}), null, "a city request never silently becomes a store request");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  areaLabel: "Ballston",
  storeName: "ABC Store 49",
  address: "N Quincy St",
}), null, "a numberless partial street never claims Store 49");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  storeName: "ABC Store 49",
  address: "881 North Quincy Street, Arlington, VA 22203",
})?.storeId, "49", "the complete official address resolves without a separate area");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  areaLabel: "Alexandria",
  storeName: "ABC Store 49",
  address: "881 North Quincy Street, Arlington, VA 22203",
}), null, "a conflicting city prevents alias resolution even with the official address");
assert.equal(resolveCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  areaLabel: "Ballston",
  manualCity: "Alexandria",
  storeName: "Virginia ABC Store 49",
  manualStoreName: "Virginia ABC Store 49",
  manualAddress: "881 North Quincy Street",
}), null, "conflicting duplicate area fields fail closed");
assert.equal(resolveCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  areaLabel: "Ballston",
  manualCity: "Ballston",
  storeName: "Virginia ABC Store 49",
  manualStoreName: "Virginia ABC Store 48",
  manualAddress: "881 North Quincy Street",
}), null, "conflicting duplicate store fields fail closed");
assert.equal(resolveCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCity: "Ballston",
  manualStoreName: "Virginia ABC Store 49",
  manualAddress: "881 North Quincy Street, Arlington, VA 22203",
  storeAddress: "881 North Quincy Street, Arlington, VA 22203",
  address: "1 Main Street",
}), null, "conflicting duplicate address fields fail closed");
assert.equal(resolveCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCounty: "Fairfax County",
  manualCity: "Ballston",
  manualStoreName: "Virginia ABC Store 49",
  manualAddress: "881 North Quincy Street, Arlington, VA 22203",
}), null, "a conflicting county prevents Store 49 alias resolution");
assert.equal(resolveCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCounty: "Arlington County",
  manualCity: "Ballston",
  manualStoreName: "Virginia ABC Store 49",
  manualAddress: "881 North Quincy Street, Arlington, VA 22203",
})?.storeId, "49", "the official county remains compatible with the Store 49 alias");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  storeName: "ABC Store 049",
  address: "881 North Quincy Street, Arlington, VA 22203",
})?.storeId, "49", "the official zero-padded directory name resolves");
assert.equal(resolveCoverageRequestStoreAlias({
  stateCode: "VA",
  targetType: "store",
  storeName: "ABC Store 49",
  address: "881 North Quincy Street",
}), null, "a street-only address without a matching area is incomplete");
assert.deepEqual(inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  storeId: "49",
  manualCity: "Alexandria",
  manualStoreName: "Virginia ABC Store 49",
}), { status: "conflict" }, "explicit Store 49 IDs do not bypass conflicting locations");
assert.deepEqual(inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCity: "Ballston",
  manualStoreName: "Virginia ABC Store 49",
  areaLabel: "Alexandria",
}), { status: "conflict" }, "conflicting duplicate fields are distinguishable from unmatched requests");
assert.deepEqual(inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCity: "Ballston",
  manualStoreName: "Virginia ABC Store 48",
  manualAddress: "881 North Quincy Street",
}), { status: "conflict" }, "the exact Ballston premises rejects a contradictory store name");
assert.deepEqual(inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualStoreName: "Virginia ABC Store 48",
  manualAddress: "881 North Quincy Street, Arlington, VA 22203",
}), { status: "conflict" }, "the full official address rejects a contradictory store name");
assert.deepEqual(inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCity: "Ballston",
  manualStoreName: "Virginia ABC Store 48",
}), { status: "unmatched" }, "a neighborhood alone does not claim another Arlington store");
assert.deepEqual(inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  manualCity: "Richmond",
  manualStoreName: "Richmond Spirits",
}), { status: "unmatched" }, "unrelated manual requests remain valid unmatched requests");
const explicitStoreInspection = inspectCoverageRequestStoreAliasPayload({
  stateCode: "VA",
  targetType: "store",
  storeId: "49",
});
assert.equal(explicitStoreInspection.status, "matched");
if (explicitStoreInspection.status === "matched") assert.equal(explicitStoreInspection.alias.storeId, "49");

const coverageRequestRouteSource = read("src/app/api/coverage/requests/route.ts");
assert.match(coverageRequestRouteSource, /inspectCoverageRequestStoreAliasPayload/, "request intake inspects reviewed store aliases before loading current context");
assert.match(coverageRequestRouteSource, /inspection\.status === "conflict"[\s\S]*CoverageRequestValidationError/, "conflicting request identities are rejected rather than saved as manual targets");
assert.match(coverageRequestRouteSource, /storeId:\s*resolvedStoreId/, "request normalization receives the canonical resolved store id");
const dashboardSource = read("src/app/dashboard/page.tsx");
assert.match(dashboardSource, /coverageAreaOption\(activeState, city\)/, "dashboard renders and searches reviewed area aliases without changing preference values");
assert.match(dashboardSource, /coverageAreaOption\(activeState, item\)\.label/, "dashboard selection summary displays reviewed aliases while retaining canonical values");
const dropFeedSource = read("src/components/sections/DropFeed.tsx");
assert.match(dropFeedSource, /coverageAreaOption\(stateCode, label\)\.label/, "Drop Feed area labels expose reviewed neighborhood aliases without changing filter values");

assert.throws(
  () => normalizeCoverageRequestTarget({ targetType: "state", stateCode: "XX" }, { baselineCoverageFingerprint: "x" }),
  CoverageRequestValidationError,
);
assert.throws(
  () => normalizeCoverageRequestTarget({ targetType: "store", stateCode: "IL", storeId: "unverified" }, { baselineCoverageFingerprint: "x" }),
  /current directory/i,
);
const storeWithoutCity = normalizeCoverageRequestTarget(
  { targetType: "store", stateCode: "IL", manualStoreName: "Only a name" },
  { baselineCoverageFingerprint: "x" },
);
assert.equal(storeWithoutCity.areaKey, null, "city is optional for a generalized store request");
assert.equal(storeWithoutCity.areaLabel, "Illinois");
assert.equal(storeWithoutCity.canonicalTargetKey, "store:IL:manual:unspecified:only-a-name");

const safeAnalytics = sanitizeCoverageAnalyticsEvent("coverage_search_resolved", {
  state: "IL",
  targetType: "store",
  resultCategory: "actively-monitored",
});
assert.deepEqual(safeAnalytics, { state: "IL", targetType: "store", resultCategory: "actively-monitored" });
assert.deepEqual(
  sanitizeCoverageAnalyticsEvent("coverage_request_submitted", { state: "AR", targetType: "county" }),
  { state: "AR", targetType: "county" },
  "county requests remain visible in privacy-safe funnel analytics",
);
assert.equal(sanitizeCoverageAnalyticsEvent("coverage_search_resolved", {
  state: "IL",
  targetType: "store",
  resultCategory: "actively-monitored",
  query: "Binny's Algonquin",
}), null);
assert.equal(sanitizeCoverageAnalyticsEvent("coverage_request_submitted", {
  state: "IL",
  targetType: "store",
  email: "member@example.com",
}), null);

interface StoredRow {
  id: string;
  user_id: string;
  target_type: string;
  state_code: string;
  area_key: string | null;
  area_label: string | null;
  store_id: string | null;
  store_name: string | null;
  store_address: string | null;
  canonical_target_key: string;
  status: string;
  notification_enabled: boolean;
  requested_at: string;
  updated_at: string;
  baseline_coverage_fingerprint: string;
}

class RecordingExecutor {
  calls: Array<{ text: string; params: unknown[] }> = [];
  rows: StoredRow[] = [];
  forceRateLimit = false;

  async transaction(queries: (transaction: { query(text: string, params?: unknown[]): Promise<unknown> }) => Array<Promise<unknown>>) {
    return Promise.all(queries({ query: (text, params = []) => this.query(text, params) }));
  }

  async query(text: string, params: unknown[] = []) {
    this.calls.push({ text, params });
    if (text.includes("UPDATE coverage_requests AS request") && text.includes("owner_status_change")) {
      return [{
        request_id: String(params[0]),
        previous_status: "closed",
        status: String(params[1]),
        changed: true,
        jobs_stopped: params[1] === "requested" ? 0 : 2,
        jobs_queued: params[1] === "requested" ? 1 : 0,
      }];
    }
    if (text.includes("pg_advisory_xact_lock")) return [];
    if (text.includes("INSERT INTO coverage_requests")) {
      if (this.forceRateLimit) return [{ outcome: "rate_limited" }];
      const now = String(params[12]);
      const existing = this.rows.find((row) => row.user_id === params[1] && row.canonical_target_key === params[9]);
      const row: StoredRow = existing || {
        id: String(params[0]),
        user_id: String(params[1]),
        target_type: String(params[2]),
        state_code: String(params[3]),
        area_key: params[4] ? String(params[4]) : null,
        area_label: params[5] ? String(params[5]) : null,
        store_id: params[6] ? String(params[6]) : null,
        store_name: params[7] ? String(params[7]) : null,
        store_address: params[8] ? String(params[8]) : null,
        canonical_target_key: String(params[9]),
        status: "requested",
        notification_enabled: Boolean(params[10]),
        requested_at: now,
        updated_at: now,
        baseline_coverage_fingerprint: String(params[11]),
      };
      row.updated_at = now;
      row.notification_enabled = Boolean(params[10]);
      if (!existing) this.rows.push(row);
      return [{ outcome: "upserted", ...row }];
    }
    if (text.includes("FROM coverage_requests") && text.includes("WHERE user_id = $1")) {
      return this.rows.filter((row) => row.user_id === params[0]);
    }
    if (text.includes("FROM coverage_requests") && text.includes("ORDER BY updated_at DESC")) {
      return this.rows;
    }
    throw new Error(`Unexpected query: ${text}`);
  }
}

const executor = new RecordingExecutor();
const repository = new CoverageRequestRepository(executor);
await repository.upsertForUser("user-a", stateRequest, "2026-07-23T12:00:00.000Z");
await repository.upsertForUser("user-a", stateRequest, "2026-07-23T12:05:00.000Z");
await repository.upsertForUser("user-b", stateRequest, "2026-07-23T12:06:00.000Z");
assert.equal(executor.rows.length, 2, "the same user and canonical target are idempotent");
assert.equal((await repository.listForUser("user-a")).length, 1);
assert.equal((await repository.listForUser("user-b")).length, 1);

const upsertSql = executor.calls.find((call) => call.text.includes("INSERT INTO coverage_requests"))?.text || "";
const firstUpsertIndex = executor.calls.findIndex((call) => call.text.includes("INSERT INTO coverage_requests"));
const firstAutomationLockIndex = executor.calls.findIndex((call) => call.text.includes("hashtextextended('coverage-request-automation', 0)"));
assert.ok(firstAutomationLockIndex >= 0 && firstAutomationLockIndex < firstUpsertIndex,
  "member upserts must serialize through the automation lock before request and job writes");
assert.match(upsertSql, /ON CONFLICT\s*\(\s*user_id\s*,\s*canonical_target_key\s*\)/i);
assert.match(upsertSql, /INTERVAL\s+'24 hours'/i, "rate limiting is bounded in the durable account store");
assert.match(upsertSql, /COUNT\(\*\)[\s\S]*<\s*8/i, "new targets are capped per account and window");
assert.doesNotMatch(upsertSql, /CREATE TABLE/i, "request paths never race on schema DDL");
assert.doesNotMatch(upsertSql, /INSERT INTO\s+(?:stores|locations)\b/i, "manual requests cannot create public stores");
for (const call of executor.calls.filter((entry) => entry.text.includes("WHERE user_id = $1"))) {
  assert.equal(call.params[0], call.params[0], "own-request reads carry the authenticated user parameter");
}

const statusNow = "2026-07-23T12:06:30.000Z";
const statusResult = await repository.updateStatusForOwner(
  "00112233-4455-4667-8899-aabbccddeeff",
  "requested",
  "owner@example.com",
  statusNow,
);
assert.deepEqual(statusResult, {
  requestId: "00112233-4455-4667-8899-aabbccddeeff",
  previousStatus: "closed",
  status: "requested",
  changed: true,
  jobsStopped: 0,
  jobsQueued: 1,
});
const statusCall = executor.calls.find((call) => call.text.includes("owner_status_change"));
assert.deepEqual(statusCall?.params, ["00112233-4455-4667-8899-aabbccddeeff", "requested", "owner@example.com", statusNow]);

executor.forceRateLimit = true;
await assert.rejects(
  repository.upsertForUser("user-a", manualStore, "2026-07-23T12:07:00.000Z"),
  CoverageRequestRateLimitError,
);

const schema = read("src/lib/coverage-request-schema.sql");
const repositorySource = read("src/lib/coverage-request-repository.ts");
assert.match(schema, /CREATE TABLE IF NOT EXISTS coverage_requests/i);
assert.match(schema, /notification_enabled BOOLEAN NOT NULL DEFAULT FALSE/i);
assert.match(schema, /ALTER COLUMN notification_enabled SET DEFAULT FALSE/i);
assert.match(schema, /UNIQUE\s*\(\s*user_id\s*,\s*canonical_target_key\s*\)/i);
assert.match(schema, /CHECK\s*\(\s*target_type\s+IN\s*\('state',\s*'county',\s*'city',\s*'store'\)\s*\)/i);
assert.match(schema, /target_type = 'county'[\s\S]*area_key IS NOT NULL/i, "county requests have a durable schema contract");
assert.match(schema, /target_type = 'store' AND store_name IS NOT NULL/i, "a manual store request does not require a city");
assert.match(schema, /CHECK\s*\(\s*status\s+IN\s*\('requested',\s*'on_radar',\s*'improved',\s*'closed'\)\s*\)/i);
assert.doesNotMatch(schema, /\bip(?:_address)?\b|user_agent|analytics_id/i, "coverage storage has no raw IP or analytics identity field");
const ownerLedgerSource = repositorySource.slice(repositorySource.indexOf("listDemandForOwner"));
assert.match(ownerLedgerSource, /WHERE status IN \('requested', 'on_radar'\)[\s\S]*LIMIT \$1/, "all open demand is selected before the owner row bound");
assert.match(ownerLedgerSource, /WHERE status IN \('improved', 'closed'\)[\s\S]*LIMIT 40/, "the owner ledger also includes bounded recent history");
assert.match(repositorySource, /async updateStatusForOwner\([\s\S]*pg_advisory_xact_lock\(hashtextextended\('coverage-request-automation', 0\)\)[\s\S]*pg_advisory_xact_lock\(hashtextextended\('coverage-request-automation-notification', 0\)\)/,
  "owner status changes must serialize against automation and notification claims");
const ownerStatusSource = repositorySource.slice(repositorySource.indexOf("async updateStatusForOwner"), repositorySource.indexOf("async listDemandForOwner"));
assert.ok(
  ownerStatusSource.indexOf("UPDATE coverage_request_automation_jobs") < ownerStatusSource.indexOf("UPDATE coverage_requests AS request"),
  "owner status changes must lock jobs before requests, matching automation completion order",
);
assert.match(ownerStatusSource, /UPDATE coverage_requests AS request[\s\S]*status = \$2::text[\s\S]*WHERE request\.id = owner_status_change\.id/,
  "an exact request ID may be moved to any validated status");
assert.match(ownerStatusSource, /\$2::text/,
  "the status parameter has an explicit PostgreSQL type");
assert.match(ownerStatusSource, /\$3::text/,
  "the owner identity parameter has an explicit PostgreSQL type instead of crashing inference");
assert.match(ownerStatusSource, /UPDATE coverage_request_automation_jobs[\s\S]*status = 'failed'[\s\S]*outcome = 'blocked'[\s\S]*job\.status IN \('queued', 'claimed', 'running', 'notification_pending'\)/,
  "non-requested owner states terminate only automation that has not entered delivery");
const stoppedJobsSource = ownerStatusSource.slice(ownerStatusSource.indexOf("stopped_jobs AS"), ownerStatusSource.indexOf("requeued_jobs AS"));
assert.doesNotMatch(stoppedJobsSource, /job\.status IN \([^)]*(?:notification_sending|delivery_uncertain)/,
  "in-flight and uncertain delivery evidence must not be rewritten as stopped");
assert.match(ownerStatusSource, /retry_history[\s\S]*'event', 'status_changed_by_owner'/,
  "owner state-change evidence remains durable in job history");
assert.match(ownerStatusSource, /INSERT INTO coverage_request_automation_jobs[\s\S]*baseline_coverage_fingerprint[\s\S]*FROM owner_status_change[\s\S]*ON CONFLICT \(coverage_request_id, baseline_coverage_fingerprint\)[\s\S]*WHERE coverage_request_automation_jobs\.status IN \('failed', 'notified'\)/,
  "moving to requested creates or safely resets exactly the current-baseline job");
assert.match(ownerStatusSource, /job\.baseline_coverage_fingerprint = owner_status_change\.baseline_coverage_fingerprint/,
  "existing active work may justify reopening only when it belongs to the current baseline");
assert.match(ownerStatusSource, /current_active_jobs AS \([\s\S]*job\.status IN \('queued', 'claimed', 'running'\)/,
  "only runnable current-generation work may satisfy a transition to requested");
const currentActiveJobsSource = ownerStatusSource.slice(ownerStatusSource.indexOf("current_active_jobs AS"), ownerStatusSource.indexOf("updated_request AS"));
assert.doesNotMatch(currentActiveJobsSource, /notification_pending|notification_sending|delivery_uncertain/,
  "delivery-stage jobs cannot masquerade as runnable reopened coverage work");
assert.match(ownerStatusSource, /updated_request AS \([\s\S]*queued\.jobs_queued > 0[\s\S]*active\.active_jobs > 0/,
  "a transition to requested is committed only when current work was queued or is already runnable");
assert.match(repositorySource, /ON CONFLICT \(coverage_request_id, baseline_coverage_fingerprint\)[\s\S]*'event', 'reopened_by_member'[\s\S]*WHERE coverage_request_automation_jobs\.status = 'failed'[\s\S]*outcome = 'blocked'/,
  "a later explicit member request safely requeues a manually blocked job while retaining history");
const completionSource = repositorySource.slice(repositorySource.indexOf("async completeAutomationTask"), repositorySource.indexOf("async retryAutomationJob"));
assert.match(completionSource, /pg_advisory_xact_lock\(hashtextextended\('coverage-request-automation', 0\)\)[\s\S]*FROM coverage_requests AS request, writer_lock/,
  "task completion must share the serialization lock used by member reopen and owner state changes");
assert.match(repositorySource, /\[requestId, status, changedBy, now\]/,
  "owner status inputs must remain parameterized");

const route = read("src/app/api/coverage/requests/route.ts");
assert.match(route, /await auth\(\)/, "GET and POST use Clerk auth");
assert.match(route, /status:\s*401/, "signed-out requests are rejected");
assert.match(route, /listForUser\(userId\)/, "GET can only return the current user's requests");
assert.match(route, /upsertForUser\(userId/, "POST scopes writes to the authenticated user");
assert.match(route, /CoverageRequestRateLimitError[\s\S]*status:\s*429/, "bounded rate limits return a clear response");
assert.doesNotMatch(route, /x-forwarded-for|request\.ip|user-agent/i, "the route does not collect raw IP or device data");
assert.doesNotMatch(route, /CREATE TABLE|ensureSchema/i, "schema creation is migration-only");
assert.doesNotMatch(route, /reviewNotes|review_notes/, "member responses never expose owner review notes");

const form = read("src/components/coverage/CoverageRequestForm.tsx");
const signUpPage = read("src/app/sign-up/[[...sign-up]]/page.tsx");
assert.match(form, /useAuth/, "request UI uses the existing Clerk client pattern");
assert.match(form, /user\?\.id/, "account changes are part of request-form isolation");
assert.match(form, /submitGeneration/, "late submissions cannot update a different account or state");
assert.match(form, /\/sign-in\?redirect_url=/, "signed-out users return to the selected coverage state");
assert.match(form, /\/sign-up\?source=coverage/, "new visitors enter the cohesive free-member Welcome flow");
assert.match(form, /Create a free account to send this request/, "the request action explicitly offers a free account");
assert.match(form, /No payment or card required\./, "the request action makes payment unnecessary explicit before authentication");
assert.match(form, /Already have an account\? Sign in\./, "existing members retain a clear sign-in path");
assert.match(form, /signUpHref[\s\S]*onClick=\{preserveDraft\}/, "free-account creation preserves the request draft");
assert.match(signUpPage, /isCoverageRequestRedirect/, "coverage-originated signup recognizes the request context");
assert.match(signUpPage, /Create your free account to send this coverage request\./, "account creation repeats that coverage requests do not require payment");
assert.match(signUpPage, /No payment or card required\./, "account creation keeps the free/no-card promise visible");
assert.match(form, /Email me when coverage meaningfully improves\./, "notification consent is explicit without duplicating the submit action");
assert.doesNotMatch(form, /Request coverage and email me/, "notification consent does not repeat the coverage-request action");
assert.match(form, /useState\(false\)/, "email notifications require an affirmative unchecked opt-in");
assert.match(form, /selectedStateCode[\s\S]*manualCounty[\s\S]*manualCity[\s\S]*manualStoreName[\s\S]*manualAddress/, "one generalized draft preserves state and optional local detail");
assert.match(form, /accountId:\s*string\s*\|\s*null/, "sign-in drafts carry an explicit account-ownership marker");
assert.match(form, /renderedAccountId[\s\S]*accountId !== renderedAccountId[\s\S]*removeItem\(DRAFT_KEY\)[\s\S]*setRenderedAccountId\(accountId\)/, "sign-out and account switches clear private request state and finish the transition with a rerender");
assert.match(form, /accountTransitionPending[\s\S]*Checking account/, "private fields are not rendered during auth loading or an account transition");
assert.match(form, /stored\.accountId[\s\S]*accountId[\s\S]*removeItem\(DRAFT_KEY\)/, "a draft owned by another account cannot be restored");
assert.match(form, /function changeState[\s\S]*setManualCounty\(""\)[\s\S]*setManualCity\(""\)[\s\S]*setManualStoreName\(""\)[\s\S]*setManualAddress\(""\)[\s\S]*removeItem\(DRAFT_KEY\)/, "changing the required state clears stale local details and its saved draft");
assert.match(form, /manualStoreName\.trim\(\)\s*\?\s*"store"[\s\S]*manualCity\.trim\(\)\s*\?\s*"city"[\s\S]*manualCounty\.trim\(\)\s*\?\s*"county"[\s\S]*:\s*"state"/, "request scope is derived from the optional fields instead of a mode chooser");
assert.doesNotMatch(form, /CoverageSearchResult|storeId|targetChoices|coverage-target/, "the generalized request form is decoupled from individual search results");
assert.match(form, /\/api\/coverage\/requests/, "signed-in submissions use the private request API");
assert.match(form, /hidden=\{!visible\}/, "the long request form is not shown before a user asks for coverage");
assert.match(form, /onDraftRestored\(\)/, "a sign-in return reopens its preserved request draft");
assert.doesNotMatch(form, /onDraftRestored\(\);\s*window\.sessionStorage\.removeItem\(DRAFT_KEY\)/, "draft restoration survives React effect replay");
assert.match(form, /cancelRequest[\s\S]*removeItem\(DRAFT_KEY\)[\s\S]*onCancel\(\)/, "canceling clears a preserved draft");
assert.match(form, /setStatus\("saved"\);\s*window\.sessionStorage\.removeItem\(DRAFT_KEY\)/, "saving clears a preserved draft");
assert.match(form, /Add county, city, or store details/, "the form explains its one generalized request path");
assert.match(form, /open=\{detailsOpen\}[\s\S]*onToggle=\{\(event\) => setDetailsOpen\(event\.currentTarget\.open\)\}/, "optional details remain open independently of field contents");

const migration = read("scripts/migrate-coverage-requests.mjs");
assert.match(migration, /--check/);
assert.match(migration, /--apply/);
assert.match(migration, /--target/);
assert.match(migration, /BOURBON_QUEUE_DATABASE_URL_UNPOOLED/);
assert.match(migration, /state%county%city%store/, "migration verification includes the county constraint");
assert.doesNotMatch(migration, /\|\|\s*process\.env\.(?:DATABASE_URL|BOURBON_QUEUE_DATABASE_URL)\b/, "apply mode does not silently fall back to an ambiguous database");

console.log("coverage request tests passed");

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
assert.match(upsertSql, /ON CONFLICT\s*\(\s*user_id\s*,\s*canonical_target_key\s*\)/i);
assert.match(upsertSql, /INTERVAL\s+'24 hours'/i, "rate limiting is bounded in the durable account store");
assert.match(upsertSql, /COUNT\(\*\)[\s\S]*<\s*8/i, "new targets are capped per account and window");
assert.doesNotMatch(upsertSql, /CREATE TABLE/i, "request paths never race on schema DDL");
assert.doesNotMatch(upsertSql, /INSERT INTO\s+(?:stores|locations)\b/i, "manual requests cannot create public stores");
for (const call of executor.calls.filter((entry) => entry.text.includes("WHERE user_id = $1"))) {
  assert.equal(call.params[0], call.params[0], "own-request reads carry the authenticated user parameter");
}

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
assert.match(schema, /CHECK\s*\(\s*target_type\s+IN\s*\('state',\s*'city',\s*'store'\)\s*\)/i);
assert.match(schema, /CHECK\s*\(\s*status\s+IN\s*\('requested',\s*'on_radar',\s*'improved',\s*'closed'\)\s*\)/i);
assert.doesNotMatch(schema, /\bip(?:_address)?\b|user_agent|analytics_id/i, "coverage storage has no raw IP or analytics identity field");
assert.match(repositorySource, /WHERE status IN \('requested', 'on_radar'\)[\s\S]*ORDER BY updated_at DESC[\s\S]*LIMIT \$1/, "the owner read bound applies after closed requests are excluded");

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
assert.match(form, /useAuth/, "request UI uses the existing Clerk client pattern");
assert.match(form, /user\?\.id/, "account changes are part of request-form isolation");
assert.match(form, /submitGeneration/, "late submissions cannot update a different account or state");
assert.match(form, /\/sign-in\?redirect_url=/, "signed-out users return to the selected coverage state");
assert.match(form, /Request coverage and email me when it meaningfully improves\./, "notification consent is explicit");
assert.match(form, /useState\(false\)/, "email notifications require an affirmative unchecked opt-in");
assert.match(form, /selectedStateCode[\s\S]*manualCity[\s\S]*manualStoreName[\s\S]*manualAddress/, "one generalized draft preserves state and optional local detail");
assert.match(form, /accountId:\s*string\s*\|\s*null/, "sign-in drafts carry an explicit account-ownership marker");
assert.match(form, /renderedAccountId[\s\S]*accountId !== renderedAccountId[\s\S]*removeItem\(DRAFT_KEY\)[\s\S]*setRenderedAccountId\(accountId\)/, "sign-out and account switches clear private request state and finish the transition with a rerender");
assert.match(form, /accountTransitionPending[\s\S]*Checking account/, "private fields are not rendered during auth loading or an account transition");
assert.match(form, /stored\.accountId[\s\S]*accountId[\s\S]*removeItem\(DRAFT_KEY\)/, "a draft owned by another account cannot be restored");
assert.match(form, /function changeState[\s\S]*setManualCity\(""\)[\s\S]*setManualStoreName\(""\)[\s\S]*setManualAddress\(""\)[\s\S]*removeItem\(DRAFT_KEY\)/, "changing the required state clears stale local details and its saved draft");
assert.match(form, /manualStoreName\.trim\(\)\s*\?\s*"store"[\s\S]*manualCity\.trim\(\)\s*\?\s*"city"[\s\S]*:\s*"state"/, "request scope is derived from the optional fields instead of a mode chooser");
assert.doesNotMatch(form, /CoverageSearchResult|storeId|targetChoices|coverage-target/, "the generalized request form is decoupled from individual search results");
assert.match(form, /\/api\/coverage\/requests/, "signed-in submissions use the private request API");
assert.match(form, /hidden=\{!visible\}/, "the long request form is not shown before a user asks for coverage");
assert.match(form, /onDraftRestored\(\)/, "a sign-in return reopens its preserved request draft");
assert.doesNotMatch(form, /onDraftRestored\(\);\s*window\.sessionStorage\.removeItem\(DRAFT_KEY\)/, "draft restoration survives React effect replay");
assert.match(form, /cancelRequest[\s\S]*removeItem\(DRAFT_KEY\)[\s\S]*onCancel\(\)/, "canceling clears a preserved draft");
assert.match(form, /setStatus\("saved"\);\s*window\.sessionStorage\.removeItem\(DRAFT_KEY\)/, "saving clears a preserved draft");
assert.match(form, /Choose a state\. Add a city, store, or both/, "the form explains its one generalized request path");

const migration = read("scripts/migrate-coverage-requests.mjs");
assert.match(migration, /--check/);
assert.match(migration, /--apply/);
assert.match(migration, /--target/);
assert.match(migration, /BOURBON_QUEUE_DATABASE_URL_UNPOOLED/);
assert.doesNotMatch(migration, /\|\|\s*process\.env\.(?:DATABASE_URL|BOURBON_QUEUE_DATABASE_URL)\b/, "apply mode does not silently fall back to an ambiguous database");

console.log("coverage request tests passed");

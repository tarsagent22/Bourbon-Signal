import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authorizeOpsBearer, isAggregateScorecard } from "../src/lib/ops-auth.ts";
import {
  fetchCompanyScorecard,
  readScorecardSecret,
  resolveScorecardFeedUrl,
} from "../automation/bourbon-signal/fetch-company-scorecard.mjs";

assert.equal(authorizeOpsBearer("Bearer correct", "correct"), true);
assert.equal(authorizeOpsBearer("Bearer wrong", "correct"), false);
assert.equal(authorizeOpsBearer(null, ""), false, "the scorecard feed must require its secret locally too");
assert.equal(isAggregateScorecard({ contractVersion: "bourbon-signal/company-scorecard@1", generatedAt: new Date().toISOString(), sections: { company: {}, product: {}, data: {}, shipping: {}, decision: {} } }), true);
assert.equal(isAggregateScorecard({ email: "person@example.com", dimensions: {} }), false);

assert.equal(resolveScorecardFeedUrl("https://www.bourbonsignal.com"), "https://www.bourbonsignal.com/api/ops/company-scorecard");
assert.equal(resolveScorecardFeedUrl("https://bourbonsignal.com/"), "https://bourbonsignal.com/api/ops/company-scorecard");
assert.equal(resolveScorecardFeedUrl("https://localhost:3000"), "https://localhost:3000/api/ops/company-scorecard");
assert.equal(resolveScorecardFeedUrl("https://127.0.0.1:3000/"), "https://127.0.0.1:3000/api/ops/company-scorecard");
for (const unsafeUrl of [
  "http://www.bourbonsignal.com",
  "http://localhost:3000",
  "https://evil.example",
  "https://www.bourbonsignal.com.evil.example",
  "https://localhost:4443",
  "https://user:pass@www.bourbonsignal.com",
  "https://www.bourbonsignal.com/redirect",
  "https://www.bourbonsignal.com?next=https://evil.example",
]) {
  assert.throws(() => resolveScorecardFeedUrl(unsafeUrl), /allowlisted HTTPS origin/, `credentials must never be sent to ${unsafeUrl}`);
}
assert.equal(readScorecardSecret({ COMPANY_SCORECARD_READ_SECRET: "read-only", CRON_SECRET: "send-capable" }), "read-only");
assert.throws(() => readScorecardSecret({ CRON_SECRET: "send-capable" }), /COMPANY_SCORECARD_READ_SECRET/, "a send-capable cron secret must never be reused");
for (const mutationSecret of ["CRON_SECRET", "ALERT_DELIVERY_SECRET", "WEEKLY_INTELLIGENCE_DELIVERY_SECRET"] as const) {
  assert.throws(
    () => readScorecardSecret({ COMPANY_SCORECARD_READ_SECRET: "same", [mutationSecret]: "same" }),
    /distinct from every mutation or delivery secret/,
    `the read-only secret must be distinct from ${mutationSecret}`,
  );
}

const aggregate = { contractVersion: "bourbon-signal/company-scorecard@1", generatedAt: "2026-07-16T00:00:00.000Z", sections: { company: {}, product: {}, data: {}, shipping: {}, decision: {} } };
let authenticatedRequest: { url: string; init: RequestInit } | null = null;
const originalLog = console.log;
console.log = () => {};
try {
  await fetchCompanyScorecard({
    args: ["node", "fetch-company-scorecard.mjs", "--url=https://www.bourbonsignal.com"],
    env: { COMPANY_SCORECARD_READ_SECRET: "read-only", CRON_SECRET: "send-capable" },
    fetchImpl: async (url: string, init: RequestInit) => {
      authenticatedRequest = { url, init };
      return { ok: true, json: async () => aggregate };
    },
  });
} finally {
  console.log = originalLog;
}
assert.equal(authenticatedRequest?.url, "https://www.bourbonsignal.com/api/ops/company-scorecard");
assert.deepEqual(authenticatedRequest?.init.headers, { Authorization: "Bearer read-only" });
assert.equal(authenticatedRequest?.init.redirect, "error");
let unsafeFetchCalled = false;
await assert.rejects(fetchCompanyScorecard({
  args: ["node", "fetch-company-scorecard.mjs", "--url=https://evil.example"],
  env: { COMPANY_SCORECARD_READ_SECRET: "read-only" },
  fetchImpl: async () => { unsafeFetchCalled = true; throw new Error("must not run"); },
}), /allowlisted HTTPS origin/);
assert.equal(unsafeFetchCalled, false, "an unsafe URL must be rejected before fetch receives credentials");
await assert.rejects(fetchCompanyScorecard({
  args: ["node", "fetch-company-scorecard.mjs"],
  env: { COMPANY_SCORECARD_READ_SECRET: "read-only", BOURBON_SIGNAL_BASE_URL: "https://evil.example" },
  fetchImpl: async () => { unsafeFetchCalled = true; throw new Error("must not run"); },
}), /allowlisted HTTPS origin/);
assert.equal(unsafeFetchCalled, false, "an unsafe BOURBON_SIGNAL_BASE_URL must be rejected before fetch receives credentials");

const route = await readFile(new URL("../src/app/api/ops/company-scorecard/route.ts", import.meta.url), "utf8");
assert.match(route, /authorizeOpsBearer/);
assert.match(route, /getCompanyControlRoomSnapshot/);
assert.match(route, /snapshot\.scorecard/);
assert.match(route, /getDedicatedScorecardReadSecret/);
assert.doesNotMatch(route, /authorizeOpsBearer\([^\n]*CRON_SECRET/, "the scorecard endpoint must not authorize with the send-capable secret");
const fetcher = await readFile(new URL("../automation/bourbon-signal/fetch-company-scorecard.mjs", import.meta.url), "utf8");
assert.match(fetcher, /redirect:\s*["']error["']/, "authenticated scorecard requests must not follow redirects");
assert.doesNotMatch(fetcher, /process\.env\.CRON_SECRET/, "the fetcher must not reuse a send-capable secret");
const docs = await readFile(new URL("../docs/OPERATOR_BACKBONE.md", import.meta.url), "utf8");
assert.match(docs, /COMPANY_SCORECARD_READ_SECRET/);
assert.match(docs, /cron/i);
console.log("Company scorecard feed contract passed.");

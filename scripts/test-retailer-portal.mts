import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildRetailerAccountNotification,
  normalizeRetailerApplication,
  normalizeRetailerStatus,
  normalizeRetailerSubmission,
  safeRetailerRedirect,
} from "../src/lib/retailer-portal.ts";
import { isRetailerAdminEmail, RETAILER_ADMIN_EMAIL } from "../src/lib/retailer-admin.ts";
import { toIsoDate } from "../src/lib/retailer-repository.ts";

const timestamp = new Date("2026-07-13T21:00:00.000Z");
assert.equal(toIsoDate(timestamp), "2026-07-13T21:00:00.000Z");
assert.equal(toIsoDate("2026-07-13 21:00:00+00"), "2026-07-13T21:00:00.000Z");
assert.equal(safeRetailerRedirect("/retailers/onboarding?step=2"), "/retailers/onboarding?step=2");
assert.equal(safeRetailerRedirect("/retailers/portal?notification=pending"), "/retailers/portal?notification=pending");
assert.equal(safeRetailerRedirect("https://evil.example/retailers/portal"), "/retailers/portal");
assert.equal(safeRetailerRedirect("//evil.example/retailers/portal"), "/retailers/portal");
assert.equal(safeRetailerRedirect("/admin/retailers"), "/retailers/portal");

assert.equal(RETAILER_ADMIN_EMAIL, "chandlertodd22@gmail.com");
assert.equal(isRetailerAdminEmail(" CHANDLERTODD22@gmail.com "), true);
assert.equal(isRetailerAdminEmail("chandler@bourbonsignal.com"), false);
assert.equal(isRetailerAdminEmail(null), false);

const validApplication = {
  storeName: "  All American Liquor  ",
  storeAddress: "121 W Butler Rd, Mauldin, SC 29662",
  website: "https://www.aalmauldin.com/",
  listedPhone: "864-534-1094",
  applicantRole: "Owner",
};

const application = normalizeRetailerApplication(validApplication);
assert.equal(application.ok, true);
assert.equal(application.value?.storeName, "All American Liquor");
assert.equal(application.value?.website, "https://www.aalmauldin.com/");

const missingStore = normalizeRetailerApplication({ ...validApplication, storeName: "" });
assert.equal(missingStore.ok, false);
assert.match(missingStore.error || "", /store name/i);

const unsafeWebsite = normalizeRetailerApplication({ ...validApplication, website: "javascript:alert(1)" });
assert.equal(unsafeWebsite.ok, false);
assert.match(unsafeWebsite.error || "", /website/i);

assert.equal(normalizeRetailerStatus("verified"), "verified");
assert.equal(normalizeRetailerStatus("pending"), "pending");
assert.equal(normalizeRetailerStatus("verified_by_client"), "not_started");

const submission = normalizeRetailerSubmission({
  kind: "bottle_drop",
  title: "  Elijah Craig private barrel  ",
  locationDetails: "Front counter",
  price: "$79.99",
  availability: "12 bottles",
  notes: "Limit one per customer.",
});
assert.equal(submission.ok, true);
assert.equal(submission.value?.title, "Elijah Craig private barrel");
assert.equal(submission.value?.status, "reviewed");

const notice = buildRetailerAccountNotification({
  userId: "user_123",
  email: "owner@example.com",
  firstName: "Morgan",
  application: application.value!,
});
assert.equal(notice.to, "chandler@bourbonsignal.com");
assert.match(notice.subject, /new retailer account/i);
assert.match(notice.text, /All American Liquor/);
assert.match(notice.text, /owner@example\.com/);
assert.doesNotMatch(`${notice.subject}\n${notice.text}`, /blue beacon/i);
assert.equal(notice.idempotencyKey, "retailer-account-created-user_123");

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
for (const file of [
  "src/app/retailers/page.tsx",
  "src/app/retailers/register/[[...register]]/page.tsx",
  "src/app/retailers/onboarding/page.tsx",
  "src/app/retailers/login/[[...login]]/page.tsx",
  "src/app/retailers/portal/page.tsx",
  "src/app/retailers/portal/RetailerSignalForm.tsx",
  "src/app/admin/retailers/page.tsx",
  "src/lib/retailer-notifications.ts",
  "src/lib/retailer-repository.ts",
]) {
  assert.equal(existsSync(path.join(root, file)), true, `Missing ${file}`);
}

const middleware = read("src/middleware.ts");
assert.match(middleware, /"\/retailers\/portal\(\.\*\)"/);
assert.match(middleware, /"\/retailers\/onboarding\(\.\*\)"/);
assert.doesNotMatch(middleware, /"\/retailers\(\.\*\)"/);
assert.match(middleware, /url\.pathname\.startsWith\("\/admin"\)[\s\S]*new URL\("\/sign-in"/);
assert.match(middleware, /hostname === "bourbonsignal\.com" && url\.pathname\.startsWith\("\/api\/clerk-proxy"\)[\s\S]*NextResponse\.next\(\)/);

const layout = read("src/app/layout.tsx");
assert.match(layout, /proxyUrl="https:\/\/bourbonsignal\.com\/api\/clerk-proxy"/);

const proxy = read("src/app/api/clerk-proxy/[...path]/route.ts");
assert.match(proxy, /APEX_HOST = "bourbonsignal\.com"/);

const webhook = read("src/app/api/webhooks/clerk/route.ts");
assert.match(webhook, /notifyRetailerAccountCreated/);
assert.match(webhook, /accountType/);
assert.match(webhook, /retailer/);
assert.match(webhook, /getRetailerRepository/);
assert.ok(webhook.indexOf('unsafeMetadata.accountType !== "retailer"') < webhook.indexOf("createNewsletterContact(email)"), "Retailer classification must happen before newsletter enrollment");
assert.match(webhook, /upsertPendingApplication[\s\S]*notifyRetailerAccountCreated[\s\S]*markNotificationSent/);

const repository = read("src/lib/retailer-repository.ts");
assert.match(repository, /CREATE TABLE IF NOT EXISTS retailer_applications/);
assert.match(repository, /CREATE TABLE IF NOT EXISTS retailer_submissions/);
assert.match(repository, /ALTER TABLE retailer_submissions ALTER COLUMN status SET DEFAULT 'reviewed'/);
assert.match(repository, /INSERT INTO retailer_submissions \(id, user_id, store_name, store_address, payload, status, reviewed_at, reviewed_by\)/);
assert.match(repository, /'reviewed', NOW\(\), 'retailer_direct'/);
assert.match(repository, /UPDATE retailer_submissions[\s\S]*status = 'reviewed'[\s\S]*WHERE status = 'pending_review'/);
assert.match(repository, /WHERE user_id = \$2 AND status = 'verified'/);
assert.match(repository, /store_name TEXT NOT NULL/);
assert.match(repository, /deleteApplication/);
assert.match(repository, /DELETE FROM retailer_applications WHERE user_id = \$1/);
assert.match(repository, /deleteSubmission/);
assert.match(repository, /DELETE FROM retailer_submissions WHERE id = \$1 AND user_id = \$2/);

const portal = read("src/app/retailers/portal/page.tsx");
assert.match(portal, /retailerStatus/);
assert.match(portal, /verified/);
assert.match(portal, /Submit a signal/);
assert.match(portal, /RetailerSignalForm/);
assert.match(portal, /filter\(\(submission\) => submission\.status !== "rejected"\)/);
assert.doesNotMatch(portal, /stateFromAddress/);
assert.match(portal, /We only verify store access once/);
assert.doesNotMatch(portal, /reviewed before|Submit for review|pending review/);
assert.match(portal, /if \(!application\) redirect\("\/retailers\/onboarding"\)/);
assert.match(portal, /retryRetailerNotification/);
assert.doesNotMatch(portal, /upsertPendingApplication|unsafeMetadata|retailerSubmissions:/);

const register = read("src/app/retailers/register/[[...register]]/page.tsx");
assert.match(register, /forceRedirectUrl="\/retailers\/onboarding"/);
assert.match(register, /unsafeMetadata=\{\{ accountType: "retailer" \}\}/);
assert.doesNotMatch(register, /storeName|normalizeRetailerApplication|retailerApplication/);
assert.match(register, /ageConfirmed/);
assert.match(register, /verified-email-required/);
assert.doesNotMatch(register, /ageConfirmed\s*\|\|\s*verificationRequired/);
assert.match(register, /authPanel/);

const onboarding = read("src/app/retailers/onboarding/page.tsx");
assert.match(onboarding, /upsertPendingApplication/);
assert.match(onboarding, /emailAddress\.verification\?\.status !== "verified"/);
assert.match(onboarding, /redirect\("\/retailers\/portal\?applied=1"\)/);
assert.match(onboarding, /ageConfirmed/);

const login = read("src/app/retailers/login/[[...login]]/page.tsx");
assert.match(login, /safeRetailerRedirect/);
assert.match(login, /redirect_url/);
assert.match(login, /authPanel/);

assert.match(layout, /rootBox:[\s\S]*justifyContent: "center"/);
assert.match(layout, /cardBox:[\s\S]*maxWidth: "400px"/);
const retailerStyles = read("src/app/retailers/retailers.module.css");
assert.match(retailerStyles, /\.authPanel[\s\S]*justify-content: center/);
assert.match(retailerStyles, /\.signalInput[\s\S]*background:[^;]*(?:#1|rgba\()/);
assert.match(retailerStyles, /\.suggestionList[\s\S]*max-height:[^;]+;[\s\S]*overflow-y: auto/);

const signalForm = read("src/app/retailers/portal/RetailerSignalForm.tsx");
const bottleCheckApi = read("src/app/api/bottle-check/route.ts");
const suggestBranchIndex = bottleCheckApi.indexOf('if (intent === "suggest")');
const suggestBranchEnd = bottleCheckApi.indexOf("if (!bottle)", suggestBranchIndex);
const localSignalIndex = bottleCheckApi.indexOf("const localSignal = await getLocalSignal");
assert.ok(suggestBranchIndex >= 0 && suggestBranchEnd > suggestBranchIndex && localSignalIndex > suggestBranchEnd, "Suggest branch must return before local scoring");
const suggestBranch = bottleCheckApi.slice(suggestBranchIndex, suggestBranchEnd);
assert.match(suggestBranch, /suggestions: suggestions\.map\(userFacingBottle\)/);
assert.match(suggestBranch, /return NextResponse\.json/);
assert.doesNotMatch(suggestBranch, /getLocalSignal|captureSearchEvent/);
assert.match(signalForm, /intent=suggest/);
assert.doesNotMatch(signalForm, /[?&]state=|state: string/);
assert.match(signalForm, /canonicalName/);
assert.match(signalForm, /event\.key === "Escape"[\s\S]*setOpen\(false\)[\s\S]*setActiveIndex\(-1\)/);
assert.match(signalForm, /role="listbox"/);
assert.match(signalForm, /name="title"/);
assert.match(signalForm, />Submit signal<\/button>/);

const admin = read("src/app/admin/retailers/page.tsx");
assert.match(admin, /isRetailerAdminEmail/);
assert.doesNotMatch(admin, /isRewardsAdminEmail/);
assert.match(admin, /verified/);
assert.match(admin, /verificationMethod/);
assert.match(admin, /verificationContact/);
assert.match(admin, /removeRetailerAccess/);
assert.match(admin, /removeRetailerSubmission/);
assert.match(admin, /submission\.status === "rejected" \? "removed" : "retailer signal"/);
assert.doesNotMatch(admin, /reviewSubmission|>Approve<\/button>|>Reject<\/button>|pending review/);
assert.doesNotMatch(admin, /getUserList|unsafeMetadata/);

const settings = read("src/app/settings/page.tsx");
assert.match(settings, /isRetailerAdminEmail/);
assert.match(settings, /\/admin\/retailers/);
assert.match(settings, /Retailer administration/);

const publicSurface = [
  read("src/app/retailers/page.tsx"),
  read("src/app/retailers/portal/page.tsx"),
  read("src/app/retailers/register/[[...register]]/page.tsx"),
].join("\n");
assert.doesNotMatch(publicSurface, /blue beacon/i);

console.log("Retailer portal contracts passed.");

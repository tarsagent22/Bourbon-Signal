import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildRetailerAccountNotification,
  normalizeRetailerApplication,
  normalizeRetailerStatus,
  normalizeRetailerSubmission,
} from "../src/lib/retailer-portal.ts";
import { isRetailerAdminEmail, RETAILER_ADMIN_EMAIL } from "../src/lib/retailer-admin.ts";

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
assert.equal(submission.value?.status, "pending_review");

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
  "src/app/retailers/login/[[...login]]/page.tsx",
  "src/app/retailers/portal/page.tsx",
  "src/app/admin/retailers/page.tsx",
  "src/lib/retailer-notifications.ts",
  "src/lib/retailer-repository.ts",
]) {
  assert.equal(existsSync(path.join(root, file)), true, `Missing ${file}`);
}

const middleware = read("src/middleware.ts");
assert.match(middleware, /"\/retailers\/portal\(\.\*\)"/);
assert.doesNotMatch(middleware, /"\/retailers\(\.\*\)"/);

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
assert.match(repository, /WHERE user_id = \$2 AND status = 'verified'/);
assert.match(repository, /store_name TEXT NOT NULL/);
assert.match(repository, /deleteApplication/);
assert.match(repository, /DELETE FROM retailer_applications WHERE user_id = \$1/);
assert.match(repository, /deleteSubmission/);
assert.match(repository, /DELETE FROM retailer_submissions WHERE id = \$1 AND user_id = \$2/);

const portal = read("src/app/retailers/portal/page.tsx");
assert.match(portal, /retailerStatus/);
assert.match(portal, /verified/);
assert.match(portal, /pending_review/);
assert.match(portal, /upsertPendingApplication[\s\S]*sendApplicationNotification/);
assert.match(portal, /retryRetailerNotification/);
assert.doesNotMatch(portal, /unsafeMetadata|retailerSubmissions:/);

const admin = read("src/app/admin/retailers/page.tsx");
assert.match(admin, /isRetailerAdminEmail/);
assert.doesNotMatch(admin, /isRewardsAdminEmail/);
assert.match(admin, /verified/);
assert.match(admin, /verificationMethod/);
assert.match(admin, /verificationContact/);
assert.match(admin, /removeRetailerAccess/);
assert.match(admin, /removeRetailerSubmission/);
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

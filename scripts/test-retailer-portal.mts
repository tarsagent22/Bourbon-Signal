import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildRetailerAccountNotification,
  buildRetailerDecisionNotification,
  CURRENT_RETAILER_TERMS_VERSION,
  normalizeRetailerApplication,
  normalizeRetailerStatus,
  normalizeRetailerStore,
  normalizeRetailerSubmission,
  normalizeRetailerTermsAcceptance,
  retailerSubmissionLifecycle,
  safeRetailerRedirect,
} from "../src/lib/retailer-portal.ts";
import { isRetailerAdminEmail, RETAILER_ADMIN_EMAIL } from "../src/lib/retailer-admin.ts";
import { toIsoDate } from "../src/lib/retailer-repository.ts";
import { retailerSignalFieldConfig } from "../src/lib/retailer-signal-fields.ts";
import { inferRetailerTimeZone, retailerTimeZoneNeedsChoice, zonedLocalDateTimeToIso } from "../src/lib/retailer-time-zone.ts";
import { retailerFeedSnapshot, retailerSignalSnapshot, retailerSubmissionToDrop, retailerSubmissionToEvent, retailerSubmissionToFeedCard, retailerStateCode } from "../src/lib/retailer-signal-feed.ts";
import { resolveClerkRecoveryUrl } from "../src/lib/clerk-recovery-host.ts";

assert.equal(
  resolveClerkRecoveryUrl("https://clerk.bourbonsignal.com/v1/environment?probe=1", "clerk.bourbonsignal.com"),
  "https://bourbonsignal.com/api/clerk-proxy/v1/environment?probe=1",
);
assert.equal(
  resolveClerkRecoveryUrl("https://clerk.bourbonsignal.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js", "CLERK.BOURBONSIGNAL.COM:443"),
  "https://bourbonsignal.com/api/clerk-proxy/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
);
assert.equal(resolveClerkRecoveryUrl("https://www.bourbonsignal.com/sign-in", "www.bourbonsignal.com"), null);

const timestamp = new Date("2026-07-13T21:00:00.000Z");
assert.equal(toIsoDate(timestamp), "2026-07-13T21:00:00.000Z");
assert.equal(toIsoDate("2026-07-13 21:00:00+00"), "2026-07-13T21:00:00.000Z");
assert.equal(safeRetailerRedirect("/retailers/onboarding?step=2"), "/retailers/onboarding?step=2");
assert.equal(safeRetailerRedirect("/retailers/portal?notification=pending"), "/retailers/portal?notification=pending");
assert.equal(safeRetailerRedirect("https://evil.example/retailers/portal"), "/retailers/portal");
assert.equal(safeRetailerRedirect("//evil.example/retailers/portal"), "/retailers/portal");
assert.equal(safeRetailerRedirect("/admin/retailers"), "/retailers/portal");

assert.equal(inferRetailerTimeZone("121 W Butler Rd, Mauldin, SC 29662"), "America/New_York");
assert.equal(inferRetailerTimeZone("500 Main St, Dallas, TX 75201"), "America/Chicago");
assert.equal(retailerTimeZoneNeedsChoice("500 N Oregon St, El Paso, TX 79901"), true);
assert.equal(retailerTimeZoneNeedsChoice("10 Palafox Pl, Pensacola, FL 32502"), true);
assert.equal(retailerTimeZoneNeedsChoice("121 W Butler Rd, Mauldin, SC 29662"), false);
assert.equal(zonedLocalDateTimeToIso("2026-07-15T10:00", "America/New_York"), "2026-07-15T14:00:00.000Z");
assert.equal(zonedLocalDateTimeToIso("2026-07-15T10:00", "America/Denver"), "2026-07-15T16:00:00.000Z");
assert.equal(zonedLocalDateTimeToIso("2026-03-08T02:30", "America/New_York"), null);
assert.equal(zonedLocalDateTimeToIso("2026-11-01T01:30", "America/New_York"), null);

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
assert.equal(CURRENT_RETAILER_TERMS_VERSION, "2026-07-01");
assert.equal(normalizeRetailerTermsAcceptance({ termsAccepted: "yes", termsVersion: CURRENT_RETAILER_TERMS_VERSION }).ok, true);
const missingTerms = normalizeRetailerTermsAcceptance({ termsAccepted: "", termsVersion: CURRENT_RETAILER_TERMS_VERSION });
assert.equal(missingTerms.ok, false);
assert.match(missingTerms.error || "", /understand/i);

const missingStore = normalizeRetailerApplication({ ...validApplication, storeName: "" });
assert.equal(missingStore.ok, false);
assert.match(missingStore.error || "", /store name/i);

const unsafeWebsite = normalizeRetailerApplication({ ...validApplication, website: "javascript:alert(1)" });
assert.equal(unsafeWebsite.ok, false);
assert.match(unsafeWebsite.error || "", /website/i);

const validStore = normalizeRetailerStore({
  storeName: "All American Liquor — Greenville",
  storeAddress: "500 Main St, Greenville, SC 29601",
  website: "https://www.aalmauldin.com/locations/greenville",
  listedPhone: "864-555-0199",
});
assert.equal(validStore.ok, true);
assert.equal(validStore.value?.storeName, "All American Liquor — Greenville");
assert.equal(validStore.value?.storeAddress, "500 Main St, Greenville, SC 29601");
const invalidStore = normalizeRetailerStore({ storeName: "Second location", storeAddress: "", listedPhone: "864-555-0199" });
assert.equal(invalidStore.ok, false);
assert.match(invalidStore.error || "", /address/i);

assert.equal(normalizeRetailerStatus("verified"), "verified");
assert.equal(normalizeRetailerStatus("pending"), "pending");
assert.equal(normalizeRetailerStatus("verified_by_client"), "not_started");

const missingStoreSelection = normalizeRetailerSubmission({ storeId: "", kind: "bottle_drop", title: "Elijah Craig private barrel" });
assert.equal(missingStoreSelection.ok, false);
assert.match(missingStoreSelection.error || "", /store/i);

const submission = normalizeRetailerSubmission({
  storeId: "store-primary",
  kind: "bottle_drop",
  title: "  Elijah Craig private barrel  ",
  locationDetails: "Front counter",
  price: "$79.99",
  availability: "12 bottles",
  notes: "Limit one per customer.",
});
assert.equal(submission.ok, true);
assert.equal(submission.value?.storeId, "store-primary");
assert.equal(submission.value?.title, "Elijah Craig private barrel");
assert.equal(submission.value?.status, "reviewed");

const signalNow = new Date("2026-07-13T21:00:00.000Z");
const availableNow = normalizeRetailerSubmission(
  { storeId: "store-primary", kind: "bottle_drop", title: "Blanton's", availabilityTiming: "now" },
  signalNow,
);
assert.equal(availableNow.ok, true);
assert.equal(availableNow.value?.availabilityTiming, "now");
assert.equal(availableNow.value?.startsAt, "2026-07-13T21:00:00.000Z");
assert.equal(availableNow.value?.expiresAt, "2026-07-14T21:00:00.000Z");
assert.equal(availableNow.value?.timeZone, "");

const scheduledAvailability = normalizeRetailerSubmission(
  {
    storeId: "store-primary",
    kind: "bottle_drop",
    title: "E.H. Taylor Small Batch",
    availabilityTiming: "scheduled",
    startsAt: "2026-07-15T10:00",
    timeZone: "America/New_York",
  },
  signalNow,
);
assert.equal(scheduledAvailability.ok, true);
assert.equal(scheduledAvailability.value?.startsAt, "2026-07-15T14:00:00.000Z");
assert.equal(scheduledAvailability.value?.expiresAt, "2026-07-16T14:00:00.000Z");
assert.equal(scheduledAvailability.value?.timeZone, "America/New_York");

const missingScheduledTime = normalizeRetailerSubmission(
  { storeId: "store-primary", kind: "bottle_drop", title: "Weller 12", availabilityTiming: "scheduled" },
  signalNow,
);
assert.equal(missingScheduledTime.ok, false);
assert.match(missingScheduledTime.error || "", /go-live date/i);

const scheduledWithoutTimeZone = normalizeRetailerSubmission(
  { storeId: "store-primary", kind: "bottle_drop", title: "Weller 12", availabilityTiming: "scheduled", startsAt: "2026-07-15T10:00" },
  signalNow,
);
assert.equal(scheduledWithoutTimeZone.ok, false);
assert.match(scheduledWithoutTimeZone.error || "", /time zone/i);

const pastScheduledTime = normalizeRetailerSubmission(
  {
    storeId: "store-primary",
    kind: "barrel_pick",
    title: "Store pick",
    availabilityTiming: "scheduled",
    startsAt: "2026-07-12T10:00",
    timeZone: "America/New_York",
  },
  signalNow,
);
assert.equal(pastScheduledTime.ok, false);
assert.match(pastScheduledTime.error || "", /future/i);

assert.equal(retailerSubmissionLifecycle(scheduledAvailability.value!, signalNow), "upcoming");
assert.equal(
  retailerSubmissionLifecycle(scheduledAvailability.value!, new Date("2026-07-15T14:30:00.000Z")),
  "live",
);
assert.equal(
  retailerSubmissionLifecycle(scheduledAvailability.value!, new Date("2026-07-16T14:00:00.000Z")),
  "ended",
);
assert.equal(
  retailerSubmissionLifecycle({ ...scheduledAvailability.value!, soldOutAt: "2026-07-15T13:00:00.000Z" }, signalNow),
  "ended",
);
assert.equal(
  retailerSubmissionLifecycle({ storeId: "store-primary", kind: "bottle_drop", startsAt: "", expiresAt: "", soldOutAt: "" }, signalNow),
  "ended",
);

const scheduledRecord = {
  ...scheduledAvailability.value!,
  id: "signal-1",
  userId: "user-1",
  storeName: "Test Bottle Shop",
  storeAddress: "121 W Butler Rd, Mauldin, SC 29662",
  createdAt: "2026-07-13T21:00:00.000Z",
};
assert.equal(retailerStateCode(scheduledRecord.storeAddress), "SC");
assert.equal(retailerSubmissionToDrop(scheduledRecord, signalNow), null);
assert.equal(retailerSignalSnapshot([scheduledRecord], signalNow), retailerSignalSnapshot([], signalNow));
assert.equal(
  retailerSignalSnapshot([{ ...scheduledRecord, kind: "tasting" }], signalNow),
  retailerSignalSnapshot([], signalNow),
);
assert.notEqual(retailerFeedSnapshot([scheduledRecord], signalNow), retailerFeedSnapshot([], signalNow));
assert.notEqual(retailerFeedSnapshot([{ ...scheduledRecord, kind: "tasting" }], signalNow), retailerFeedSnapshot([], signalNow));
assert.notEqual(
  retailerSignalSnapshot([scheduledRecord], signalNow),
  retailerSignalSnapshot([scheduledRecord], new Date("2026-07-15T14:00:00.000Z")),
);
assert.equal(retailerSubmissionToEvent(scheduledRecord, signalNow)?.eventDate, "2026-07-15T14:00:00.000Z");
const liveRetailerDrop = retailerSubmissionToDrop(scheduledRecord, new Date("2026-07-15T14:00:00.000Z"));
assert.equal(liveRetailerDrop?.source, "verified-retailer");
assert.equal(liveRetailerDrop?.state, "SC");
assert.equal(liveRetailerDrop?.storeName, "Test Bottle Shop");
assert.equal(liveRetailerDrop?.storeId, "store-primary");
assert.equal(retailerSubmissionToDrop(scheduledRecord, new Date("2026-07-16T14:00:00.000Z")), null);
const upcomingRetailerCard = retailerSubmissionToFeedCard(scheduledRecord, signalNow, "allocated");
assert.equal(upcomingRetailerCard?.retailerSignalKind, "drop");
assert.equal(upcomingRetailerCard?.retailerSignalState, "upcoming");
assert.equal(upcomingRetailerCard?.tier, "allocated");
assert.equal(upcomingRetailerCard?.canAlertAsInventory, false);
const retailerTastingCard = retailerSubmissionToFeedCard(
  { ...scheduledRecord, kind: "tasting", startsAt: "", expiresAt: "2026-07-20T22:00:00.000Z", title: "Summer tasting" },
  signalNow,
  "limited",
);
assert.equal(retailerTastingCard?.retailerSignalKind, "tasting");
assert.equal(retailerTastingCard?.type, "verified_retailer_tasting");

const tastingWithoutDate = normalizeRetailerSubmission({ storeId: "store-primary", kind: "tasting", title: "Summer tasting" });
assert.equal(tastingWithoutDate.ok, false);
assert.match(tastingWithoutDate.error || "", /event date/i);
const lotteryWithoutDeadline = normalizeRetailerSubmission({ storeId: "store-primary", kind: "lottery", title: "Van Winkle lottery" });
assert.equal(lotteryWithoutDeadline.ok, false);
assert.match(lotteryWithoutDeadline.error || "", /entry deadline/i);
const tastingWithInvalidDate = normalizeRetailerSubmission({ storeId: "store-primary", kind: "tasting", title: "Summer tasting", expiresAt: "tomorrow night" });
assert.equal(tastingWithInvalidDate.ok, false);
assert.match(tastingWithInvalidDate.error || "", /valid event date/i);
const otherWithHiddenMetadata = normalizeRetailerSubmission({ storeId: "store-primary", kind: "other", title: "Holiday hours", price: "$50", availability: "10 bottles" });
assert.equal(otherWithHiddenMetadata.ok, true);
assert.equal(otherWithHiddenMetadata.value?.price, "");
assert.equal(otherWithHiddenMetadata.value?.availability, "");

const bottleDropFields = retailerSignalFieldConfig("bottle_drop");
assert.equal(bottleDropFields.useBottleSuggestions, true);
assert.equal(bottleDropFields.titleLabel, "Bottle");
assert.equal(bottleDropFields.availabilityLabel, "Quantity or purchase limit");
assert.equal(bottleDropFields.supportsAvailabilityTiming, true);
assert.equal(bottleDropFields.expiresAtLabel, "Available until");

const barrelPickFields = retailerSignalFieldConfig("barrel_pick");
assert.equal(barrelPickFields.useBottleSuggestions, true);
assert.equal(barrelPickFields.notesLabel, "Pick details");
assert.equal(barrelPickFields.supportsAvailabilityTiming, true);

const tastingFields = retailerSignalFieldConfig("tasting");
assert.equal(tastingFields.useBottleSuggestions, false);
assert.equal(tastingFields.titleLabel, "Event name");
assert.equal(tastingFields.expiresAtLabel, "Event date and time");
assert.equal(tastingFields.availabilityLabel, "Capacity or reservation details");
assert.equal(tastingFields.supportsAvailabilityTiming, false);

const lotteryFields = retailerSignalFieldConfig("lottery");
assert.equal(lotteryFields.useBottleSuggestions, true);
assert.equal(lotteryFields.expiresAtLabel, "Entry deadline");

const otherFields = retailerSignalFieldConfig("other");
assert.equal(otherFields.useBottleSuggestions, false);
assert.equal(otherFields.titleLabel, "Signal title");
assert.equal(otherFields.showPrice, false);
assert.equal(otherFields.showAvailability, false);

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

const approvedNotice = buildRetailerDecisionNotification({
  userId: "user_123",
  email: "owner@example.com",
  firstName: "Morgan",
  storeName: "All American Liquor",
  status: "verified",
  decisionAt: "2026-07-14T14:00:00.000Z",
});
assert.equal(approvedNotice.to, "owner@example.com");
assert.match(approvedNotice.subject, /approved/i);
assert.match(approvedNotice.text, /retailers\/portal/);
assert.equal(approvedNotice.idempotencyKey, "retailer-decision-user_123-verified-2026-07-14T14:00:00.000Z");
const declinedNotice = buildRetailerDecisionNotification({ ...approvedNotice, userId: "user_123", email: "owner@example.com", firstName: "Morgan", storeName: "All American Liquor", status: "rejected", decisionAt: "2026-07-14T15:00:00.000Z" });
assert.match(declinedNotice.subject, /not approved/i);

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
for (const file of [
  "src/app/retailers/page.tsx",
  "src/app/retailers/register/[[...register]]/page.tsx",
  "src/app/retailers/onboarding/page.tsx",
  "src/app/retailers/onboarding/RetailerTermsGate.tsx",
  "src/app/retailers/login/[[...login]]/page.tsx",
  "src/app/retailers/portal/page.tsx",
  "src/app/retailers/portal/RetailerSignalForm.tsx",
  "src/app/retailers/portal/RetailerSignalTime.tsx",
  "src/app/admin/retailers/page.tsx",
  "src/app/admin/retailers/actions.ts",
  "src/components/admin/RetailerAdministration.tsx",
  "src/lib/retailer-notifications.ts",
  "src/lib/retailer-repository.ts",
  "src/lib/retailer-time-zone.ts",
  "src/lib/retailer-signal-feed.ts",
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
const retailerSchema = read("src/lib/retailer-schema.sql");
assert.match(retailerSchema, /CREATE TABLE IF NOT EXISTS retailer_applications/);
assert.match(retailerSchema, /CREATE TABLE IF NOT EXISTS retailer_stores/);
assert.match(retailerSchema, /INSERT INTO retailer_stores[\s\S]*SELECT[\s\S]*FROM retailer_applications/);
assert.match(retailerSchema, /ALTER TABLE retailer_submissions ADD COLUMN IF NOT EXISTS store_id TEXT/);
assert.match(retailerSchema, /ALTER TABLE retailer_submissions ALTER COLUMN store_id SET NOT NULL/);
assert.match(retailerSchema, /FOREIGN KEY \(store_id\) REFERENCES retailer_stores\(id\) ON DELETE RESTRICT/);
assert.match(repository, /ON CONFLICT \(user_id, store_address\) DO NOTHING/);
assert.match(retailerSchema, /CREATE TABLE IF NOT EXISTS retailer_submissions/);
assert.match(repository, /async createStore/);
assert.match(repository, /async listStores/);
assert.match(repository, /INNER JOIN retailer_stores stores[\s\S]*stores\.user_id = \$2[\s\S]*stores\.id = \$3[\s\S]*stores\.status = 'verified'/);
assert.match(retailerSchema, /ALTER TABLE retailer_submissions ALTER COLUMN status SET DEFAULT 'reviewed'/);
assert.match(repository, /INSERT INTO retailer_submissions \(id, user_id, store_id, store_name, store_address, payload, status, reviewed_at, reviewed_by\)/);
assert.match(repository, /'reviewed', NOW\(\), 'retailer_direct'/);
assert.match(retailerSchema, /UPDATE retailer_submissions[\s\S]*status = 'reviewed'[\s\S]*WHERE status = 'pending_review'/);
assert.match(repository, /applications\.status = 'verified'/);
assert.match(retailerSchema, /store_name TEXT NOT NULL/);
assert.match(repository, /deleteApplication/);
assert.match(repository, /DELETE FROM retailer_applications WHERE user_id = \$1/);
assert.match(repository, /deleteSubmission/);
assert.match(repository, /DELETE FROM retailer_submissions WHERE id = \$1 AND user_id = \$2/);
assert.match(repository, /markSubmissionSoldOut/);
assert.match(repository, /jsonb_set\(payload, '\{soldOutAt\}'/);
assert.match(repository, /payload->>'kind' IN \('bottle_drop', 'barrel_pick'\)/);
assert.match(repository, /listPublicSubmissions/);
assert.match(repository, /applications\.status = 'verified'/);
assert.match(repository, /submissions\.status = 'reviewed'/);
assert.match(retailerSchema, /terms_accepted_at TIMESTAMPTZ/);
assert.match(retailerSchema, /terms_version TEXT/);
assert.match(retailerSchema, /decision_notified_status TEXT/);
assert.match(repository, /updateApplicationProfile/);
assert.match(repository, /markDecisionNotificationSent/);

const dropsApi = read("src/app/api/drops/route.ts");
assert.match(dropsApi, /retailerSubmissionToFeedCard/);
assert.match(dropsApi, /drop-feed-classification\.generated\.json/);
assert.match(dropsApi, /resolveDropClassification/);
assert.match(dropsApi, /retailerFeedSnapshot/);
assert.match(dropsApi, /isVerifiedRetailerDrop/);
const eventsApi = read("src/app/api/events/route.ts");
assert.match(eventsApi, /retailerSubmissionToEvent/);
assert.match(eventsApi, /source_type === "verified_retailer"/);

const portal = read("src/app/retailers/portal/page.tsx");
assert.match(portal, /retailerStatus/);
assert.match(portal, /verified/);
assert.match(portal, /Submit a signal/);
assert.match(portal, /RetailerSignalForm/);
assert.match(portal, /filter\(\(submission\) => submission\.status !== "rejected"\)/);
assert.match(portal, /submission\.kind !== "other"/);
assert.doesNotMatch(portal, /stateFromAddress/);
assert.match(portal, /We only verify store access once/);
assert.doesNotMatch(portal, /reviewed before|Submit for review|pending review/);
assert.match(portal, /if \(!application\) redirect\("\/retailers\/onboarding"\)/);
assert.match(portal, /retryRetailerNotification/);
assert.match(portal, /markRetailerSignalSoldOut/);
assert.match(portal, /retailerSubmissionLifecycle/);
assert.match(portal, /Mark sold out/);
assert.match(portal, /Cancel scheduled signal/);
assert.match(portal, /updateStoreProfile/);
assert.match(portal, /addRetailerStore/);
assert.match(portal, /repository\.listStores\(userId\)/);
assert.match(portal, /stores=\{stores\.map/);
assert.match(portal, /tab=profile/);
assert.match(portal, /Store profile/);
assert.match(portal, /styles\.profilePanel/);
assert.match(portal, /styles\.profileOverview/);
assert.match(portal, /styles\.locationSection/);
assert.match(portal, /styles\.addLocationSection/);
assert.match(portal, /stores\.filter\(\(store\) => !store\.isPrimary\)/);
assert.doesNotMatch(portal, /\{stores\.map\(\(store\) => \(\s*<article/);
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
assert.match(onboarding, /normalizeRetailerTermsAcceptance/);
assert.match(onboarding, /RetailerTermsGate/);
const termsGate = read("src/app/retailers/onboarding/RetailerTermsGate.tsx");
assert.match(termsGate, />I understand<\/button>/);
assert.match(termsGate, /termsAccepted/);
assert.match(termsGate, /signal accuracy/i);

const login = read("src/app/retailers/login/[[...login]]/page.tsx");
assert.match(login, /safeRetailerRedirect/);
assert.match(login, /redirect_url/);
assert.match(login, /authPanel/);
assert.match(login, /Submit signals to Bourbon Signal and manage your store profile\./);
assert.match(login, /headerSubtitle:[\s\S]*marginTop: "12px"/);
assert.doesNotMatch(login, /styles\.panel\} \$\{styles\.authPanel/);
const retailerLanding = read("src/app/retailers/page.tsx");
assert.match(retailerLanding, /Retailer signals are published to the feed instantly or at set time\./);

assert.match(layout, /rootBox:[\s\S]*justifyContent: "center"/);
assert.match(layout, /cardBox:[\s\S]*maxWidth: "400px"/);
const retailerStyles = read("src/app/retailers/retailers.module.css");
assert.match(retailerStyles, /\.profileOverview[\s\S]*border-radius:/);
assert.match(retailerStyles, /\.locationSection[\s\S]*border-radius:/);
assert.match(retailerStyles, /\.addLocationSection[\s\S]*border-color:/);
assert.match(retailerStyles, /\.locationSectionHeader/);
assert.match(retailerStyles, /\.authPanel[\s\S]*justify-content: center/);
assert.match(retailerStyles, /\.signalInput[\s\S]*background:[^;]*(?:#1|rgba\()/);
assert.match(retailerStyles, /\.suggestionList[\s\S]*max-height:[^;]+;[\s\S]*overflow-y: auto/);

const signalForm = read("src/app/retailers/portal/RetailerSignalForm.tsx");
const signalTime = read("src/app/retailers/portal/RetailerSignalTime.tsx");
assert.match(signalTime, /Intl\.DateTimeFormat/);
assert.match(signalTime, /dateStyle: "medium"/);
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
assert.match(signalForm, /retailerSignalFieldConfig\(kind\)/);
assert.match(signalForm, /fieldConfig\.useBottleSuggestions/);
assert.match(signalForm, /fieldConfig\.showPrice/);
assert.match(signalForm, /fieldConfig\.showAvailability/);
assert.match(signalForm, /fieldConfig\.supportsAvailabilityTiming/);
assert.match(signalForm, /Available now/);
assert.match(signalForm, /Schedule for later/);
assert.match(signalForm, /name="availabilityTiming"/);
assert.match(signalForm, /name="startsAt"/);
assert.match(signalForm, /name="expiresAt"/);
assert.match(signalForm, /name="timeZone"/);
assert.match(signalForm, /name="bottleId"/);
assert.match(signalForm, /name="storeId"/);
assert.match(signalForm, /<label htmlFor="storeId">Signal store<\/label>/);
assert.match(signalForm, /stores\.length > 1[\s\S]*Choose a store/);
assert.match(signalForm, /name="storeId"[\s\S]*required/);
assert.match(signalForm, /Store time zone/);
assert.match(signalForm, /24 hours after it goes live/);
assert.match(signalForm, /<option value="bottle_drop">Bottle availability<\/option>/);
assert.doesNotMatch(signalForm, /[?&]state=|state: string/);
assert.match(signalForm, /canonicalName/);
assert.match(signalForm, /event\.key === "Escape"[\s\S]*setOpen\(false\)[\s\S]*setActiveIndex\(-1\)/);
assert.match(signalForm, /role="listbox"/);
assert.match(signalForm, /name="title"/);
assert.match(signalForm, />Submit signal<\/button>/);

const adminPage = read("src/app/admin/retailers/page.tsx");
const adminActions = read("src/app/admin/retailers/actions.ts");
const adminWorkspace = read("src/components/admin/RetailerAdministration.tsx");
const admin = `${adminPage}\n${adminActions}\n${adminWorkspace}`;
assert.match(admin, /isRetailerAdminEmail/);
assert.doesNotMatch(admin, /isRewardsAdminEmail/);
assert.match(admin, /verified/);
assert.match(admin, /verificationMethod/);
assert.match(admin, /verificationContact/);
assert.match(admin, /removeRetailerAccess/);
assert.match(admin, /removeRetailerSubmission/);
assert.match(admin, /notifyRetailerDecision/);
assert.match(admin, /resendRetailerDecisionNotification/);
assert.match(admin, /Decision email pending/);
const retailerNotifications = read("src/lib/retailer-notifications.ts");
assert.match(retailerNotifications, /notifyRetailerDecision/);
assert.match(retailerNotifications, /idempotencyKey/);
assert.match(admin, /submission\.status === "rejected" \? "removed" : "retailer signal"/);
assert.match(admin, /submission\.kind === "other"/);
assert.doesNotMatch(admin, /reviewSubmission|>Approve<\/button>|>Reject<\/button>|pending review/);
assert.doesNotMatch(admin, /getUserList|unsafeMetadata/);
assert.match(adminPage, /redirect\("\/admin\/control-room#retailers"\)/);
assert.match(adminWorkspace, /Retailer access/);
assert.match(adminWorkspace, /cr-retailer/);

const dropFeed = read("src/components/sections/DropFeed.tsx");
assert.match(dropFeed, /retailerSignalKind/);
assert.match(dropFeed, /Verified retailer/);
assert.match(dropFeed, /retailerCardAppearance/);
assert.match(dropFeed, /lottery:/);
assert.match(dropFeed, /tasting:/);
assert.match(dropFeed, /drop:/);

const settings = read("src/app/settings/page.tsx");
assert.doesNotMatch(settings, /isRetailerAdminEmail/);
assert.doesNotMatch(settings, /\/admin\/retailers/);
assert.doesNotMatch(settings, /Retailer administration/);
const controlRoom = read("src/app/admin/control-room/page.tsx");
assert.match(controlRoom, /RetailerAdministration/);
assert.match(controlRoom, /id="retailers"/);
assert.match(controlRoom, /href="#retailers"/);

const publicSurface = [
  read("src/app/retailers/page.tsx"),
  read("src/app/retailers/portal/page.tsx"),
  read("src/app/retailers/register/[[...register]]/page.tsx"),
].join("\n");
assert.doesNotMatch(publicSurface, /blue beacon/i);

console.log("Retailer portal contracts passed.");

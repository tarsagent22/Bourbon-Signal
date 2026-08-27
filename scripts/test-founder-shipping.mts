import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  founderShippingTrackingUrl,
  memberShippingEligibility,
  normalizeFounderFulfillment,
  normalizeFounderShippingSubmission,
} from "../src/lib/founder-shipping.ts";
import { shouldOfferFounderGlassClaim } from "../src/lib/founder-glass-claim.ts";
import {
  founderShipmentCorrectionIdempotencyKey,
  founderShipmentEmailCopy,
  founderShipmentNotificationKind,
} from "../src/lib/founder-shipment-email.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const founderMetadata = {
  tier: "bottled-in-bond",
  plan: "bib_lifetime",
  membershipStatus: "lifetime",
  founderNumber: 12,
};
assert.deepEqual(memberShippingEligibility(founderMetadata), { eligible: true, founderNumber: 12 });
assert.deepEqual(memberShippingEligibility({ ...founderMetadata, founderNumber: 0 }), { eligible: true, founderNumber: null });
assert.deepEqual(memberShippingEligibility({ ...founderMetadata, membershipStatus: "canceled" }), { eligible: false, founderNumber: null });
assert.deepEqual(memberShippingEligibility({ tier: "standard", membershipStatus: "active" }), { eligible: true, founderNumber: null });
assert.deepEqual(memberShippingEligibility({ tier: "barrel", membershipStatus: "active" }), { eligible: true, founderNumber: null });
assert.deepEqual(memberShippingEligibility({ tier: "free", membershipStatus: "free" }), { eligible: false, founderNumber: null });

assert.equal(shouldOfferFounderGlassClaim({ ok: true, tier: "bottled-in-bond", plan: "bib_lifetime" }), true);
assert.equal(shouldOfferFounderGlassClaim({ ok: true, tier: "barrel", plan: "barrel_monthly" }), false);
assert.equal(shouldOfferFounderGlassClaim({ ok: true, tier: "bottled-in-bond", plan: "barrel_monthly" }), false);
assert.equal(shouldOfferFounderGlassClaim({ ok: false, tier: "bottled-in-bond", plan: "bib_lifetime" }), false);

const valid = normalizeFounderShippingSubmission({
  recipientName: "  Chandler   Todd ",
  addressLine1: "123 Main Street",
  addressLine2: " Suite 4 ",
  city: "Charlotte",
  stateCode: "nc",
  postalCode: "28202-1234",
  phone: "(704) 555-0187",
  countryCode: "US",
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.value.recipientName, "Chandler Todd");
  assert.equal(valid.value.stateCode, "NC");
  assert.equal(valid.value.phone, "+17045550187");
  assert.equal(valid.value.countryCode, "US");
}
for (const [field, value] of [
  ["phone", ""],
  ["phone", "555"],
  ["postalCode", "SW1A 1AA"],
  ["stateCode", "XX"],
  ["countryCode", "CA"],
] as const) {
  const result = normalizeFounderShippingSubmission({
    recipientName: "Chandler Todd",
    addressLine1: "123 Main Street",
    addressLine2: "",
    city: "Charlotte",
    stateCode: "NC",
    postalCode: "28202",
    phone: "7045550187",
    countryCode: "US",
    [field]: value,
  });
  assert.equal(result.ok, false, `${field}=${value} must be rejected`);
}
const oversized = normalizeFounderShippingSubmission({
  recipientName: "A".repeat(121),
  addressLine1: "123 Main Street",
  addressLine2: "",
  city: "Charlotte",
  stateCode: "NC",
  postalCode: "28202",
  phone: "7045550187",
  countryCode: "US",
});
assert.equal(oversized.ok, false, "over-limit delivery fields must be rejected rather than truncated");

assert.deepEqual(normalizeFounderFulfillment({ status: "shipped", carrier: "ups", trackingNumber: " 1Z999 AA1 01 2345 6784 " }), {
  ok: true,
  value: { status: "shipped", carrier: "UPS", trackingNumber: "1Z999AA10123456784" },
});
assert.equal(normalizeFounderFulfillment({ status: "shipped", carrier: "", trackingNumber: "" }).ok, false, "shipped requires carrier and tracking");
assert.equal(normalizeFounderFulfillment({ status: "shipped", carrier: "Other", trackingNumber: "123" }).ok, false, "unsupported carriers fail closed");
assert.deepEqual(normalizeFounderFulfillment({ status: "packed", carrier: "", trackingNumber: "" }), {
  ok: true,
  value: { status: "packed", carrier: null, trackingNumber: null },
});
assert.equal(founderShippingTrackingUrl("UPS", "1Z999AA10123456784"), "https://www.ups.com/track?loc=en_US&tracknum=1Z999AA10123456784");
assert.equal(founderShippingTrackingUrl("USPS", "9400111899223856928499"), "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223856928499");
assert.equal(founderShippingTrackingUrl("FedEx", "123456789012"), "https://www.fedex.com/fedextrack/?trknbr=123456789012");
assert.equal(founderShippingTrackingUrl(null, null), null);

const correctionKey = founderShipmentCorrectionIdempotencyKey();
assert.match(correctionKey, /^founder-glass-corrected-[0-9a-f-]{36}$/, "correction retries use a durable, recognizable idempotency key");
assert.notEqual(correctionKey, founderShipmentCorrectionIdempotencyKey(), "each real correction gets a distinct provider idempotency key");
assert.equal(founderShipmentNotificationKind(correctionKey), "correction");
assert.equal(founderShipmentNotificationKind("founder-glass-shipped-abc"), "shipment");
assert.deepEqual(founderShipmentEmailCopy("correction"), {
  subject: "Updated tracking information for your Founder glass",
  preview: "Updated tracking information for your Founder glass.",
  headline: "Updated tracking information",
  introduction: "We apologize for the confusion. The tracking information in our previous email was incorrect. The tracking number below is your updated tracking number.",
});
assert.deepEqual(founderShipmentEmailCopy("shipment"), {
  subject: "Your Bourbon Signal founder glass has shipped",
  preview: "Your founder glass is on the way.",
  headline: "Your founder glass is on the way",
  introduction: "Your Bourbon Signal founder glass has shipped.",
});

const page = read("src/app/founder-shipping/page.tsx");
const settings = read("src/app/settings/SettingsPageClient.tsx");
const successPage = read("src/app/success/page.tsx");
const founderClaimDialog = read("src/components/FounderGlassClaimDialog.tsx");
const shippingPanel = read("src/components/MemberShippingProfile.tsx");
const shippingApi = read("src/app/api/member/shipping/route.ts");
const navigation = read("src/components/Navigation.tsx");
const schema = read("src/lib/founder-shipping-schema.sql");
const repository = read("src/lib/founder-shipping-repository.ts");
const notification = read("src/lib/founder-shipping-notification.tsx");
const shippingEmail = read("src/components/emails/FounderGlassShippedEmail.tsx");
const middleware = read("src/middleware.ts");
const controlRoom = read("src/app/admin/control-room/page.tsx");
const migration = read("scripts/migrate-app-storage.mjs");
const backup = read("scripts/backup-neon-local.mjs");
const packageJson = read("package.json");

assert.match(middleware, /"\/founder-shipping\(\.\*\)"/);
assert.match(middleware, /"\/api\/member\/shipping\(\.\*\)"/);
assert.match(page, /redirect\("\/settings#shipping"\)/);
assert.match(successPage, /shouldOfferFounderGlassClaim\(payload\)/, "the prompt decision uses the verified checkout-sync payload");
assert.match(successPage, /syncStartedRef/, "checkout activation runs once rather than canceling itself when status changes");
assert.match(successPage, /await user\.reload\(\)\.catch\(/, "a transient Clerk reload failure cannot suppress a verified Founder claim prompt");
assert.match(successPage, /FounderGlassClaimDialog/);
assert.match(founderClaimDialog, /role="dialog"/);
assert.match(founderClaimDialog, /aria-modal="true"/);
assert.match(founderClaimDialog, /Want to claim your one-of-a-kind Founder(?:&apos;|’|'|\u2019)s glass\?/);
assert.match(founderClaimDialog, /href="\/settings#shipping"/);
assert.match(founderClaimDialog, /Enter shipping information/);
assert.match(founderClaimDialog, /Set up alerts instead/);
assert.doesNotMatch(founderClaimDialog, /name=["'](?:address|addressLine|postalCode|phone)|<input|<textarea|<select/, "the popup routes to the private profile rather than collecting PII itself");
assert.match(settings, /MemberShippingProfile/);
assert.match(settings, />Manage account</);
for (const section of ["personal", "membership", "shipping", "communications", "security"]) {
  assert.match(settings, new RegExp(`(?:id=|href=)["']#?${section}["']`), `Manage Account exposes ${section}`);
}
assert.match(settings, /\/api\/billing-portal/);
assert.match(settings, /\/dashboard\?section=alerts/);
assert.match(settings, /user\.update\(/, "personal information uses Clerk's authenticated profile update");
assert.doesNotMatch(settings, /Retailer administration|isRetailerAdminEmail|\/admin\/retailers/);
assert.match(shippingPanel, /id="shipping"/);
assert.match(shippingPanel, /name="phone"[\s\S]{0,160}required/);
assert.match(shippingPanel, /United States only/);
assert.doesNotMatch(shippingPanel, /deadline/i);
assert.doesNotMatch(shippingPanel, /country[^\n]*<select|name="country"/i, "international destinations must not be selectable");
assert.ok((navigation.match(/href="\/settings"/g) || []).length >= 2, "Manage Account is linked from desktop and mobile member navigation");
assert.ok((navigation.match(/Manage Account/g) || []).length >= 2, "desktop and mobile account navigation use one consistent label");
assert.doesNotMatch(navigation, /href="\/settings#shipping"|Shipping information|Manage billing/, "global account navigation stays consolidated");
assert.match(shippingPanel, /Your shipping information is private and used only to fulfill Bourbon Signal products and member shipments\./);
assert.match(shippingPanel, /fulfillment partners or carriers only when necessary for delivery/);
assert.doesNotMatch(shippingPanel, /owner fulfillment view/);
assert.match(shippingApi, /memberShippingEligibility/);
assert.match(shippingApi, /status:\s*403/);
assert.match(shippingApi, /saveFounderShippingSubmission/);
assert.match(shippingApi, /attachFounderNumberToShippingProfile/, "opening the profile reconciles a newly assigned founder number");
const shippingView = shippingApi.match(/function memberShippingView[\s\S]*?async function memberShippingContext/)?.[0] || "";
assert.doesNotMatch(shippingView, /userId|accountEmail|founderNumber|countryCode|shippedAt|notification/, "member API view excludes internal operational fields");
assert.match(shippingView, /carrier/);
assert.match(shippingView, /trackingUrl/);
assert.match(shippingView, /const shipped = record\.status === ["']shipped["']/);
assert.match(shippingView, /trackingNumber:\s*shipped\s*\?/);
assert.match(shippingView, /trackingUrl:\s*shipped\s*\?/, "tracking details remain hidden until the shipment is shipped");
assert.match(shippingPanel, /href=\{record\.trackingUrl\}/);
assert.match(shippingPanel, /Track with \{record\.carrier\}/);
assert.match(repository, /COALESCE\(EXCLUDED\.founder_number, founder_glass_shipping\.founder_number\)/, "paid profile updates preserve an existing founder link");

assert.match(schema, /CREATE TABLE IF NOT EXISTS founder_(?:glass_)?shipping/);
for (const column of ["user_id", "founder_number", "recipient_name", "address_line1", "city", "state_code", "postal_code", "phone", "country_code", "status", "tracking_number", "shipment_notification_sent_at", "shipment_notification_message_id", "shipment_notification_claimed_at", "shipment_notification_claim_token", "shipment_notification_idempotency_key"]) {
  assert.match(schema, new RegExp(`\\b${column}\\b`), `schema must include ${column}`);
}
assert.match(schema, /founder_number INTEGER(?:\s+CONSTRAINT|\s*,)/, "paid-member profiles may omit a founder number");
assert.doesNotMatch(schema, /founder_number INTEGER NOT NULL/);
assert.match(schema, /founder_number IS NULL OR founder_number > 0/);
assert.match(schema, /country_code (?:TEXT|CHAR\(2\)) NOT NULL DEFAULT 'US' CONSTRAINT founder_glass_shipping_country_us CHECK \(country_code = 'US'\)/);
assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS founder_glass_shipping_founder_number_idx/, "founder glass numbers are unique in durable storage");
assert.match(repository, /founderNumber: number \| null/);
assert.match(repository, /founder_number IS NOT NULL OR COALESCE\(rewards\.glass_quantity, 0\) > 0/, "owner fulfillment includes confirmed referral glasses but excludes unrelated paid profiles");
assert.match(repository, /WHERE founder_glass_shipping\.status NOT IN \('packed', 'shipped'\)/, "packed or shipped addresses cannot be silently changed");
assert.match(repository, /WHERE user_id = \$1[\s\S]*founder_number IS NOT NULL[\s\S]*member_referral_glass_rewards[\s\S]*shipment_notification_claimed_at IS NULL[\s\S]*RETURNING \*/, "fulfillment mutation targets founders or confirmed referral-glass earners and fences in-flight notification claims");
assert.match(repository, /claimShipmentNotification/);
assert.match(repository, /releaseShipmentNotification/);
assert.match(repository, /markShipmentNotificationSent/);
assert.match(repository, /date_trunc\('milliseconds', NOW\(\)\)/, "shipment versions are persisted at JavaScript-safe timestamp precision");
assert.match(repository, /date_trunc\('milliseconds', shipped_at\) = date_trunc\('milliseconds', \$2::timestamptz\)/, "notification claims fence on the same millisecond precision returned by Neon");
assert.match(repository, /shipment_notification_claimed_at IS NULL OR shipment_notification_claimed_at < NOW\(\) - INTERVAL '15 minutes'/, "a stale claim may be retried without allowing concurrent sends");
assert.match(repository, /shipment_notification_claimed_at IS NULL[\s\S]*shipment_notification_claimed_at < NOW\(\) - INTERVAL '15 minutes'[\s\S]*carrier IS NOT DISTINCT FROM \$3[\s\S]*tracking_number IS NOT DISTINCT FROM \$4/, "an active claim fences shipment changes while allowing an idempotent save");
assert.match(repository, /FounderShippingNotificationInFlightError/, "an in-flight notification blocks conflicting fulfillment edits explicitly");
assert.match(repository, /shipment_notification_claim_token = \$2[\s\S]*shipment_notification_sent_at IS NULL/, "release and mark mutations are fenced by the atomic claim token");
assert.match(repository, /shipment_notification_sent_at = CASE[\s\S]*ELSE NULL[\s\S]*shipment_notification_message_id = CASE[\s\S]*ELSE NULL/, "fulfillment changes reset the prior send result");
assert.match(repository, /shipment_notification_idempotency_key = CASE[\s\S]*carrier IS NOT DISTINCT FROM \$3[\s\S]*tracking_number IS NOT DISTINCT FROM \$4[\s\S]*THEN shipment_notification_idempotency_key[\s\S]*shipment_notification_sent_at IS NOT NULL[\s\S]*carrier IS DISTINCT FROM \$3 OR tracking_number IS DISTINCT FROM \$4[\s\S]*THEN \$7/, "the database atomically classifies an already-emailed tracking change as a correction");
assert.match(repository, /date_trunc\('milliseconds', updated_at\) = date_trunc\('milliseconds', \$6::timestamptz\)/, "stale fulfillment forms cannot overwrite a newer correction");
assert.match(repository, /UPDATE founder_glass_shipping SET founder_number = \$2[\s\S]*founder_number IS NULL/, "new founder numbers reconcile onto existing paid profiles");
assert.match(repository, /\$1/);
assert.doesNotMatch(repository, /unsafeMetadata|publicMetadata/, "shipping addresses must not be stored in Clerk metadata");

assert.match(controlRoom, /Founder and referral glass fulfillment/);
assert.match(controlRoom, /listFounderShippingForOwner/);
assert.match(controlRoom, /<details/);
assert.match(controlRoom, /confirmed/);
assert.match(controlRoom, /packed/);
assert.match(controlRoom, /shipped/);
assert.match(controlRoom, /trackingNumber/);
assert.match(controlRoom, /normalizeFounderFulfillment/);
assert.match(controlRoom, /sendFounderShipmentNotification/);
assert.doesNotMatch(controlRoom, /readFounderShippingForUser/, "correction classification must not use a stale pre-read");
assert.match(controlRoom, /expectedUpdatedAt/, "fulfillment saves carry the row version rendered in the form");
assert.match(controlRoom, /notificationIdempotencyKey:\s*founderShipmentCorrectionIdempotencyKey\(\)/, "the database receives a PII-free candidate correction key");
assert.match(controlRoom, /client\.users\.getUser\(record\.userId\)/);
assert.match(controlRoom, /companyMemberPrimaryEmail\(member\)/);
assert.match(controlRoom, /Shipment email sent/);
assert.match(notification, /idempotencyKey/);
assert.match(notification, /FounderGlassShippedEmail/);
assert.match(notification, /founderShipmentNotificationKind\(/, "the durable idempotency marker selects correction copy on first send and retry");
assert.match(notification, /subject:\s*emailCopy\.subject/);
assert.match(notification, /claimFounderShipmentNotification/);
assert.match(notification, /releaseFounderShipmentNotification/);
assert.match(notification, /markFounderShipmentNotificationSent/);
assert.match(notification, /record\.shipmentNotificationIdempotencyKey \|\| shipmentIdempotencyKey\(record\)/, "retries reuse the persisted Resend idempotency key");
assert.match(notification, /to:\s*\[currentPrimaryEmail\]/, "shipment email uses the current primary Clerk email passed at send time");
assert.doesNotMatch(notification, /record\.accountEmail/, "shipment email never trusts the stored account email");
assert.match(notification, /emails\.send\([\s\S]*\},\s*\{ idempotencyKey \}\)/, "Resend receives the stable shipment idempotency key");
assert.match(shippingEmail, /kind = "shipment"/, "ordinary first-shipment emails remain the default template");
assert.match(shippingEmail, /founderShipmentEmailCopy\(kind\)/);
assert.match(shippingEmail, /emailCopy\.introduction/, "the rendered body uses correction-specific introduction copy");
assert.doesNotMatch(shippingEmail, /unsubscribe/i, "transactional shipment notices do not masquerade as marketing mail");
assert.match(migration, /founder-shipping-schema\.sql/);
assert.match(migration, /founder_glass_shipping:\s*\[/, "the migration verifier requires founder shipping columns");
for (const column of [
  "user_id", "founder_number", "account_email", "recipient_name", "address_line1", "address_line2", "city", "state_code",
  "postal_code", "phone", "country_code", "status", "carrier", "tracking_number", "submitted_at", "updated_at", "shipped_at", "updated_by", "shipment_notification_sent_at", "shipment_notification_message_id", "shipment_notification_claimed_at", "shipment_notification_claim_token", "shipment_notification_idempotency_key",
]) {
  assert.match(migration, new RegExp(`founder_glass_shipping:[^\\n]*${column}`), `migration guard requires ${column}`);
  assert.match(migration, new RegExp(`\\n  ${column}: \\[`), `migration guard validates ${column} definition`);
}
assert.match(migration, /founder_number: \['integer', 'YES', null, null\]/);
assert.match(migration, /state_code: \['character', 'NO', 2, null\]/);
assert.match(migration, /country_code: \['character', 'NO', 2, "'US'::bpchar"\]/);
assert.match(migration, /submitted_at: \['timestamp with time zone', 'NO', null, 'now\(\)'\]/);
assert.match(migration, /expectedFounderIndexes[\s\S]*founder_glass_shipping_founder_number_idx:\s*\{ unique: true, columns: \['founder_number'\] \}/);
assert.match(migration, /founder_glass_shipping_status_idx:\s*\{ unique: false, columns: \['status', 'founder_number'\] \}/);
assert.match(migration, /actual\.table_name === 'founder_glass_shipping'/);
for (const invariant of ["actual.indisvalid === true", "actual.has_predicate === false", "actual.has_expressions === false", "actual.indnatts", "actual.indnkeyatts"]) {
  assert.ok(migration.includes(invariant), `index guard requires ${invariant}`);
}
assert.match(migration, /founderPrimaryKey\.contype === 'p'[\s\S]*founderPrimaryKeyColumns\[0\] === 'user_id'/);
assert.match(migration, /expectedFounderConstraintDefinitions[\s\S]*country_code='US'::bpchar/);
assert.doesNotMatch(migration, /normalizeConstraintDefinition[\s\S]{0,160}toLowerCase/, "constraint verification preserves case-sensitive SQL literals");
for (const constraint of ["founder_glass_shipping_founder_number_positive", "founder_glass_shipping_country_us", "founder_glass_shipping_status_valid"]) {
  assert.match(migration, new RegExp(`${constraint}:`), `migration guard validates ${constraint}`);
}
assert.match(migration, /normalizeConstraintDefinition\(actual\.definition\) === expectedDefinition/);
assert.ok((backup.match(/'founder_glass_shipping'/g) || []).length >= 2, "encrypted backup includes and requires founder shipping data");
assert.match(packageJson, /"test:founder-shipping"/);

console.log("Founder shipping contract passed.");

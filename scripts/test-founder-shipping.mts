import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  founderShippingEligibility,
  normalizeFounderShippingSubmission,
} from "../src/lib/founder-shipping.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const founderMetadata = {
  tier: "bottled-in-bond",
  plan: "bib_lifetime",
  membershipStatus: "lifetime",
  founderNumber: 12,
};
assert.deepEqual(founderShippingEligibility(founderMetadata), { eligible: true, founderNumber: 12 });
assert.deepEqual(founderShippingEligibility({ ...founderMetadata, founderNumber: 0 }), { eligible: false, founderNumber: null });
assert.deepEqual(founderShippingEligibility({ ...founderMetadata, membershipStatus: "canceled" }), { eligible: false, founderNumber: null });
assert.deepEqual(founderShippingEligibility({ tier: "barrel", membershipStatus: "active", founderNumber: 12 }), { eligible: false, founderNumber: null });

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

const page = read("src/app/founder-shipping/page.tsx");
const schema = read("src/lib/founder-shipping-schema.sql");
const repository = read("src/lib/founder-shipping-repository.ts");
const middleware = read("src/middleware.ts");
const controlRoom = read("src/app/admin/control-room/page.tsx");
const migration = read("scripts/migrate-app-storage.mjs");
const backup = read("scripts/backup-neon-local.mjs");
const packageJson = read("package.json");

assert.match(middleware, /"\/founder-shipping\(\.\*\)"/);
assert.match(page, /founderShippingEligibility/);
assert.match(page, /name="phone"[\s\S]{0,160}required/);
assert.match(page, /United States only/);
assert.match(page, /dynamic = "force-dynamic"/);
assert.match(page, /noStore\(\)/);
assert.doesNotMatch(page, /deadline/i);
assert.doesNotMatch(page, /country[^\n]*<select|name="country"/i, "international destinations must not be selectable");

assert.match(schema, /CREATE TABLE IF NOT EXISTS founder_(?:glass_)?shipping/);
for (const column of ["user_id", "founder_number", "recipient_name", "address_line1", "city", "state_code", "postal_code", "phone", "country_code", "status", "tracking_number"]) {
  assert.match(schema, new RegExp(`\\b${column}\\b`), `schema must include ${column}`);
}
assert.match(schema, /country_code (?:TEXT|CHAR\(2\)) NOT NULL DEFAULT 'US' CONSTRAINT founder_glass_shipping_country_us CHECK \(country_code = 'US'\)/);
assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS founder_glass_shipping_founder_number_idx/, "founder glass numbers are unique in durable storage");
assert.match(repository, /WHERE founder_glass_shipping\.status NOT IN \('packed', 'shipped'\)/, "packed or shipped addresses cannot be silently changed");
assert.match(repository, /\$1/);
assert.doesNotMatch(repository, /unsafeMetadata|publicMetadata/, "shipping addresses must not be stored in Clerk metadata");

assert.match(controlRoom, /Founder glass fulfillment/);
assert.match(controlRoom, /listFounderShippingForOwner/);
assert.match(controlRoom, /<details/);
assert.match(controlRoom, /confirmed/);
assert.match(controlRoom, /packed/);
assert.match(controlRoom, /shipped/);
assert.match(controlRoom, /trackingNumber/);
assert.match(migration, /founder-shipping-schema\.sql/);
assert.match(migration, /founder_glass_shipping:\s*\[/, "the migration verifier requires founder shipping columns");
for (const column of [
  "user_id", "founder_number", "account_email", "recipient_name", "address_line1", "address_line2", "city", "state_code",
  "postal_code", "phone", "country_code", "status", "carrier", "tracking_number", "submitted_at", "updated_at", "shipped_at", "updated_by",
]) {
  assert.match(migration, new RegExp(`founder_glass_shipping:[^\\n]*${column}`), `migration guard requires ${column}`);
  assert.match(migration, new RegExp(`\\n  ${column}: \\[`), `migration guard validates ${column} definition`);
}
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

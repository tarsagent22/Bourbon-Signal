import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

function productionMobileSource(directory: string): string {
  return readdirSync(directory).sort().map((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return productionMobileSource(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? readFileSync(path, "utf8") : "";
  }).join("\n");
}

test("production mobile surfaces use canonical customer membership names", () => {
  const source = [
    productionMobileSource(fileURLToPath(new URL("app", root))),
    read("src/membership/membership-plans.ts"),
  ].join("\n");
  assert.doesNotMatch(source, /Bottle Check|Standard Proof|Barrel Proof|Bottled in Bond|Bottled-in-Bond/);
  assert.match(source, /name: "Standard"/);
  assert.match(source, /name: "Barrel"/);
  assert.match(source, /name: "Founder"/);
  assert.match(source, /"bottled-in-bond"/, "the internal Founder entitlement identifier must remain stable");
});

test("membership review exposes every native account and Apple support destination without checkout", () => {
  const overview = read("app/(app)/account/membership.tsx");
  const detail = read("app/(app)/account/membership/[tier].tsx");
  const hq = read("app/(app)/(tabs)/hq.tsx");
  const combined = `${overview}\n${detail}\n${hq}`;
  assert.match(combined, /Manage subscriptions in the App Store/);
  assert.match(combined, /Restore purchases/);
  assert.match(combined, /Terms of Service/);
  assert.match(combined, /Privacy policy|Privacy/);
  assert.match(combined, /Membership support|Support/);
  assert.match(combined, /Delete account/);
  assert.doesNotMatch(combined, /Stripe Checkout|checkout\/continue|\/pricing/);
});

test("store metadata is explicitly a blocked draft for the not-yet-final candidate", () => {
  const metadata = JSON.parse(read("store/app-store-metadata.json"));
  assert.equal(metadata.candidateStatus, "draft_not_ready_for_submission");
  assert.deepEqual(metadata.submissionBlockers, [
    "configured_storekit_and_revenuecat_products",
    "reviewed_candidate_screenshots",
    "sandbox_purchase_restore_lifecycle_evidence",
    "final_signed_build_and_device_qa",
  ]);
  assert.match(metadata.description, /create a free account/i);
  assert.match(metadata.description, /manage.*membership/i);

  const review = read("store/app-review-notes.md");
  const privacy = read("store/app-privacy.md");
  const checklist = read("store/release-checklist.md");
  const screenshots = read("store/screenshot-spec.md");
  const all = `${review}\n${privacy}\n${checklist}\n${screenshots}`;
  assert.match(review, /draft candidate.*not.*final/i);
  assert.match(review, /Create a free account/);
  assert.match(review, /Account → Membership/);
  assert.match(review, /Account → Privacy & Support → Delete account/);
  assert.doesNotMatch(review, /no in-app purchase|no account registration inside the app|sign-in-only/i);
  assert.match(privacy, /StoreKit/);
  assert.match(privacy, /RevenueCat/);
  assert.match(privacy, /account deletion/i);
  assert.match(checklist, /configured StoreKit.*RevenueCat products/i);
  assert.match(checklist, /sandbox.*purchase.*restore/i);
  assert.match(checklist, /final signed build/i);
  assert.match(screenshots, /not been captured/i);
  assert.match(screenshots, /configured.*localized price/i);
  assert.doesNotMatch(all, /products are ready|sandbox testing passed|screenshots (?:are )?complete|final build is ready/i);
});

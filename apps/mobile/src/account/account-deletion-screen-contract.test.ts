import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const account = read("../../app/(app)/(tabs)/hq.tsx");
const screen = read("../../app/(app)/account/delete.tsx");
const subscriptionManagement = read("./subscription-management.ts");
const layout = read("../../app/(app)/_layout.tsx");

test("Account exposes a separated native permanent-deletion destination", () => {
  assert.match(account, /Delete account/);
  assert.match(account, /router\.push\("\/\(app\)\/account\/delete"\)/);
  assert.match(layout, /name="account\/delete"/);
});

test("deletion requires an explicit typed confirmation and tells Apple subscribers the billing truth", () => {
  assert.match(screen, /Type DELETE to confirm/);
  assert.match(screen, /confirmation\.trim\(\) === "DELETE"/);
  assert.match(screen, /Permanent/);
  assert.match(screen, /Bourbon Signal cannot cancel an Apple subscription/);
  assert.match(screen, /Manage subscriptions in the App Store/);
  assert.match(subscriptionManagement, /apps\.apple\.com\/account\/subscriptions/);
  assert.match(screen, /api\.requestAccountDeletion\(\)/);
  assert.match(screen, /accessibilityRole="alert"/);
  assert.doesNotMatch(screen, /console\.(?:log|warn|error)/);
});

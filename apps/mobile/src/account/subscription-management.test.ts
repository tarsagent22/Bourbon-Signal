import assert from "node:assert/strict";
import test from "node:test";
import { appleSubscriptionCancellationGuidance, openAppleSubscriptionManagement } from "./subscription-management";

test("Apple subscription guidance is explicit that account deletion does not cancel billing", async () => {
  assert.match(appleSubscriptionCancellationGuidance, /Bourbon Signal cannot cancel an Apple subscription/);
  assert.match(appleSubscriptionCancellationGuidance, /continues until you cancel it/);
  let opened = "";
  await openAppleSubscriptionManagement(async (url) => { opened = url; });
  assert.equal(opened, "https://apps.apple.com/account/subscriptions");
});

import assert from "node:assert/strict";
import test from "node:test";
import { appleSubscriptionCancellationGuidance, openAppleSubscriptionManagement, openMembershipManagement } from "./subscription-management";

test("Apple subscription guidance is explicit that account deletion does not cancel billing", async () => {
  assert.match(appleSubscriptionCancellationGuidance, /Bourbon Signal cannot cancel an Apple subscription/);
  assert.match(appleSubscriptionCancellationGuidance, /continues until you cancel it/);
  let opened = "";
  await openAppleSubscriptionManagement(async (url) => { opened = url; });
  assert.equal(opened, "https://apps.apple.com/account/subscriptions");
});

test("membership management opens only the provider's secure destination", async () => {
 for (const [provider,url] of [["stripe","https://billing.stripe.com/p/session/fixture"],["apple","https://apps.apple.com/account/subscriptions"]] as const) {
  let opened=''; await openMembershipManagement({openSubscriptionManagement:async()=>({provider,url})},async u=>{opened=u;});assert.equal(opened,url);
 }
 for(const url of ['https://billing.stripe.com.evil.test/session','http://billing.stripe.com/session','https://user:pass@billing.stripe.com/session']) await assert.rejects(()=>openMembershipManagement({openSubscriptionManagement:async()=>({provider:'stripe',url})},async()=>{}));
});

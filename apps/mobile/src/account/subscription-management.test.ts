import assert from "node:assert/strict";
import test from "node:test";
import { appleSubscriptionCancellationGuidance, openAppleSubscriptionManagement, openMembershipManagement } from "./subscription-management";
import { membershipBillingPresentation } from '../membership/membership-billing';

test('known Apple members open the native sheet without a server or external-link dependency', async () => {
 const calls:string[]=[];
 await openMembershipManagement({openSubscriptionManagement:async()=>{throw Error('Server offline');}},async()=>{calls.push('link');},{platform:'ios',providerHint:'apple',showAppleSubscriptions:async()=>{calls.push('native');}});
 assert.deepEqual(calls,['native']);
});

test('native management falls back to the secure Apple link only when presentation fails', async () => {
 const calls:string[]=[];
 const api={openSubscriptionManagement:async()=>({provider:'apple' as const,url:'https://apps.apple.com/account/subscriptions'})};
 await openMembershipManagement(api,async url=>{calls.push(url);},{platform:'ios',showAppleSubscriptions:async()=>{calls.push('native');throw Error('No active window');}});
 assert.deepEqual(calls,['native','https://apps.apple.com/account/subscriptions']);
});

test('failed Apple sheet and link provide the appropriate production or sandbox Settings path', async () => {
 for(const sandbox of [false,true]){
  await assert.rejects(openMembershipManagement({openSubscriptionManagement:async()=>{throw Error('Unused');}},async()=>{throw Error('URL rejected');},{platform:'ios',providerHint:'apple',sandbox,showAppleSubscriptions:async()=>{throw Error('Presentation failed');}}),error=>error instanceof Error&&(sandbox?error.message.includes('Developer → Sandbox Apple Account → Manage'):error.message.includes('your name → Subscriptions')));
 }
});

test('non-Apple billing and invalid destinations never present an Apple management sheet', async () => {
 let nativeCalls=0;
 const native={platform:'ios',showAppleSubscriptions:async()=>{nativeCalls++;}};
 await openMembershipManagement({openSubscriptionManagement:async()=>({provider:'stripe',url:'https://billing.stripe.com/p/session/fixture'})},async()=>{},native);
 await assert.rejects(openMembershipManagement({openSubscriptionManagement:async()=>({provider:'apple',url:'https://evil.test/account/subscriptions'})},async()=>{},native));
 assert.equal(nativeCalls,0);
});

test('Founder access remains lifetime even when an older subscription has a billing provider', () => {
 for(const provider of ['stripe','apple','google','none',null] as const){
  const view=membershipBillingPresentation('bottled-in-bond',provider,'ios');
  assert.equal(view.founder,true);assert.equal(view.managementOnly,false);
  assert.match(view.cardBilling,/Lifetime access/);
  assert.doesNotMatch(view.cardBilling+' '+view.disclosure,/Stripe|Cancel anytime|renew automatically|charged to/);
  assert.equal(view.managementLabel,'Manage previous billing');
 }
});

test('new iPhone memberships disclose Apple billing without a Stripe fallback', () => {
 for(const provider of ['none','apple',null] as const){
  const view=membershipBillingPresentation('free',provider,'ios');
  assert.equal(view.managementOnly,false);assert.match(view.cardBilling,/Apple/);
  assert.match(view.disclosure,/Apple Account/);assert.doesNotMatch(view.disclosure,/Stripe|Google Play/);
 }
 const android=membershipBillingPresentation('free','none','android');
 assert.match(android.disclosure,/Google Play/);assert.doesNotMatch(android.disclosure,/Stripe|Apple/);
});

test('existing subscriptions keep their real provider and cross-store management', () => {
 const stripe=membershipBillingPresentation('standard','stripe','ios');
 assert.equal(stripe.managementOnly,true);assert.match(stripe.cardBilling,/Stripe/);
 const google=membershipBillingPresentation('barrel','google','ios');
 assert.equal(google.managementOnly,true);assert.match(google.cardBilling,/Google Play/);
});

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


test("Google management accepts only the app-scoped Google subscriptions destination",async()=>{
 let opened="";await openMembershipManagement({openSubscriptionManagement:async()=>({provider:"google",url:"https://play.google.com/store/account/subscriptions?package=com.bourbonsignal.app"})},async url=>{opened=url;});assert.match(opened,/play.google.com/);
 for(const url of ["https://play.google.com.evil.test/store/account/subscriptions?package=com.bourbonsignal.app","http://play.google.com/store/account/subscriptions?package=com.bourbonsignal.app","https://play.google.com/store/apps/details?id=com.bourbonsignal.app","https://play.google.com/store/account/subscriptions?package=other.app"])await assert.rejects(()=>openMembershipManagement({openSubscriptionManagement:async()=>({provider:"google",url})},async()=>{}));
});

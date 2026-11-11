export const appleSubscriptionCancellationGuidance = "Bourbon Signal cannot cancel an Apple subscription. Apple billing continues until you cancel it in the App Store.";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
type SubscriptionLinkOpener = ((url: string) => Promise<unknown>) | { openURL(url: string): Promise<unknown> };
function openLink(opener: SubscriptionLinkOpener, url: string) {
  // React Native Linking.openURL calls this._validateURL; preserve its receiver.
  return typeof opener === 'function' ? opener(url) : opener.openURL(url);
}
type NativeManagement = {
  platform: string;
  showAppleSubscriptions(): Promise<void>;
  sandbox?: boolean;
  providerHint?: 'stripe' | 'apple' | 'google' | 'none' | null;
};

export async function openAppleSubscriptionManagement(
  opener: SubscriptionLinkOpener,
  native?: NativeManagement,
) {
  if (native?.platform === 'ios') {
    try { await native.showAppleSubscriptions(); return; }
    catch { /* Apple's account link remains available if StoreKit cannot present. */ }
  }
  try { await openLink(opener,APPLE_SUBSCRIPTIONS_URL); }
  catch { throw new SubscriptionManagementError(native?.sandbox
    ? 'Open iPhone Settings → Developer → Sandbox Apple Account → Manage to change this TestFlight subscription.'
    : 'Open iPhone Settings → your name → Subscriptions to manage your Apple subscription.'); }
}

export class SubscriptionManagementError extends Error {}

export async function openMembershipManagement(api: { openSubscriptionManagement: () => Promise<{provider:"stripe"|"apple"|"google";url:string}> }, opener: SubscriptionLinkOpener, native?: NativeManagement) {
  // The provider hint comes from the authenticated billing lookup. A known Apple
  // subscriber should not need another server request to reach cancellation.
  if (native?.platform === 'ios' && native.providerHint === 'apple') return openAppleSubscriptionManagement(opener,native);
  const result = await api.openSubscriptionManagement();
  const url = new URL(result.url);
  const allowed = result.provider === "apple"
    ? url.hostname === "apps.apple.com" && url.pathname === "/account/subscriptions"
    : result.provider === "google" ? url.hostname === "play.google.com" && url.pathname === "/store/account/subscriptions" && url.searchParams.get("package") === "com.bourbonsignal.app"
    : url.hostname === "billing.stripe.com";
  if (url.protocol !== "https:" || url.username || url.password || !allowed) throw new Error("Membership management returned an invalid link.");
  if (result.provider === 'apple') return openAppleSubscriptionManagement(opener,native);
  try { await openLink(opener,url.toString()); }
  catch {
    throw new SubscriptionManagementError(result.provider === 'google'
      ? 'Open Google Play → your profile → Payments & subscriptions → Subscriptions.'
      : 'Membership management could not open. Please try again or contact support.');
  }
}

export function membershipManagedOutsideStore(provider:"stripe"|"apple"|"google"|"none"|null,platform:string) {
 return provider==="stripe" || (provider==="apple" && platform==="android") || (provider==="google" && platform==="ios");
}
export async function openGoogleSubscriptionManagement(opener:(url:string)=>Promise<unknown>) {
 await opener("https://play.google.com/store/account/subscriptions?package=com.bourbonsignal.app");
}

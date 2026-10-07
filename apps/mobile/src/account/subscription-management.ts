export const appleSubscriptionCancellationGuidance = "Bourbon Signal cannot cancel an Apple subscription. Apple billing continues until you cancel it in the App Store.";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export async function openAppleSubscriptionManagement(
  opener: (url: string) => Promise<unknown>,
) {
  await opener(APPLE_SUBSCRIPTIONS_URL);
}

export async function openMembershipManagement(api: { openSubscriptionManagement: () => Promise<{provider:"stripe"|"apple"|"google";url:string}> }, opener: (url:string)=>Promise<unknown>) {
  const result = await api.openSubscriptionManagement();
  const url = new URL(result.url);
  const allowed = result.provider === "apple"
    ? url.hostname === "apps.apple.com" && url.pathname === "/account/subscriptions"
    : result.provider === "google" ? url.hostname === "play.google.com" && url.pathname === "/store/account/subscriptions" && url.searchParams.get("package") === "com.bourbonsignal.app"
    : url.hostname === "billing.stripe.com";
  if (url.protocol !== "https:" || url.username || url.password || !allowed) throw new Error("Membership management returned an invalid link.");
  await opener(url.toString());
}

export function membershipManagedOutsideStore(provider:"stripe"|"apple"|"google"|"none"|null,platform:string) {
 return provider==="stripe" || (provider==="apple" && platform==="android") || (provider==="google" && platform==="ios");
}
export async function openGoogleSubscriptionManagement(opener:(url:string)=>Promise<unknown>) {
 await opener("https://play.google.com/store/account/subscriptions?package=com.bourbonsignal.app");
}

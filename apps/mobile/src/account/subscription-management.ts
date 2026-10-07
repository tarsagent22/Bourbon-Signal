export const appleSubscriptionCancellationGuidance = "Bourbon Signal cannot cancel an Apple subscription. Apple billing continues until you cancel it in the App Store.";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export async function openAppleSubscriptionManagement(
  opener: (url: string) => Promise<unknown>,
) {
  await opener(APPLE_SUBSCRIPTIONS_URL);
}

export async function openMembershipManagement(api: { openSubscriptionManagement: () => Promise<{provider:"stripe"|"apple";url:string}> }, opener: (url:string)=>Promise<unknown>) {
  const result = await api.openSubscriptionManagement();
  const url = new URL(result.url);
  const allowed = result.provider === "apple"
    ? url.hostname === "apps.apple.com" && url.pathname === "/account/subscriptions"
    : url.hostname === "billing.stripe.com";
  if (url.protocol !== "https:" || url.username || url.password || !allowed) throw new Error("Membership management returned an invalid link.");
  await opener(url.toString());
}

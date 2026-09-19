export const appleSubscriptionCancellationGuidance = "Bourbon Signal cannot cancel an Apple subscription. Apple billing continues until you cancel it in the App Store.";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export async function openAppleSubscriptionManagement(
  opener: (url: string) => Promise<unknown>,
) {
  await opener(APPLE_SUBSCRIPTIONS_URL);
}

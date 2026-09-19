import assert from "node:assert/strict";
import test from "node:test";
import { APPLE_PRODUCT_IDS, PurchaseProviderError } from "./purchases";
import { createRevenueCatPurchaseAdapter } from "./revenuecat-adapter";

function sdkHarness(errorCode?: string) {
  const calls: string[] = [];
  const packages = [
    { identifier: "package-0", product: { identifier: APPLE_PRODUCT_IDS.standard.monthly, priceString: "$3.00", subscriptionPeriod: "P1M", introPrice: null } },
    { identifier: "package-1", product: { identifier: APPLE_PRODUCT_IDS.standard.annual, priceString: "$30.00", subscriptionPeriod: "P1Y", introPrice: null } },
    { identifier: "package-2", product: { identifier: APPLE_PRODUCT_IDS.barrel.monthly, priceString: "$6.00", subscriptionPeriod: "P1M", introPrice: { price: 0 } } },
    { identifier: "package-3", product: { identifier: APPLE_PRODUCT_IDS.barrel.annual, priceString: "$60.00", subscriptionPeriod: "P1Y", introPrice: null } },
  ];
  const sdk = {
    configure({ apiKey, appUserID }: { apiKey: string; appUserID: string }) { calls.push(`configure:${apiKey}:${appUserID}`); },
    async logIn(userId: string) { calls.push(`login:${userId}`); },
    async logOut() { calls.push("logout"); },
    async getOfferings() { calls.push("offerings"); return { current: { availablePackages: packages } }; },
    async purchasePackage(item: { identifier: string }) {
      calls.push(`purchase:${item.identifier}`);
      if (errorCode) throw { code: errorCode, message: "provider detail" };
    },
    async restorePurchases() { calls.push("restore"); },
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: "1",
      PAYMENT_PENDING_ERROR: "20",
      NETWORK_ERROR: "10",
      OFFLINE_CONNECTION_ERROR: "35",
      PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: "5",
    },
  };
  return { sdk, calls };
}

test("RevenueCat adapter uses localized StoreKit metadata but never treats offer metadata as per-user trial eligibility", async () => {
  const { sdk, calls } = sdkHarness();
  const adapter = createRevenueCatPurchaseAdapter(async () => ({ default: sdk }));
  await adapter.configure({ apiKey: "appl_public", appUserId: "user_A" });
  const products = await adapter.loadDefaultOffering();
  await adapter.purchase(APPLE_PRODUCT_IDS.barrel.monthly);
  await adapter.clearSession();
  await adapter.configure({ apiKey: "appl_public", appUserId: "user_B" });
  await adapter.restore();

  assert.deepEqual(products.map((product) => [product.productId, product.localizedPrice, product.localizedPeriod, product.hasIntroductoryOffer]), [
    [APPLE_PRODUCT_IDS.standard.monthly, "$3.00", "month", false],
    [APPLE_PRODUCT_IDS.standard.annual, "$30.00", "year", false],
    [APPLE_PRODUCT_IDS.barrel.monthly, "$6.00", "month", false],
    [APPLE_PRODUCT_IDS.barrel.annual, "$60.00", "year", false],
  ]);
  assert.deepEqual(calls, [
    "configure:appl_public:user_A",
    "offerings",
    "purchase:package-2",
    "login:user_B",
    "restore",
  ]);
});

test("RevenueCat session clearing never creates an anonymous provider identity", async () => {
  const { sdk, calls } = sdkHarness();
  const adapter = createRevenueCatPurchaseAdapter(async () => ({ default: sdk }));
  await adapter.configure({ apiKey: "appl_public", appUserId: "user_A" });
  await adapter.clearSession();
  assert.deepEqual(calls, ["configure:appl_public:user_A"]);
  assert.equal(calls.includes("logout"), false);
});

test("RevenueCat adapter maps cancellation, pending, unavailable, and network failures", async () => {
  for (const [providerCode, expected] of [["1", "cancelled"], ["20", "pending"], ["5", "unavailable"], ["10", "network"], ["35", "network"]] as const) {
    const { sdk } = sdkHarness(providerCode);
    const adapter = createRevenueCatPurchaseAdapter(async () => ({ default: sdk }));
    await adapter.configure({ apiKey: "appl_public", appUserId: "user_A" });
    await adapter.loadDefaultOffering();
    await assert.rejects(
      () => adapter.purchase(APPLE_PRODUCT_IDS.standard.monthly),
      (error: unknown) => error instanceof PurchaseProviderError && error.code === expected && !error.message.includes("provider detail"),
    );
  }
});

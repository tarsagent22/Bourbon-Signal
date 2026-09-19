import { PurchaseProviderError, type AppleProductId, type PurchaseAdapter, type PurchaseStorePackage } from "./purchases";

type RevenueCatPackage = {
  identifier: string;
  product: {
    identifier: string;
    priceString: string;
    subscriptionPeriod: string | null;
    introPrice: { price: number } | null;
  };
};

type RevenueCatSdk = {
  configure(input: { apiKey: string; appUserID: string }): void;
  logIn(appUserId: string): Promise<unknown>;
  getOfferings(): Promise<{ current: { availablePackages: RevenueCatPackage[] } | null }>;
  purchasePackage(item: RevenueCatPackage): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: string;
    PAYMENT_PENDING_ERROR: string;
    NETWORK_ERROR: string;
    OFFLINE_CONNECTION_ERROR: string;
    PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: string;
  };
};

type RevenueCatModule = { default: RevenueCatSdk };
type RevenueCatLoader = () => Promise<RevenueCatModule>;

const defaultLoader: RevenueCatLoader = async () => await import("react-native-purchases") as unknown as RevenueCatModule;

function localizedPeriod(period: string | null) {
  if (period === "P1M") return "month";
  if (period === "P1Y") return "year";
  return period || "billing period";
}

function providerError(sdk: RevenueCatSdk, caught: unknown) {
  const code = typeof caught === "object" && caught !== null && "code" in caught ? String(caught.code) : "";
  if (code === sdk.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return new PurchaseProviderError("cancelled", "Purchase canceled.");
  if (code === sdk.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return new PurchaseProviderError("pending", "Purchase pending.");
  if (code === sdk.PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) return new PurchaseProviderError("unavailable", "This Apple product is not available.");
  if (code === sdk.PURCHASES_ERROR_CODE.NETWORK_ERROR || code === sdk.PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR) {
    return new PurchaseProviderError("network", "The App Store could not be reached.");
  }
  return new PurchaseProviderError("provider", "The App Store could not complete the request.");
}

export function createRevenueCatPurchaseAdapter(load: RevenueCatLoader = defaultLoader): PurchaseAdapter {
  let sdk: RevenueCatSdk | null = null;
  let configured = false;
  let activeUserId: string | null = null;
  const packages = new Map<string, RevenueCatPackage>();

  async function module() {
    sdk ??= (await load()).default;
    return sdk;
  }

  return {
    async configure({ apiKey, appUserId }) {
      const purchases = await module();
      if (!configured) {
        purchases.configure({ apiKey, appUserID: appUserId });
        configured = true;
      } else if (activeUserId !== appUserId) {
        await purchases.logIn(appUserId);
      }
      activeUserId = appUserId;
    },
    async clearSession() {
      packages.clear();
    },
    async loadDefaultOffering() {
      const purchases = await module();
      const offering = (await purchases.getOfferings()).current;
      packages.clear();
      if (!offering) return [];
      return offering.availablePackages.map((item): PurchaseStorePackage => {
        packages.set(item.product.identifier, item);
        return {
          productId: item.product.identifier,
          packageIdentifier: item.identifier,
          localizedPrice: item.product.priceString,
          localizedPeriod: localizedPeriod(item.product.subscriptionPeriod),
          // RevenueCat's introPrice describes product metadata, not this Apple
          // account's eligibility. Keep trial presentation fail-closed until a
          // true per-user StoreKit eligibility API is wired.
          hasIntroductoryOffer: false,
        };
      });
    },
    async purchase(productId: AppleProductId) {
      const purchases = await module();
      const item = packages.get(productId);
      if (!item) throw new PurchaseProviderError("unavailable", "This Apple product is not available.");
      try {
        await purchases.purchasePackage(item);
      } catch (caught) {
        throw providerError(purchases, caught);
      }
    },
    async restore() {
      const purchases = await module();
      try {
        await purchases.restorePurchases();
      } catch (caught) {
        throw providerError(purchases, caught);
      }
    },
  };
}

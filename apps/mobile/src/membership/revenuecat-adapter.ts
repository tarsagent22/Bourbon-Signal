import type {SubscriptionOption} from "react-native-purchases";
import { PurchaseProviderError, type AppleProductId, type PurchaseAdapter, type PurchaseStorePackage } from "./purchases";

type RevenueCatPackage = {
  identifier: string;
  product: {
    identifier: string;
    subscriptionOptions?: SubscriptionOption[] | null;
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
  purchaseSubscriptionOption?(option: SubscriptionOption,change?: {oldProductIdentifier:string}):Promise<unknown>;
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

function providerError(sdk: RevenueCatSdk, caught: unknown,platform: "ios"|"android") {
  const code = typeof caught === "object" && caught !== null && "code" in caught ? String(caught.code) : "";
  if (code === sdk.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return new PurchaseProviderError("cancelled", "Purchase canceled.");
  if (code === sdk.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return new PurchaseProviderError("pending", "Purchase pending.");
  if (code === sdk.PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) return new PurchaseProviderError("unavailable", platform==="android" ? "This Google Play product is not available." : "This Apple product is not available.");
  if (code === sdk.PURCHASES_ERROR_CODE.NETWORK_ERROR || code === sdk.PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR) {
    return new PurchaseProviderError("network", platform==="android" ? "Google Play could not be reached." : "The App Store could not be reached.");
  }
  return new PurchaseProviderError("provider", platform==="android" ? "Google Play could not complete the request." : "The App Store could not complete the request.");
}

export function createRevenueCatPurchaseAdapter(load: RevenueCatLoader = defaultLoader, platform: "ios"|"android"="ios"): PurchaseAdapter {
  let sdk: RevenueCatSdk | null = null;
  let configured = false;
  let activeUserId: string | null = null;
  const packages = new Map<string, RevenueCatPackage>();
  const basePlans = new Map<string, SubscriptionOption>();

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
      basePlans.clear();
    },
    async loadDefaultOffering() {
      const purchases = await module();
      const offering = (await purchases.getOfferings()).current;
      packages.clear();
      basePlans.clear();
      if (!offering) return [];
      return offering.availablePackages.flatMap((item): PurchaseStorePackage[] => {
        const productId = platform==="android" && item.product.identifier.endsWith(":monthly") ? item.product.identifier.slice(0,-8) : item.product.identifier;
        let base:SubscriptionOption|undefined;
        if(platform==="android") {
          if(!["com.bourbonsignal.app.standard.monthly","com.bourbonsignal.app.barrel.monthly"].includes(productId))return [];
          base=item.product.subscriptionOptions?.find(o=>o.id==="monthly" && o.isBasePlan && o.isPrepaid===false && o.billingPeriod?.iso8601==="P1M" && o.pricingPhases.length===1 && o.pricingPhases[0].price.amountMicros>0);
          if(!base)return [];
          basePlans.set(productId,base);
        }
        packages.set(productId, item);
        return [{
          productId,
          packageIdentifier: item.identifier,
          localizedPrice: base?.pricingPhases[0].price.formatted || item.product.priceString,
          localizedPeriod: localizedPeriod(base?.billingPeriod?.iso8601 || item.product.subscriptionPeriod),
          // RevenueCat's introPrice describes product metadata, not this Apple
          // account's eligibility. Keep trial presentation fail-closed until a
          // true per-user StoreKit eligibility API is wired.
          hasIntroductoryOffer: false,
        }];
      });
    },
    async purchase(productId: AppleProductId,replacingProductId?:AppleProductId) {
      const purchases = await module();
      const item = packages.get(productId);
      if (!item) throw new PurchaseProviderError("unavailable", platform==="android" ? "This Google Play product is not available." : "This Apple product is not available.");
      try {
        if(platform==="android") {
          const base=basePlans.get(productId);
          if(!base || !purchases.purchaseSubscriptionOption)throw new PurchaseProviderError("unavailable","Google Play base plan is unavailable.");
          await purchases.purchaseSubscriptionOption(base,replacingProductId && replacingProductId!==productId ? {oldProductIdentifier:replacingProductId} : undefined);
        } else await purchases.purchasePackage(item);
      } catch (caught) {
        throw providerError(purchases, caught,platform);
      }
    },
    async restore() {
      const purchases = await module();
      try {
        await purchases.restorePurchases();
      } catch (caught) {
        throw providerError(purchases, caught,platform);
      }
    },
  };
}

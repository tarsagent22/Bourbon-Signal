import type {
  AppleMembershipReadinessResponse,
  AppleMembershipReconciliationRequest,
  AppleMembershipReconciliationResponse,
  AppleMembershipSummary,
  MemberProfile,
} from "../api/types";
import type { MembershipTier } from "./membership-plans";

export const APPLE_PRODUCT_IDS = Object.freeze({
  standard: Object.freeze({
    monthly: "com.bourbonsignal.app.standard.monthly",
    annual: "com.bourbonsignal.app.standard.annual",
  }),
  barrel: Object.freeze({
    monthly: "com.bourbonsignal.app.barrel.monthly",
    annual: "com.bourbonsignal.app.barrel.annual",
  }),
} as const);

const APPROVED_PRODUCT_IDS = Object.freeze([
  APPLE_PRODUCT_IDS.standard.monthly,
  APPLE_PRODUCT_IDS.standard.annual,
  APPLE_PRODUCT_IDS.barrel.monthly,
  APPLE_PRODUCT_IDS.barrel.annual,
] as const);

const REQUIRED_PURCHASE_PRODUCT_IDS = Object.freeze([
  APPLE_PRODUCT_IDS.standard.monthly,
  APPLE_PRODUCT_IDS.barrel.monthly,
] as const);

export type AppleProductId = (typeof APPROVED_PRODUCT_IDS)[number];
export type PurchaseFlowStatus = "signed_out" | "unsupported" | "configuring" | "unavailable" | "ready" | "purchasing" | "restoring" | "cancelled" | "pending" | "error";

export type PurchaseStorePackage = {
  productId: string;
  packageIdentifier: string;
  localizedPrice: string;
  localizedPeriod: string;
  hasIntroductoryOffer: boolean;
};

export type ApplePurchaseProduct = PurchaseStorePackage & {
  productId: AppleProductId;
  tier: "standard" | "barrel";
  interval: "monthly" | "annual";
};

export interface PurchaseAdapter {
  configure(input: { apiKey: string; appUserId: string }): Promise<void>;
  clearSession(): Promise<void>;
  loadDefaultOffering(): Promise<PurchaseStorePackage[]>;
  purchase(productId: AppleProductId): Promise<void>;
  restore(): Promise<void>;
}

export interface AppleMembershipApi {
  getMemberProfile(options?: { fresh?: boolean }): Promise<MemberProfile>;
  getAppleMembershipReadiness(options?: { fresh?: boolean }): Promise<AppleMembershipReadinessResponse>;
  reconcileAppleMembership(input: AppleMembershipReconciliationRequest): Promise<AppleMembershipReconciliationResponse>;
}

export class PurchaseProviderError extends Error {
  constructor(readonly code: "cancelled" | "pending" | "unavailable" | "network" | "provider", message: string) {
    super(message);
    this.name = "PurchaseProviderError";
  }
}

export type PurchaseCoordinatorState = {
  status: PurchaseFlowStatus;
  message: string;
  products: ApplePurchaseProduct[];
  profile: MemberProfile["profile"] | null;
  eligibleProductIds: AppleProductId[];
  restoreAvailable: boolean;
  membership: AppleMembershipSummary | null;
};

const EMPTY_STATE: PurchaseCoordinatorState = {
  status: "signed_out",
  message: "Sign in to view Apple purchase options.",
  products: [],
  profile: null,
  eligibleProductIds: [],
  restoreAvailable: false,
  membership: null,
};

function productIdentity(productId: AppleProductId) {
  if (productId === APPLE_PRODUCT_IDS.standard.monthly) return { tier: "standard", interval: "monthly" } as const;
  if (productId === APPLE_PRODUCT_IDS.standard.annual) return { tier: "standard", interval: "annual" } as const;
  if (productId === APPLE_PRODUCT_IDS.barrel.monthly) return { tier: "barrel", interval: "monthly" } as const;
  return { tier: "barrel", interval: "annual" } as const;
}

export function isAppleProductId(value: string): value is AppleProductId {
  return (APPROVED_PRODUCT_IDS as readonly string[]).includes(value);
}

export function productIdFor(tier: MembershipTier, interval: "monthly" | "annual"): AppleProductId | null {
  if (tier !== "standard" && tier !== "barrel") return null;
  return APPLE_PRODUCT_IDS[tier][interval];
}

export function mapDefaultOfferingPackages(packages: PurchaseStorePackage[]) {
  const approved = new Map<AppleProductId, ApplePurchaseProduct>();
  for (const item of packages) {
    if (!isAppleProductId(item.productId) || approved.has(item.productId)) continue;
    const identity = productIdentity(item.productId);
    approved.set(item.productId, { ...item, productId: item.productId, ...identity });
  }
  const products = APPROVED_PRODUCT_IDS.flatMap((productId) => {
    const product = approved.get(productId);
    return product ? [product] : [];
  });
  return { products, complete: REQUIRED_PURCHASE_PRODUCT_IDS.every((productId) => approved.has(productId)) };
}

function messageForUnavailable(reason: "key" | "products" | "server") {
  if (reason === "key") return "Apple purchases are not available in this build because purchase configuration is incomplete.";
  if (reason === "products") return "Apple purchase options could not be loaded. No purchase was started.";
  return "Apple purchases are not available until secure account reconciliation is configured. Your current server-confirmed membership is unchanged.";
}

function rank(tier: MembershipTier) {
  return tier === "free" ? 0 : tier === "standard" ? 1 : tier === "barrel" ? 2 : 3;
}

export function createPurchaseCoordinator({
  adapter,
  api,
  publicIosApiKey,
  platform,
}: {
  adapter: PurchaseAdapter;
  api: AppleMembershipApi;
  publicIosApiKey: string;
  platform: "ios" | "android" | "web";
}) {
  let state: PurchaseCoordinatorState = { ...EMPTY_STATE };
  let configuredUserId: string | null = null;
  let sessionRevision = 0;
  let sessionQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<(next: PurchaseCoordinatorState) => void>();

  const publish = (patch: Partial<PurchaseCoordinatorState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  const unavailable = (reason: "key" | "products" | "server", profile: MemberProfile["profile"] | null = null, products: ApplePurchaseProduct[] = [], membership: AppleMembershipSummary | null = null) => {
    publish({ status: "unavailable", message: messageForUnavailable(reason), products, profile, eligibleProductIds: [], restoreAvailable: false, membership });
    return state;
  };

  async function applySession(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }, revision: number) {
    if (revision !== sessionRevision) return state;
    if (!session.isLoaded) {
      publish({ ...EMPTY_STATE, status: "configuring", message: "Loading your account before Apple purchases are configured." });
      return state;
    }
    if (!session.isSignedIn || !session.userId) {
      if (configuredUserId) await adapter.clearSession().catch(() => undefined);
      if (revision !== sessionRevision) return state;
      configuredUserId = null;
      publish({ ...EMPTY_STATE });
      return state;
    }
    if (platform !== "ios") {
      publish({ ...EMPTY_STATE, status: "unsupported", message: "Apple purchases are available only in the iOS app." });
      return state;
    }
    if (!publicIosApiKey.trim().startsWith("appl_")) return unavailable("key");

    if (configuredUserId && configuredUserId !== session.userId) await adapter.clearSession().catch(() => undefined);
    if (revision !== sessionRevision) return state;
    configuredUserId = null;
    publish({ ...EMPTY_STATE, status: "configuring", message: "Loading secure Apple purchase options." });

    try {
      await adapter.configure({ apiKey: publicIosApiKey.trim(), appUserId: session.userId });
      configuredUserId = session.userId;
      if (revision !== sessionRevision) return state;
      const profileResponse = await api.getMemberProfile({ fresh: true });
      let packages: PurchaseStorePackage[];
      try {
        packages = await adapter.loadDefaultOffering();
      } catch {
        if (revision !== sessionRevision || configuredUserId !== session.userId) return state;
        return unavailable("products", profileResponse.profile);
      }
      if (revision !== sessionRevision || configuredUserId !== session.userId) return state;
      const mapped = mapDefaultOfferingPackages(packages);
      if (!mapped.complete) return unavailable("products", profileResponse.profile);
      let readiness: AppleMembershipReadinessResponse;
      try {
        readiness = await api.getAppleMembershipReadiness({ fresh: true });
      } catch {
        if (revision !== sessionRevision || configuredUserId !== session.userId) return state;
        return unavailable("server", profileResponse.profile, mapped.products);
      }
      if (revision !== sessionRevision || configuredUserId !== session.userId) return state;
      if (!readiness.available || readiness.reason !== "ready") return unavailable("server", profileResponse.profile, mapped.products, readiness.membership);
      const eligibleProductIds = readiness.eligibleProductIds.filter(isAppleProductId);
      publish({
        status: "ready",
        message: "Apple purchase options are ready. Paid access appears only after Bourbon Signal confirms it on the server.",
        products: mapped.products,
        profile: profileResponse.profile,
        eligibleProductIds,
        restoreAvailable: readiness.restoreAvailable,
        membership: readiness.membership,
      });
    } catch {
      if (revision === sessionRevision) unavailable("server", state.profile);
    }
    return state;
  }

  function syncSession(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }) {
    const revision = ++sessionRevision;
    const run = sessionQueue.then(() => applySession(session, revision));
    sessionQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  function assertReady(productId?: AppleProductId) {
    if (state.status !== "ready" && state.status !== "cancelled" && state.status !== "pending" && state.status !== "error") {
      throw new Error("Apple purchases are not available right now.");
    }
    if (!configuredUserId || !state.profile) throw new Error("Apple purchases are not available until your account is verified.");
    if (productId && !state.eligibleProductIds.includes(productId)) throw new Error("This Apple purchase is not available for this account.");
    return { revision: sessionRevision, userId: configuredUserId };
  }

  function isSameAccount(operation: { revision: number; userId: string }) {
    return operation.revision === sessionRevision && operation.userId === configuredUserId;
  }

  function assertSameAccount(operation: { revision: number; userId: string }) {
    if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
  }

  async function reconcile(operation: { revision: number; userId: string }, input: AppleMembershipReconciliationRequest, expectedTier?: "standard" | "barrel") {
    assertSameAccount(operation);
    let reconciliation: AppleMembershipReconciliationResponse;
    try {
      reconciliation = await api.reconcileAppleMembership(input);
      assertSameAccount(operation);
      const refreshed = await api.getMemberProfile({ fresh: true });
      assertSameAccount(operation);
      const tier = refreshed.profile.membership.tier;
      const reconciled = reconciliation.status === "reconciled"
        && reconciliation.effectiveTier === tier
        && (tier === "free" || refreshed.profile.membership.paid)
        && (!expectedTier || rank(tier) >= rank(expectedTier));
      if (!reconciled) throw new Error("Authoritative membership did not match the Apple purchase.");
      publish({
        status: "ready",
        profile: refreshed.profile,
        membership: reconciliation.membership,
        message: tier === "free"
          ? "No active Apple membership was found. Your server-confirmed Free access is unchanged."
          : `${tier === "bottled-in-bond" ? "Founder" : tier === "barrel" ? "Barrel" : "Standard"} access is confirmed.`,
      });
      return state;
    } catch {
      if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
      publish({ status: "error", message: "Bourbon Signal could not confirm this purchase with the server. Paid access has not changed; retry reconciliation before purchasing again." });
      throw new Error("Bourbon Signal could not confirm the purchase with the server.");
    }
  }

  async function purchase(productId: AppleProductId) {
    const operation = assertReady(productId);
    publish({ status: "purchasing", message: "Waiting for the App Store. Paid access has not changed yet." });
    try {
      await adapter.purchase(productId);
    } catch (caught) {
      if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
      if (caught instanceof PurchaseProviderError && caught.code === "cancelled") {
        publish({ status: "cancelled", message: "Purchase canceled. Your membership did not change." });
        return state;
      }
      if (caught instanceof PurchaseProviderError && caught.code === "pending") {
        publish({ status: "pending", message: "The App Store says this purchase is pending. Access will not change until Bourbon Signal confirms it." });
        return state;
      }
      publish({ status: "error", message: caught instanceof PurchaseProviderError && caught.code === "network"
        ? "The App Store could not be reached. Check your connection and try again."
        : "The App Store could not complete this purchase. No membership change was made." });
      throw caught;
    }
    return reconcile(operation, { action: "purchase", productId }, productIdentity(productId).tier);
  }

  async function restore() {
    const operation = assertReady();
    if (!state.restoreAvailable) throw new Error("Apple purchase restoration is not available right now.");
    publish({ status: "restoring", message: "Checking the App Store for previous purchases. Access has not changed yet." });
    try {
      await adapter.restore();
    } catch (caught) {
      if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
      publish({ status: "error", message: caught instanceof PurchaseProviderError && caught.code === "network"
        ? "The App Store could not be reached. Check your connection and try again."
        : "Previous Apple purchases could not be restored. Your current membership is unchanged." });
      throw caught;
    }
    return reconcile(operation, { action: "restore" });
  }

  return {
    getState: () => state,
    subscribe(listener: (next: PurchaseCoordinatorState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    syncSession,
    purchase,
    restore,
  };
}

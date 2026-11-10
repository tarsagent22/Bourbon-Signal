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
  purchase(productId: AppleProductId, replacingProductId?: AppleProductId): Promise<void>;
  restore(): Promise<void>;
  getActiveSubscriptionProductIds?(): Promise<string[]>;
}

export interface AppleMembershipApi {
  getGoogleMembershipReadiness?(options?: { fresh?: boolean }): Promise<AppleMembershipReadinessResponse>;
  reconcileGoogleMembership?(input: AppleMembershipReconciliationRequest): Promise<AppleMembershipReconciliationResponse>;
  getMemberProfile(options?: { fresh?: boolean }): Promise<MemberProfile>;
  getAppleMembershipReadiness(options?: { fresh?: boolean }): Promise<AppleMembershipReadinessResponse>;
  reconcileAppleMembership(input: AppleMembershipReconciliationRequest): Promise<AppleMembershipReconciliationResponse>;
}

export class PurchaseProviderError extends Error {
  constructor(readonly code: "cancelled" | "pending" | "unavailable" | "network" | "provider" | "account", message: string) {
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
    if (!isAppleProductId(item.productId) || !(REQUIRED_PURCHASE_PRODUCT_IDS as readonly string[]).includes(item.productId) || approved.has(item.productId)) continue;
    const identity = productIdentity(item.productId);
    approved.set(item.productId, { ...item, productId: item.productId, ...identity });
  }
  const products = APPROVED_PRODUCT_IDS.flatMap((productId) => {
    const product = approved.get(productId);
    return product ? [product] : [];
  });
  return { products, complete: REQUIRED_PURCHASE_PRODUCT_IDS.every((productId) => approved.has(productId)) };
}

function messageForUnavailable(reason: "key" | "products" | "server", label="Apple") {
  if (reason === "key") return `${label} purchases are not available in this build because purchase configuration is incomplete.`;
  if (reason === "products") return `${label} purchase options could not be loaded. No purchase was started.`;
  return `${label} purchases are not available until secure account reconciliation is configured. Your current server-confirmed membership is unchanged.`;
}

function rank(tier: MembershipTier) {
  return tier === "free" ? 0 : tier === "standard" ? 2 : tier === "barrel" ? 2 : 3;
}

export function createPurchaseCoordinator({
  adapter,
  api,
  publicIosApiKey,
  publicAndroidApiKey="",
  platform,
  onMembershipChanged,
  waitForRetry = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
}: {
  adapter: PurchaseAdapter;
  api: AppleMembershipApi;
  publicIosApiKey: string;
  publicAndroidApiKey?: string;
  platform: "ios" | "android" | "web";
  onMembershipChanged?: (userId: string) => void;
  waitForRetry?: (milliseconds: number) => Promise<void>;
}) {
  const purchaseLabel=platform==="android" ? "Google Play" : "Apple";
  const storeLabel=platform==="android" ? "Google Play" : "App Store";
  const membershipApi=platform==="android" ? {readiness:api.getGoogleMembershipReadiness?.bind(api),reconcile:api.reconcileGoogleMembership?.bind(api)} : {readiness:api.getAppleMembershipReadiness.bind(api),reconcile:api.reconcileAppleMembership.bind(api)};
  let state: PurchaseCoordinatorState = { ...EMPTY_STATE };
  let configuredUserId: string | null = null;
  let configuringUserId: string | null = null;
  let sessionRevision = 0;
  let requestedUserId: string | null = null;
  let purchaseEpoch = 0;
  let sessionQueue: Promise<void> = Promise.resolve();
  let upgradeInFlight = false;
  let unconfirmedPurchase: { userId: string; productId: AppleProductId } | null = null;
  let pendingPurchase: { userId: string; productId: AppleProductId } | null = null;
  const listeners = new Set<(next: PurchaseCoordinatorState) => void>();

  const publish = (patch: Partial<PurchaseCoordinatorState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  const unavailable = (reason: "key" | "products" | "server", profile: MemberProfile["profile"] | null = null, products: ApplePurchaseProduct[] = [], membership: AppleMembershipSummary | null = null) => {
    publish({ status: "unavailable", message: messageForUnavailable(reason,purchaseLabel), products, profile, eligibleProductIds: [], restoreAvailable: false, membership });
    return state;
  };

  async function applySession(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }, revision: number) {
    if (revision !== sessionRevision) return state;
    if (!session.isLoaded) {
      publish({ ...EMPTY_STATE, status: "configuring", message: `Loading your account before ${purchaseLabel} purchases are configured.` });
      return state;
    }
    if (!session.isSignedIn || !session.userId) {
      if (configuredUserId) await adapter.clearSession().catch(() => undefined);
      if (revision !== sessionRevision) return state;
      configuredUserId = null;
      publish({ ...EMPTY_STATE });
      return state;
    }
    if (platform === "web") {
      publish({ ...EMPTY_STATE, status: "unsupported", message: "Store purchases are available only in the mobile app." });
      return state;
    }
    const apiKey=platform==="android" ? publicAndroidApiKey : publicIosApiKey;
    if (!apiKey.trim().startsWith(platform==="android" ? "goog_" : "appl_")) return unavailable("key");
    if (!membershipApi.readiness || !membershipApi.reconcile) return unavailable("server");

    if (configuredUserId && configuredUserId !== session.userId) await adapter.clearSession().catch(() => undefined);
    if (revision !== sessionRevision) return state;
    configuredUserId = null;
    publish({ ...EMPTY_STATE, status: "configuring", message: `Loading secure ${purchaseLabel} purchase options.` });

    try {
      configuringUserId = session.userId;
      try { await adapter.configure({ apiKey: apiKey.trim(), appUserId: session.userId }); }
      finally { configuringUserId = null; }
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
      if (platform==="android") mapped.products=mapped.products.filter(p=>p.interval==="monthly");
      if (!mapped.complete) return unavailable("products", profileResponse.profile);
      let readiness: AppleMembershipReadinessResponse;
      try {
        readiness = await membershipApi.readiness!({ fresh: true });
      } catch {
        if (revision !== sessionRevision || configuredUserId !== session.userId) return state;
        return unavailable("server", profileResponse.profile, mapped.products);
      }
      if (revision !== sessionRevision || configuredUserId !== session.userId) return state;
      if (!readiness.available || readiness.reason !== "ready") return unavailable("server", profileResponse.profile, mapped.products, readiness.membership);
      const eligibleProductIds = readiness.eligibleProductIds.filter(isAppleProductId);
      publish({
        status: "ready",
        message: `${purchaseLabel} purchase options are ready. Paid access appears only after Bourbon Signal confirms it on the server.`,
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

  function observeSession(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }) {
    if (!session.isLoaded) return;
    const nextUserId = session.isSignedIn ? session.userId : null;
    if (requestedUserId === nextUserId) return;
    const hadAccount = configuringUserId !== null || configuredUserId !== null;
    requestedUserId = nextUserId;
    unconfirmedPurchase = null;
    pendingPurchase = null;
    configuredUserId = null;
    ++sessionRevision;
    publish({ ...EMPTY_STATE });
    if (hadAccount) sessionQueue = sessionQueue.then(async () => {
      await adapter.clearSession();
      configuredUserId = null;
    }).catch(() => undefined);
  }

  function syncSession(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }) {
    observeSession(session);
    const revision = ++sessionRevision;
    const run = sessionQueue.then(() => applySession(session, revision));
    sessionQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  function recognizeSession(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }) {
    observeSession(session);
    if (!session.isLoaded || !session.isSignedIn || !session.userId || platform === "web") return syncSession(session);
    // Returning from Apple's purchase sheet must not invalidate its pending operation.
    if (session.userId === configuredUserId && ["purchasing", "restoring"].includes(state.status)) return Promise.resolve(state);
    const userId = session.userId;
    const revision = requestedUserId === userId ? sessionRevision : ++sessionRevision;
    requestedUserId = userId;
    const run = sessionQueue.then(async () => {
      if (revision !== sessionRevision) return state;
      if (["purchasing", "restoring"].includes(state.status)) return state;
      const recognitionEpoch = purchaseEpoch;
      const current = () => revision === sessionRevision && recognitionEpoch === purchaseEpoch;
      const apiKey = platform === "android" ? publicAndroidApiKey : publicIosApiKey;
      if (!apiKey.trim() || !membershipApi.readiness || !membershipApi.reconcile) return state;
      try {
        if (configuredUserId && configuredUserId !== userId) {
          await adapter.clearSession();
          if (!current()) return state;
          publish({ ...EMPTY_STATE });
        }
        configuringUserId = userId;
        try { await adapter.configure({ apiKey: apiKey.trim(), appUserId: userId }); }
        finally { configuringUserId = null; }
        if (!current()) return state;
        configuredUserId = userId;
        const profileResponse = await api.getMemberProfile({ fresh: true });
        if (!current()) return state;
        const previousMembership = state.profile?.membership;
        publish({ profile: profileResponse.profile });
        if (previousMembership
          ? previousMembership.tier !== profileResponse.profile.membership.tier || previousMembership.paid !== profileResponse.profile.membership.paid
          : profileResponse.profile.membership.paid) {
          try { onMembershipChanged?.(userId); } catch { /* Screen refresh cannot invalidate confirmed access. */ }
        }
        const readiness = await membershipApi.readiness({ fresh: true });
        if (!current() || !readiness.available) return state;
        publish({ membership: readiness.membership, restoreAvailable: readiness.restoreAvailable,
          ...(state.status === "signed_out" ? { status: "ready" as const, message: "" } : {}) });
        const active = await adapter.getActiveSubscriptionProductIds?.() || [];
        if (!current()) return state;
        // No restore/syncPurchases call: those may prompt Apple authentication or transfer receipts.
        if (!readiness.membership && !active.some(isAppleProductId)) return state;
        await reconcile({ revision, userId, recognitionEpoch }, { action: "sync" });
      } catch {
        // Preserve server-confirmed access and allow a later foreground check to retry.
      }
      return state;
    });
    sessionQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  function assertReady(productId?: AppleProductId) {
    if (state.status !== "ready" && state.status !== "cancelled" && state.status !== "pending" && state.status !== "error") {
      throw new Error(`${purchaseLabel} purchases are not available right now.`);
    }
    if (!configuredUserId || !state.profile) throw new Error(`${purchaseLabel} purchases are not available until your account is verified.`);
    if (productId && !state.eligibleProductIds.includes(productId)) throw new Error(`This ${purchaseLabel} purchase is not available for this account.`);
    return { revision: sessionRevision, userId: configuredUserId };
  }

  function isSameAccount(operation: { revision: number; userId: string; recognitionEpoch?: number }) {
    return operation.revision === sessionRevision && operation.userId === configuredUserId
      && (operation.recognitionEpoch === undefined || operation.recognitionEpoch === purchaseEpoch);
  }

  function assertSameAccount(operation: { revision: number; userId: string; recognitionEpoch?: number }) {
    if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
  }

  async function reconcile(operation: { revision: number; userId: string; recognitionEpoch?: number }, input: AppleMembershipReconciliationRequest, expectedTier?: "standard" | "barrel") {
    assertSameAccount(operation);
    let reconciliation: AppleMembershipReconciliationResponse;
    try {
      let refreshed!: MemberProfile;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          reconciliation = await membershipApi.reconcile!(input);
          assertSameAccount(operation);
          refreshed = await api.getMemberProfile({ fresh: true });
          assertSameAccount(operation);
          const tier = refreshed.profile.membership.tier;
          const reconciled = reconciliation.status === "reconciled"
        && reconciliation.effectiveTier === tier
        && (tier === "free" || refreshed.profile.membership.paid)
        && (!expectedTier || rank(tier) >= rank(expectedTier));
          if (!reconciled) throw Object.assign(new Error(`Authoritative membership did not match the ${purchaseLabel} purchase.`), { retryable: true });
          break;
        } catch (error) {
          assertSameAccount(operation);
          const details = error && typeof error === 'object' ? error as { retryable?: boolean; code?: string } : {};
          if (attempt === 3 || (!details.retryable && details.code !== 'NO_APPLE_SUBSCRIPTION' && details.code !== 'NO_GOOGLE_SUBSCRIPTION')) throw error;
          await waitForRetry([300, 800, 1600][attempt]);
          assertSameAccount(operation);
        }
      }
      const tier = refreshed.profile.membership.tier;
      const membershipChanged = state.profile?.membership.tier !== refreshed.profile.membership.tier
        || state.profile?.membership.paid !== refreshed.profile.membership.paid;
      publish({
        status: "ready",
        profile: refreshed.profile,
        membership: reconciliation!.membership,
        message: tier === "free"
          ? `No active ${purchaseLabel} membership was found. Your server-confirmed Free access is unchanged.`
          : `${tier === "bottled-in-bond" ? "Founder" : tier === "barrel" ? "Barrel Proof" : "Standard"} access is confirmed.`,
      });
      if (membershipChanged) { try { onMembershipChanged?.(operation.userId); } catch { /* Screen refresh cannot invalidate confirmed access. */ } }
      return state;
    } catch (caught) {
      if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
      const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : '';
      const message = code === 'PURCHASE_OWNED_BY_ANOTHER_ACCOUNT'
        ? 'This purchase is linked to a previous Bourbon Signal sign-in. Membership support can recover it. Do not purchase again.'
        : 'Your purchase could not be verified yet. Your access is unchanged. Try Restore purchases before buying again.';
      publish({ status: "error", message });
      throw new Error(message);
    }
  }

  async function purchase(productId: AppleProductId) {
    if (!(REQUIRED_PURCHASE_PRODUCT_IDS as readonly string[]).includes(productId)) throw new Error("This membership product is not available for new purchases.");
    const operation = assertReady(productId);
    ++purchaseEpoch;
    publish({ status: "purchasing", message: `Waiting for the ${storeLabel}. Paid access has not changed yet.` });
    try {
      await adapter.purchase(productId, platform==="android" && state.membership && Date.parse(state.membership.expiresAt || "") > Date.now() && ["active","trialing","canceled_period_end","grace_period"].includes(state.membership.status) ? state.membership.productId : undefined);
    } catch (caught) {
      if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
      if (caught instanceof PurchaseProviderError && caught.code === "cancelled") {
        publish({ status: "cancelled", message: "Purchase canceled. Your membership did not change." });
        return state;
      }
      if (caught instanceof PurchaseProviderError && caught.code === "pending") {
        pendingPurchase = { userId: operation.userId, productId };
        publish({ status: "pending", message: `The ${storeLabel} says this purchase is pending. Access will not change until Bourbon Signal confirms it.` });
        return state;
      }
      publish({ status: "error", message: caught instanceof PurchaseProviderError && caught.code === "account" ? caught.message : caught instanceof PurchaseProviderError && caught.code === "network"
        ? `The ${storeLabel} could not be reached. Check your connection and try again.`
        : `The ${storeLabel} could not complete this purchase. No membership change was made.` });
      throw caught;
    }
    unconfirmedPurchase = { userId: operation.userId, productId };
    pendingPurchase = null;
    const result = await reconcile(operation, { action: "purchase", productId }, productIdentity(productId).tier);
    unconfirmedPurchase = null;
    return result;
  }

  async function upgrade(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }, productId: AppleProductId) {
    if (upgradeInFlight) return state;
    upgradeInFlight = true;
    try {
      if (configuredUserId !== session.userId || state.status !== 'ready' || !state.products.some(p => p.productId === productId)) {
        await syncSession(session);
      }
      const operation = assertReady(productId);
      const active = await adapter.getActiveSubscriptionProductIds?.() || [];
      assertSameAccount(operation);
      if (pendingPurchase?.userId === operation.userId && pendingPurchase.productId === productId && !active.includes(productId)) {
        publish({ status: 'pending', message: `${purchaseLabel} is still processing this purchase. Your access will update after it is confirmed.` });
        return state;
      }
      if (unconfirmedPurchase?.userId === operation.userId && unconfirmedPurchase.productId === productId) {
        const result = await reconcile(operation, { action: 'purchase', productId }, productIdentity(productId).tier);
        unconfirmedPurchase = null;
        return result;
      }
      if (active.includes(productId)) {
        const result = await reconcile(operation, { action: 'sync' });
        pendingPurchase = null;
        if (result.profile && rank(result.profile.membership.tier) >= rank(productIdentity(productId).tier) && result.profile.membership.paid) return result;
        const ended = result.membership && (['expired', 'refunded', 'revoked'].includes(result.membership.status)
          || Date.parse(result.membership.expiresAt || '') <= Date.now());
        if (!ended) throw new Error('Membership verification is incomplete. Try Restore purchases before buying again.');
      }
      return await purchase(productId);
    } finally { upgradeInFlight = false; }
  }

  async function restore() {
    const operation = assertReady();
    ++purchaseEpoch;
    if (!state.restoreAvailable) throw new Error(`${purchaseLabel} purchase restoration is not available right now.`);
    publish({ status: "restoring", message: `Checking the ${storeLabel} for previous purchases. Access has not changed yet.` });
    try {
      await adapter.restore();
    } catch (caught) {
      if (!isSameAccount(operation)) throw new Error("The signed-in account changed before the purchase could be confirmed.");
      publish({ status: "error", message: caught instanceof PurchaseProviderError && caught.code === "account" ? caught.message : caught instanceof PurchaseProviderError && caught.code === "network"
        ? `The ${storeLabel} could not be reached. Check your connection and try again.`
        : `Previous ${purchaseLabel} purchases could not be restored. Your current membership is unchanged.` });
      throw caught;
    }
    return reconcile(operation, { action: "restore" });
  }

  async function restoreWhenReady(session: { isLoaded: boolean; isSignedIn: boolean; userId: string | null }) {
    if (upgradeInFlight) return state;
    upgradeInFlight = true;
    try {
      if (configuredUserId !== session.userId || !state.restoreAvailable || !['ready', 'error', 'cancelled', 'pending'].includes(state.status)) await syncSession(session);
      return await restore();
    } finally { upgradeInFlight = false; }
  }

  return {
    getState: () => state,
    subscribe(listener: (next: PurchaseCoordinatorState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    syncSession,
    observeSession,
    recognizeSession,
    purchase,
    upgrade,
    restore,
    restoreWhenReady,
  };
}

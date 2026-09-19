import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { openAppleSubscriptionManagement } from "../../../../src/account/subscription-management";
import type { MemberProfile } from "../../../../src/api/types";
import { ErrorState, memberScreenStyles } from "../../../../src/components/MemberScreen";
import { useMobileApi } from "../../../../src/hooks/useMobileApi";
import {
  membershipActionFor,
  planForTier,
  type BillingInterval,
  type MembershipTier,
} from "../../../../src/membership/membership-plans";
import { deriveMobileMembershipLifecycle } from "../../../../src/membership/membership-lifecycle";
import { usePurchases } from "../../../../src/membership/PurchasesProvider";
import { productIdFor } from "../../../../src/membership/purchases";
import { colors } from "../../../../src/theme";

export default function MembershipPlanScreen() {
  const api = useMobileApi();
  const purchases = usePurchases();
  const router = useRouter();
  const params = useLocalSearchParams<{ tier?: string; interval?: string }>();
  const plan = planForTier(params.tier);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);

  const [error, setError] = useState("");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const requestedInterval: BillingInterval = params.interval === "annual" ? "annual" : "monthly";
  const [interval, setInterval] = useState<BillingInterval>(plan?.lifetime ? "lifetime" : requestedInterval);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await api.getMemberProfile({ fresh: true });
      setProfile(response.profile);
    } catch (caught) {
      setProfile(null);

      setError(caught instanceof Error ? caught.message : "Membership details are temporarily unavailable.");
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (purchases.profile) setProfile(purchases.profile);
  }, [purchases.profile]);

  if (!plan) return <View style={styles.missing}><Text style={styles.missingTitle}>Membership not found</Text><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Back to memberships</Text></Pressable></View>;

  const isFree = plan.tier === "free";
  const isFounder = plan.tier === "bottled-in-bond";
  const productId = productIdFor(plan.tier, interval === "annual" ? "annual" : "monthly");
  const storeProduct = purchases.products.find((product) => product.productId === productId);
  const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, plan.tier) : null;

  const isCurrentOrIncluded = action?.kind === "current" || action?.kind === "included";
  const purchaseBusy = purchases.status === "purchasing" || purchases.status === "restoring" || purchases.status === "configuring";
  const canPurchase = Platform.OS === "ios" && action?.kind === "upgrade" && purchases.status === "ready" && Boolean(productId && storeProduct && purchases.eligibleProductIds.includes(productId));
  const canRestore = Platform.OS === "ios" && purchases.status === "ready" && purchases.restoreAvailable && !isFree && !isFounder;
  const displayPrice = isFree ? "$0" : isFounder ? "Existing access only" : storeProduct?.localizedPrice || "Price unavailable";
  const displayPeriod = storeProduct ? `/${storeProduct.localizedPeriod}` : "";
  const billingDisclosure = Platform.OS === "ios"
    ? "Payment will be charged to your Apple ID after confirmation. Subscription management and cancellation remain in your App Store account."
    : "Apple purchase options are available only in the iOS app. Your Google Play account is not charged, and your server-confirmed membership still works on this device.";
  const lifecycle = profile ? deriveMobileMembershipLifecycle({ profile, purchaseStatus: purchases.status, appleMembership: purchases.membership }) : null;
  const renewalCopy = isFree
    ? "Free membership. No payment or renewal."
    : isFounder
      ? "Existing Founder access is lifetime access. No Apple purchase is offered."
      : Platform.OS === "ios"
        ? "Renews automatically unless canceled at least 24 hours before the current period ends."
        : "Renews automatically unless canceled before the next billing date.";

  async function buy() {
    if (!productId || !canPurchase) return;
    setError("");
    try {
      await purchases.purchase(productId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The purchase could not be completed.");
    }
  }

  async function restorePurchases() {
    if (!canRestore) return;
    setError("");
    try {
      await purchases.restore();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Previous purchases could not be restored.");
    }
  }

  async function manageSubscriptions() {
    if (subscriptionBusy) return;
    setSubscriptionBusy(true);
    setError("");
    try {
      await openAppleSubscriptionManagement(Linking.openURL);
    } catch {
      setError("App Store subscription settings could not be opened. Open the App Store, tap your profile, then Subscriptions.");
    } finally {
      setSubscriptionBusy(false);
    }
  }

  const purchaseButtonLabel = purchases.status === "purchasing"
    ? "Completing purchase…"
    : storeProduct
        ? `Continue with ${plan.name} · ${storeProduct.localizedPrice}`
        : productId
          ? `Choose ${plan.name}`
          : isFounder
            ? "Not sold through Apple"
            : action?.label || "Unavailable";
  const purchaseAccessibilityLabel = storeProduct
    ? `Purchase ${plan.name} for ${storeProduct.localizedPrice} per ${storeProduct.localizedPeriod}`
    : purchaseButtonLabel;
  const statusTitle = isCurrentOrIncluded
    ? action?.label
    : isFree
      ? "Free membership"
      : isFounder
        ? "Founder access is honored"
        : purchases.status === "ready"
          ? "Purchase through the App Store"
          : "Apple purchases are not available";
  const statusBody = isCurrentOrIncluded
    ? "Your authoritative server profile already includes this level of access."
    : isFree
      ? "Free membership is included with every Bourbon Signal account."
      : isFounder
        ? "Founder memberships are honored here but are not sold through Apple."
        : `${purchases.message} After the App Store completes a purchase or restore, Bourbon Signal reconciles it and refreshes your authoritative server profile before paid access appears.`;

  return <ScrollView contentContainerStyle={memberScreenStyles.content} style={memberScreenStyles.screen}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{plan.eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" style={styles.title}>{plan.name}</Text>
      <Text style={styles.description}>{plan.description}</Text>
    </View>

    {error ? <ErrorState message={error} onRetry={() => void purchases.refresh()} /> : !profile ? <View accessibilityLabel="Loading current membership" style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : null}

    {!plan.lifetime && !isFree ? <View accessibilityRole="tablist" style={styles.intervalControl}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "monthly" }} disabled={purchaseBusy} onPress={() => setInterval("monthly")} style={[styles.intervalOption, interval === "monthly" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "monthly" && styles.intervalTextSelected]}>Monthly</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "annual" }} disabled={purchaseBusy} onPress={() => setInterval("annual")} style={[styles.intervalOption, interval === "annual" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "annual" && styles.intervalTextSelected]}>Annual</Text></Pressable>
    </View> : null}

    {lifecycle ? <View style={styles.statusCard}>
      <Text accessibilityRole="header" style={styles.statusTitle}>{lifecycle.title}</Text>
      <Text style={styles.statusBody}>{lifecycle.detail}</Text>
      <Text style={styles.preservation}>{lifecycle.preservationNotice}</Text>
    </View> : null}

    <View style={styles.purchaseCard}>
      <View style={styles.priceRow}><Text style={styles.price}>{displayPrice}</Text><Text style={styles.priceSuffix}>{displayPeriod}</Text></View>
      {storeProduct && interval === "annual" ? <Text style={styles.trial}>Billed annually through the App Store</Text> : null}
      <Text style={styles.renewal}>{renewalCopy}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={purchaseAccessibilityLabel} accessibilityState={{ disabled: !canPurchase, busy: purchases.status === "purchasing" }} disabled={!canPurchase} onPress={() => void buy()} style={[styles.purchaseButton, !canPurchase && styles.disabledButton]}><Text style={styles.purchaseButtonText}>{purchaseButtonLabel}</Text></Pressable>
      {!isFree && !isFounder ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canRestore, busy: purchases.status === "restoring" }} disabled={!canRestore} onPress={() => void restorePurchases()} style={[styles.restoreButton, !canRestore && styles.restoreDisabled]}><Text style={styles.restoreText}>{purchases.status === "restoring" ? "Restoring…" : "Restore purchases"}</Text></Pressable> : null}
    </View>

    <View style={styles.featuresCard}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>What you get</Text>
      {plan.features.map((feature) => <View key={feature} style={styles.featureRow}><Text accessible={false} style={styles.check}>✓</Text><Text style={styles.feature}>{feature}</Text></View>)}
    </View>

    <View style={styles.statusCard}>
      <Text accessibilityRole="header" style={styles.statusTitle}>{statusTitle}</Text>
      <Text accessibilityRole={purchases.status === "error" || purchases.status === "pending" ? "alert" : undefined} style={styles.statusBody}>{statusBody}</Text>
      {purchases.status !== "ready" && !purchaseBusy && !isFree && !isFounder ? <Pressable accessibilityRole="button" onPress={() => void purchases.refresh()} style={styles.refreshButton}><Text style={styles.refreshText}>Refresh purchase status</Text></Pressable> : null}
    </View>

    <View style={styles.legalLinks}>
      {Platform.OS === "ios" ? <Pressable accessibilityRole="button" accessibilityState={{ busy: subscriptionBusy, disabled: subscriptionBusy }} disabled={subscriptionBusy} onPress={() => void manageSubscriptions()} style={styles.legalButton}><Text style={styles.legalText}>{subscriptionBusy ? "Opening…" : "Manage subscriptions in the App Store"}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/privacy")} style={styles.legalButton}><Text style={styles.legalText}>Privacy</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/terms")} style={styles.legalButton}><Text style={styles.legalText}>Terms of Service</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/support")} style={styles.legalButton}><Text style={styles.legalText}>Membership support</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/delete")} style={styles.legalButton}><Text style={styles.legalText}>Delete account</Text></Pressable>
    </View>
    {!isFree ? <Text style={styles.legalCopy}>{billingDisclosure}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  missing: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  missingTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  hero: { gap: 7, paddingTop: 3 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 33, lineHeight: 38, fontWeight: "900", letterSpacing: -0.6 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  loading: { minHeight: 76, alignItems: "center", justifyContent: "center" },
  intervalControl: { flexDirection: "row", borderRadius: 13, padding: 4, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  intervalOption: { minHeight: 44, flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  intervalSelected: { backgroundColor: colors.surfaceRaised, borderColor: "rgba(214,154,74,0.55)", borderWidth: 1 },
  intervalText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  intervalTextSelected: { color: colors.text },
  purchaseCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  price: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceSuffix: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  trial: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "900" },
  renewal: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  featuresCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 11 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginBottom: 2 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  check: { color: colors.success, fontSize: 15, lineHeight: 21, fontWeight: "900" },
  feature: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
  statusCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 11 },
  statusTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  statusBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  preservation: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  purchaseButton: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, paddingHorizontal: 14 },
  disabledButton: { opacity: 0.42 },
  purchaseButtonText: { color: colors.background, fontSize: 15, fontWeight: "900", textAlign: "center" },
  restoreButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  restoreDisabled: { opacity: 0.45 },
  restoreText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  refreshButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  refreshText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  legalLinks: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 12 },
  legalButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  legalText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  legalCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 8 },
  secondaryButton: { minHeight: 46, borderColor: colors.border, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});

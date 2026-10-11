import {membershipManagedOutsideStore} from "../../../../src/account/subscription-management";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSubscriptionManagement } from "../../../../src/hooks/useSubscriptionManagement";
import type { MemberProfile } from "../../../../src/api/types";
import { ErrorState, memberScreenStyles } from "../../../../src/components/MemberScreen";
import { useMobileApi } from "../../../../src/hooks/useMobileApi";
import {
  membershipActionFor,
  planForTier,
  type MembershipTier,
} from "../../../../src/membership/membership-plans";
import { deriveMobileMembershipLifecycle } from "../../../../src/membership/membership-lifecycle";
import { usePurchases } from "../../../../src/membership/PurchasesProvider";
import { productIdFor } from "../../../../src/membership/purchases";
import { colors, typeScale, fonts } from "../../../../src/theme";

export default function MembershipPlanScreen() {
  const api = useMobileApi();
  const management = useSubscriptionManagement();
  const managementOnly = membershipManagedOutsideStore(management.provider,Platform.OS);
  const billingProviderLabel = management.provider === "google" ? "Google Play" : management.provider === "apple" ? "Apple" : "Stripe";
  const storeName = Platform.OS === "android" ? "Google Play" : "App Store";
  const purchases = usePurchases();
  const refreshPurchases = purchases.refresh;
  useEffect(() => { void refreshPurchases(); }, [refreshPurchases]);
  const router = useRouter();
  const params = useLocalSearchParams<{ tier?: string; welcome?: string }>();
  const plan = planForTier(params.tier);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);

  const [error, setError] = useState("");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [showPurchaseStatus, setShowPurchaseStatus] = useState(false);


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
  const productId = productIdFor(plan.tier, "monthly");
  const storeProduct = managementOnly ? undefined : purchases.products.find((product) => product.productId === productId);
  const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, plan.tier) : null;

  const isCurrentOrIncluded = action?.kind === "current" || action?.kind === "included";
  const purchaseBusy = purchases.status === "purchasing" || purchases.status === "restoring" || purchases.status === "configuring";
  const canPurchase = Boolean(management.provider && management.provider !== "stripe") && Platform.OS !== "web" && action?.kind === "upgrade" && purchases.status === "ready" && Boolean(productId && storeProduct && purchases.eligibleProductIds.includes(productId));
  const canRestore = Platform.OS !== "web" && purchases.status === "ready" && purchases.restoreAvailable && !isFree && !isFounder;
  const loadingProducts = purchases.status === "configuring" || purchases.status === "signed_out";
  const displayPrice = managementOnly && !isFree && !isFounder ? `Managed through ${billingProviderLabel}` : isFree ? "$0" : isFounder ? "Lifetime access" : storeProduct?.localizedPrice || (loadingProducts ? "Loading price…" : "Monthly membership");
  const displayPeriod = storeProduct ? `/${storeProduct.localizedPeriod}` : "";
  const billingDisclosure = managementOnly ? `Your membership is billed through ${billingProviderLabel}. Manage your plan, payment details, or cancellation below.` : Platform.OS === "ios"
    ? "Billed to your Apple ID after confirmation. Manage or cancel in App Store subscriptions."
    : "Billed to your Google Play account after confirmation. Manage or cancel in Google Play subscriptions.";
  const lifecycle = profile ? deriveMobileMembershipLifecycle({ profile, purchaseStatus: purchases.status, appleMembership: purchases.membership, store: Platform.OS === "android" ? "google" : "apple" }) : null;
  const renewalCopy = isFree
    ? "Free membership. No payment or renewal."
    : isFounder
      ? "Existing Founder access is lifetime access. No additional purchase is needed."
      : Platform.OS === "ios"
        ? "Renews automatically unless canceled at least 24 hours before the current period ends."
        : "Renews automatically unless canceled before the next billing date.";

  async function buy() {
    if (managementOnly) { await management.manage(); return; }
    if (!management.provider) return;
    setShowPurchaseStatus(true);
    if (productId && !canPurchase && action?.kind === "upgrade" && !purchaseBusy) {
      await purchases.refresh();
      return;
    }
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
      await management.manage();
    } catch {
      setError("Subscription settings could not be opened. Please try again or contact support.");
    } finally {
      setSubscriptionBusy(false);
    }
  }

  const purchaseButtonLabel = purchases.status === "purchasing"
    ? "Completing purchase…"
    : isCurrentOrIncluded ? action?.label || "Included" : storeProduct && canPurchase
        ? `Continue with ${plan.name} · ${storeProduct.localizedPrice}`
        : productId
          ? "Check purchase options"
          : isFounder
            ? "Not sold in this app"
            : action?.label || "Unavailable";
  const purchaseAccessibilityLabel = storeProduct && canPurchase
    ? `Purchase ${plan.name} for ${storeProduct.localizedPrice} per ${storeProduct.localizedPeriod}`
    : purchaseButtonLabel;
  const statusBody = isCurrentOrIncluded
    ? "These benefits are already included with your membership."
    : isFree
      ? "Free membership is included with every Bourbon Signal account."
      : isFounder
        ? "Existing Founder memberships are honored here. No additional purchase is needed."
        : loadingProducts ? `Connecting to ${storeName}…`
          : purchases.status === "ready" ? `${storeName} will ask you to confirm before you’re charged.`
            : purchases.status === "pending" ? `${storeName} is still processing your purchase. Your current access is unchanged.`
              : purchases.status === "cancelled" ? "Purchase canceled. You haven’t been charged."
                : "We couldn’t load purchase options. Try again, or keep exploring with your current plan.";
  const canCheckOptions = Platform.OS !== "web" && action?.kind === "upgrade" && Boolean(productId) && !canPurchase && !purchaseBusy;

  return <ScrollView contentContainerStyle={memberScreenStyles.content} style={memberScreenStyles.screen}>
    <Stack.Screen options={{ title: plan.name, headerBackTitle: "Plans" }} />
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{plan.eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" style={styles.title}>{plan.name}</Text>
      <Text style={styles.description}>{plan.description}</Text>
    </View>

    {error ? <ErrorState message={error} onRetry={() => { void load(); void purchases.refresh(); }} /> : !profile ? <View accessibilityLabel="Loading current membership" style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : null}

    <View style={styles.featuresCard}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Your membership includes</Text>
      {plan.features.map((feature) => <View key={feature} style={styles.featureRow}><Text accessible={false} style={styles.check}>✓</Text><Text style={styles.feature}>{feature}</Text></View>)}
    </View>

    <View style={styles.purchaseCard}>
      <View style={styles.priceRow}><Text style={storeProduct || isFree ? styles.price : styles.statusBody}>{displayPrice}</Text><Text style={styles.priceSuffix}>{displayPeriod}</Text></View>
      <Text style={styles.renewal}>{renewalCopy}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={purchaseAccessibilityLabel} accessibilityState={{ disabled: !canPurchase && !canCheckOptions, busy: purchaseBusy }} disabled={!canPurchase && !canCheckOptions} onPress={() => void buy()} style={[styles.purchaseButton, !canPurchase && !canCheckOptions && styles.disabledButton]}><Text style={styles.purchaseButtonText}>{purchaseButtonLabel}</Text></Pressable>
      {!isFree && !isFounder ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canRestore, busy: purchases.status === "restoring" }} disabled={!canRestore} onPress={() => void restorePurchases()} style={[styles.restoreButton, !canRestore && styles.restoreDisabled]}><Text style={styles.restoreText}>{purchases.status === "restoring" ? "Restoring…" : "Restore purchases"}</Text></Pressable> : null}
      {(showPurchaseStatus && purchases.status !== "ready") || purchases.status === "pending" || purchases.status === "cancelled" || isCurrentOrIncluded ? <View style={styles.inlineStatus}>
        <Text accessibilityRole={purchases.status === "error" || purchases.status === "pending" ? "alert" : undefined} style={styles.statusBody}>{statusBody}</Text>
        {purchases.status !== "ready" && !purchaseBusy && !isFree && !isFounder ? <Pressable accessibilityRole="button" onPress={() => void purchases.refresh()} style={styles.refreshButton}><Text style={styles.refreshText}>Refresh purchase status</Text></Pressable> : null}
      </View> : null}
      <Text style={styles.legalCopy}>{billingDisclosure}</Text>
      {management.error ? <Text accessibilityRole="alert" style={styles.statusBody}>{management.error}</Text> : null}
    <View style={styles.legalLinks}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/terms")} style={styles.legalButton}><Text style={styles.legalText}>Terms of Service</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/privacy")} style={styles.legalButton}><Text style={styles.legalText}>Privacy</Text></Pressable>
      </View>
    </View>

    {params.welcome === "1" ? <Pressable accessibilityRole="button" onPress={() => router.replace("/(app)/setup")} style={styles.secondaryButton}><Text style={styles.secondaryText}>{profile?.membership.paid ? "Continue to Bourbon Signal" : "Continue with Free"}</Text></Pressable> : null}

    {lifecycle && !["free", "provider_unavailable", "active", "founder"].includes(lifecycle.state) ? <View style={styles.statusCard}>
      <Text accessibilityRole="header" style={styles.statusTitle}>{lifecycle.title}</Text>
      <Text style={styles.statusBody}>{lifecycle.detail}</Text>
      <Text style={styles.preservation}>{lifecycle.preservationNotice}</Text>
    </View> : null}

    {management.error ? <Text accessibilityRole="alert" style={styles.statusBody}>{management.error}</Text> : null}
    <View style={styles.legalLinks}>
      {management.provider && management.provider !== "none" ? <Pressable accessibilityRole="button" accessibilityState={{ busy: subscriptionBusy, disabled: subscriptionBusy }} disabled={subscriptionBusy} onPress={() => void manageSubscriptions()} style={styles.legalButton}><Text style={styles.legalText}>{subscriptionBusy ? "Opening…" : "Manage membership"}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/support")} style={styles.legalButton}><Text style={styles.legalText}>Membership support</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/delete")} style={styles.legalButton}><Text style={styles.legalText}>Delete account</Text></Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  inlineStatus: { gap: 4, paddingTop: 4 },
  missing: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  missingTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  hero: { gap: 7, paddingTop: 3 },
  eyebrow: { color: colors.accent, fontSize: typeScale.caption, fontWeight: "900", letterSpacing: 1.3 },
  title: {fontFamily: fonts.heading,  color: colors.text, fontSize: typeScale.title, lineHeight: 40, fontWeight: "700", letterSpacing: -0.6 },
  description: { color: colors.muted, fontSize: typeScale.input, lineHeight: 22 },
  loading: { minHeight: 76, alignItems: "center", justifyContent: "center" },

  purchaseCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  price: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceSuffix: { color: colors.muted, fontSize: typeScale.input, fontWeight: "700" },
  trial: { color: colors.accent, fontSize: typeScale.body, lineHeight: 20, fontWeight: "900" },
  renewal: { color: colors.muted, fontSize: typeScale.small, lineHeight: 18 },
  featuresCard: { paddingVertical: 4, paddingHorizontal: 2, gap: 10 },
  sectionTitle: { color: colors.text, fontSize: typeScale.subheading, fontWeight: "900", marginBottom: 2 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  check: { color: colors.success, fontSize: typeScale.input, lineHeight: 21, fontWeight: "900" },
  feature: { flex: 1, color: colors.text, fontSize: typeScale.body, lineHeight: 21 },
  statusCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 11 },
  statusTitle: { color: colors.text, fontSize: typeScale.subheading, lineHeight: 23, fontWeight: "900" },
  statusBody: { color: colors.muted, fontSize: typeScale.body, lineHeight: 21 },
  preservation: { color: colors.muted, fontSize: typeScale.small, lineHeight: 18 },
  purchaseButton: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, paddingHorizontal: 14 },
  disabledButton: { opacity: 0.42 },
  purchaseButtonText: { color: colors.background, fontSize: typeScale.input, fontWeight: "900", textAlign: "center" },
  restoreButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  restoreDisabled: { opacity: 0.45 },
  restoreText: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  refreshButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  refreshText: { color: colors.accent, fontSize: typeScale.body, fontWeight: "800" },
  legalLinks: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 12 },
  legalButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  legalText: { color: colors.accent, fontSize: typeScale.small, fontWeight: "800" },
  legalCopy: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 17, textAlign: "center", paddingHorizontal: 8 },
  secondaryButton: { minHeight: 46, borderColor: colors.border, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
});

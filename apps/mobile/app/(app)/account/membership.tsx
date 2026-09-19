import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { openAppleSubscriptionManagement } from "../../../src/account/subscription-management";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile } from "../../../src/api/types";
import { ErrorState, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import {
  MEMBERSHIP_PLANS,
  membershipActionFor,
  type BillingInterval,
  type MembershipTier,
} from "../../../src/membership/membership-plans";
import { usePurchases } from "../../../src/membership/PurchasesProvider";
import { deriveMobileMembershipLifecycle } from "../../../src/membership/membership-lifecycle";
import { productIdFor } from "../../../src/membership/purchases";
import { colors } from "../../../src/theme";

export default function MembershipScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const purchases = usePurchases();
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.getMemberProfile({ fresh });
      setProfile(response.profile);
    } catch (caught) {
      setProfile(null);

      setError(caught instanceof MobileApiError && caught.status === 401
        ? "Your session could not be verified. Return to Account and retry."
        : caught instanceof Error ? caught.message : "Membership details are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => {
    if (purchases.profile) setProfile(purchases.profile);
  }, [purchases.profile]);

  const currentTier = profile ? profile.membership.tier as MembershipTier : null;
  const lifecycle = profile ? deriveMobileMembershipLifecycle({ profile, purchaseStatus: purchases.status, appleMembership: purchases.membership }) : null;

  async function manageSubscriptions() {
    if (subscriptionBusy) return;
    setSubscriptionBusy(true);
    setSubscriptionError("");
    try {
      await openAppleSubscriptionManagement(Linking.openURL);
    } catch {
      setSubscriptionError("App Store subscription settings could not be opened. Open the App Store, tap your profile, then Subscriptions.");
    } finally {
      setSubscriptionBusy(false);
    }
  }

  return <ScrollView
    contentContainerStyle={memberScreenStyles.content}
    refreshControl={<RefreshControl refreshing={loading && Boolean(profile)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>YOUR MEMBERSHIP</Text>
      <Text accessibilityRole="header" style={styles.title}>Choose the signal depth you need.</Text>
      <Text style={styles.description}>Compare every Bourbon Signal membership without leaving the app.</Text>
      {profile ? <View style={styles.currentBadge}><Text style={styles.currentBadgeLabel}>CURRENT</Text><Text style={styles.currentBadgeValue}>{MEMBERSHIP_PLANS.find((plan) => plan.tier === profile.membership.tier)?.name || "Membership"}</Text></View> : null}
    </View>

    {loading && !profile ? <View accessibilityLabel="Loading membership" style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : null}
    {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}

    {lifecycle ? <View style={styles.lifecycleCard}>
      <Text style={styles.lifecycleEyebrow}>ACCOUNT STATUS</Text>
      <Text accessibilityRole="header" style={styles.lifecycleTitle}>{lifecycle.title}</Text>
      <Text style={styles.lifecycleDetail}>{lifecycle.detail}</Text>
      <Text style={styles.preservation}>{lifecycle.preservationNotice}</Text>
      {Platform.OS === "ios" ? <Pressable accessibilityRole="button" accessibilityState={{ busy: subscriptionBusy, disabled: subscriptionBusy }} disabled={subscriptionBusy} onPress={() => void manageSubscriptions()} style={styles.manageButton}><Text style={styles.manageText}>{subscriptionBusy ? "Opening…" : "Manage subscriptions in the App Store"}</Text></Pressable> : null}
      {subscriptionError ? <Text accessibilityRole="alert" style={styles.subscriptionError}>{subscriptionError}</Text> : null}
    </View> : null}

    <View accessibilityRole="tablist" style={styles.intervalControl}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "monthly" }} onPress={() => setInterval("monthly")} style={[styles.intervalOption, interval === "monthly" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "monthly" && styles.intervalTextSelected]}>Monthly</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "annual" }} onPress={() => setInterval("annual")} style={[styles.intervalOption, interval === "annual" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "annual" && styles.intervalTextSelected]}>Annual</Text></Pressable>
    </View>

    <View style={styles.planList}>
      {MEMBERSHIP_PLANS.map((plan) => {
        const productId = productIdFor(plan.tier, interval === "annual" ? "annual" : "monthly");
        const storeProduct = purchases.products.find((product) => product.productId === productId);
        const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, plan.tier) : { kind: "unknown" as const, label: "Review plan" };

        const displayPrice = plan.tier === "free" ? "$0" : plan.tier === "bottled-in-bond" ? "Existing access" : storeProduct?.localizedPrice || "Price unavailable";
        const displayPeriod = plan.tier === "free" ? " forever" : plan.tier === "bottled-in-bond" ? "" : storeProduct ? `/${storeProduct.localizedPeriod}` : "";
        return <View key={plan.tier} style={[styles.planCard, plan.recommended && styles.recommendedCard, currentTier === plan.tier && styles.currentCard]}>
          <View style={styles.planTopRow}>
            <View style={styles.planHeading}>
              <Text style={styles.planEyebrow}>{plan.eyebrow.toUpperCase()}</Text>
              <Text accessibilityRole="header" style={styles.planName}>{plan.name}</Text>
            </View>
            {plan.recommended ? <View style={styles.recommendedBadge}><Text style={styles.recommendedText}>RECOMMENDED</Text></View> : null}
            {currentTier === plan.tier ? <View style={styles.activeBadge}><Text style={styles.activeText}>CURRENT</Text></View> : null}
          </View>
          <Text style={styles.planDescription}>{plan.description}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{displayPrice}</Text>
            <Text style={styles.priceSuffix}>{displayPeriod}</Text>
          </View>
          {interval === "annual" && storeProduct ? <Text style={styles.priceNote}>Annual billing through the App Store</Text> : null}
          <View style={styles.featureList}>
            {plan.features.slice(0, 3).map((feature) => <View key={feature} style={styles.featureRow}><Text accessible={false} style={styles.check}>✓</Text><Text style={styles.feature}>{feature}</Text></View>)}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => router.push({ pathname: "/(app)/account/membership/[tier]", params: { tier: plan.tier, interval } })}
            style={({ pressed }) => [styles.reviewButton, plan.recommended && styles.reviewButtonPrimary, pressed && styles.pressed]}
          ><Text style={[styles.reviewText, plan.recommended && styles.reviewTextPrimary]}>{action.label}</Text><Text accessible={false} style={[styles.arrow, plan.recommended && styles.reviewTextPrimary]}>›</Text></Pressable>
        </View>;
      })}
    </View>

    <Text style={styles.footnote}>Subscriptions use the localized price shown by the App Store. Founder memberships are honored here but are not sold through Apple.</Text>
    {purchases.status === "unavailable" ? <Text accessibilityRole="alert" style={styles.purchaseStatus}>{purchases.message}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  hero: { gap: 8, paddingTop: 3 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.35 },
  title: { color: colors.text, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.55 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  currentBadge: { marginTop: 6, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  currentBadgeLabel: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  currentBadgeValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
  loading: { minHeight: 90, alignItems: "center", justifyContent: "center" },
  lifecycleCard: { borderRadius: 18, backgroundColor: colors.surfaceRaised, padding: 17, gap: 8 },
  lifecycleEyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  lifecycleTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "900" },
  lifecycleDetail: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  preservation: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  manageButton: { minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 11, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 12 },
  manageText: { color: colors.accent, fontSize: 13, fontWeight: "800", textAlign: "center" },
  subscriptionError: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  intervalControl: { flexDirection: "row", borderRadius: 13, padding: 4, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  intervalOption: { minHeight: 44, flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  intervalSelected: { backgroundColor: colors.surfaceRaised, borderColor: "rgba(214,154,74,0.55)", borderWidth: 1 },
  intervalText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  intervalTextSelected: { color: colors.text },
  planList: { gap: 13 },
  planCard: { borderRadius: 18, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, padding: 17, gap: 12 },
  recommendedCard: { borderColor: colors.accent, backgroundColor: "#1B1611" },
  currentCard: { borderColor: colors.success },
  planTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  planHeading: { flex: 1, gap: 3 },
  planEyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  planName: { color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  recommendedBadge: { borderRadius: 999, backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 5 },
  recommendedText: { color: colors.background, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 },
  activeBadge: { borderRadius: 999, backgroundColor: "rgba(126,173,131,0.18)", paddingHorizontal: 8, paddingVertical: 5 },
  activeText: { color: colors.success, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 },
  planDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  priceRow: { flexDirection: "row", alignItems: "baseline" },
  price: { color: colors.text, fontSize: 31, lineHeight: 35, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceSuffix: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  priceNote: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  featureList: { gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  check: { color: colors.success, fontSize: 14, lineHeight: 20, fontWeight: "900" },
  feature: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 20 },
  reviewButton: { minHeight: 48, borderRadius: 12, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  reviewText: { color: colors.text, fontSize: 14, fontWeight: "900" },
  reviewTextPrimary: { color: colors.background },
  arrow: { color: colors.accent, fontSize: 24, lineHeight: 26 },
  pressed: { opacity: 0.72 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 10 },
  purchaseStatus: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 10 },
});

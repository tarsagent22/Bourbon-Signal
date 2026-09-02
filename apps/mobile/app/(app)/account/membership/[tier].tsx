import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MemberProfile, MembershipTrialEligibility } from "../../../../src/api/types";
import { ErrorState, memberScreenStyles } from "../../../../src/components/MemberScreen";
import { useMobileApi } from "../../../../src/hooks/useMobileApi";
import {
  billingChoiceFor,
  membershipActionFor,
  planForTier,
  type BillingInterval,
  type MembershipTier,
} from "../../../../src/membership/membership-plans";
import { colors } from "../../../../src/theme";

export default function MembershipPlanScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const params = useLocalSearchParams<{ tier?: string; interval?: string }>();
  const plan = planForTier(params.tier);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [trialEligibility, setTrialEligibility] = useState<MembershipTrialEligibility | null>(null);
  const [error, setError] = useState("");
  const requestedInterval: BillingInterval = params.interval === "annual" ? "annual" : "monthly";
  const [interval, setInterval] = useState<BillingInterval>(plan?.lifetime ? "lifetime" : requestedInterval);

  const load = useCallback(async () => {
    try {
      setError("");
      const [response, eligibility] = await Promise.all([
        api.getMemberProfile({ fresh: true }),
        api.getMembershipTrialEligibility({ fresh: true }).catch(() => null),
      ]);
      setProfile(response.profile);
      setTrialEligibility(eligibility);
    } catch (caught) {
      setProfile(null);
      setTrialEligibility(null);
      setError(caught instanceof Error ? caught.message : "Membership details are temporarily unavailable.");
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (!plan) return <View style={styles.missing}><Text style={styles.missingTitle}>Membership not found</Text><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Back to memberships</Text></Pressable></View>;

  const price = billingChoiceFor(plan.tier, interval);
  const isFree = plan.tier === "free";
  const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, plan.tier) : null;
  const hasTrial = Boolean(price?.trialDays && (plan.tier === "standard" ? trialEligibility?.standardMonthly.eligible : plan.tier === "barrel" ? trialEligibility?.barrelMonthly.eligible : false));
  const isCurrentOrIncluded = action?.kind === "current" || action?.kind === "included";
  const billingDisclosure = Platform.OS === "ios"
    ? "Payment will be charged to your Apple ID when purchasing is enabled. Subscription management and cancellation will be available through your App Store account."
    : "Payment will be charged to your Google Play account when purchasing is enabled. Subscription management and cancellation will be available through Google Play.";
  const renewalCopy = isFree
    ? "Free membership. No payment or renewal."
    : price?.interval === "lifetime"
      ? "One payment. No recurring renewal."
      : Platform.OS === "ios"
        ? "Renews automatically unless canceled at least 24 hours before the current period ends."
        : "Renews automatically unless canceled before the next billing date.";

  return <ScrollView contentContainerStyle={memberScreenStyles.content} style={memberScreenStyles.screen}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{plan.eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" style={styles.title}>{plan.name}</Text>
      <Text style={styles.description}>{plan.description}</Text>
    </View>

    {error ? <ErrorState message={error} onRetry={() => void load()} /> : !profile ? <View accessibilityLabel="Loading current membership" style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : null}

    {!plan.lifetime && !isFree ? <View accessibilityRole="tablist" style={styles.intervalControl}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "monthly" }} onPress={() => setInterval("monthly")} style={[styles.intervalOption, interval === "monthly" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "monthly" && styles.intervalTextSelected]}>Monthly</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "annual" }} onPress={() => setInterval("annual")} style={[styles.intervalOption, interval === "annual" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "annual" && styles.intervalTextSelected]}>Annual · 2 months free</Text></Pressable>
    </View> : null}

    <View style={styles.purchaseCard}>
      <View style={styles.priceRow}><Text style={styles.price}>{isFree ? "$0" : price?.price}</Text><Text style={styles.priceSuffix}>{price?.suffix}</Text></View>
      {hasTrial ? <Text style={styles.trial}>7-day free trial · then {price?.price}{price?.suffix}</Text> : price?.valueNote ? <Text style={styles.trial}>{price.valueNote}</Text> : null}
      <Text style={styles.renewal}>{renewalCopy}</Text>
    </View>

    <View style={styles.featuresCard}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>What you get</Text>
      {plan.features.map((feature) => <View key={feature} style={styles.featureRow}><Text accessible={false} style={styles.check}>✓</Text><Text style={styles.feature}>{feature}</Text></View>)}
    </View>

    <View style={styles.statusCard}>
      <Text accessibilityRole="header" style={styles.statusTitle}>{isCurrentOrIncluded ? action?.label : isFree ? "Free membership" : "In-app purchasing is next"}</Text>
      <Text style={styles.statusBody}>{isCurrentOrIncluded
        ? "Your account already has this level of access."
        : isFree
          ? "Free membership is included with every Bourbon Signal account."
          : "In-app purchases are not available in this build yet. This screen is ready for native billing and receipt integration; it will never send you to an external checkout."}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.disabledButton}><Text style={styles.disabledButtonText}>{isCurrentOrIncluded ? action?.label : isFree ? "Included with your account" : hasTrial ? "Start 7-day free trial" : `Choose ${plan.name}`}</Text></Pressable>
      {!isFree ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.restoreButton}><Text style={styles.restoreText}>Restore purchases</Text></Pressable> : null}
    </View>

    <View style={styles.legalLinks}>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/privacy")} style={styles.legalButton}><Text style={styles.legalText}>Privacy</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/terms")} style={styles.legalButton}><Text style={styles.legalText}>Terms of Service</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/support")} style={styles.legalButton}><Text style={styles.legalText}>Membership support</Text></Pressable>
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
  priceRow: { flexDirection: "row", alignItems: "baseline" },
  price: { color: colors.text, fontSize: 38, lineHeight: 42, fontWeight: "900", fontVariant: ["tabular-nums"] },
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
  disabledButton: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, opacity: 0.42, paddingHorizontal: 14 },
  disabledButtonText: { color: colors.background, fontSize: 15, fontWeight: "900", textAlign: "center" },
  restoreButton: { minHeight: 44, alignItems: "center", justifyContent: "center", opacity: 0.45 },
  restoreText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  legalLinks: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 12 },
  legalButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  legalText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  legalCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 8 },
  secondaryButton: { minHeight: 46, borderColor: colors.border, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});

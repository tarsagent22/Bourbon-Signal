import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, MembershipTrialEligibility } from "../../../src/api/types";
import { ErrorState, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import {
  MEMBERSHIP_COMPARISON_ROWS,
  PAID_MEMBERSHIP_PLANS,
  billingChoiceFor,
  membershipActionFor,
  type BillingInterval,
  type MembershipTier,
} from "../../../src/membership/membership-plans";
import { colors } from "../../../src/theme";

export default function MembershipScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [trialEligibility, setTrialEligibility] = useState<MembershipTrialEligibility | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const [response, eligibility] = await Promise.all([
        api.getMemberProfile({ fresh }),
        api.getMembershipTrialEligibility({ fresh }).catch(() => null),
      ]);
      setProfile(response.profile);
      setTrialEligibility(eligibility);
    } catch (caught) {
      setProfile(null);
      setTrialEligibility(null);
      setError(caught instanceof MobileApiError && caught.status === 401
        ? "Your session could not be verified. Return to Account and retry."
        : caught instanceof Error ? caught.message : "Membership details are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(false); }, [load]);

  const currentTier = profile ? profile.membership.tier as MembershipTier : null;

  return <ScrollView
    contentContainerStyle={memberScreenStyles.content}
    refreshControl={<RefreshControl refreshing={loading && Boolean(profile)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>YOUR MEMBERSHIP</Text>
      <Text accessibilityRole="header" style={styles.title}>Choose the signal depth you need.</Text>
      <Text style={styles.description}>Compare every Bourbon Signal membership without leaving the app.</Text>
      {profile ? <View style={styles.currentBadge}><Text style={styles.currentBadgeLabel}>CURRENT</Text><Text style={styles.currentBadgeValue}>{profile.membership.label}</Text></View> : null}
    </View>

    {loading && !profile ? <View accessibilityLabel="Loading membership" style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : null}
    {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}

    <View accessibilityRole="tablist" style={styles.intervalControl}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "monthly" }} onPress={() => setInterval("monthly")} style={[styles.intervalOption, interval === "monthly" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "monthly" && styles.intervalTextSelected]}>Monthly</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "annual" }} onPress={() => setInterval("annual")} style={[styles.intervalOption, interval === "annual" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "annual" && styles.intervalTextSelected]}>Annual · 2 months free</Text></Pressable>
    </View>

    <View style={styles.planList}>
      {PAID_MEMBERSHIP_PLANS.map((plan) => {
        const price = billingChoiceFor(plan.tier, interval);
        const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, plan.tier) : { kind: "unknown" as const, label: "Review plan" };
        const trialEligible = Boolean(price?.trialDays && (plan.tier === "standard" ? trialEligibility?.standardMonthly.eligible : plan.tier === "barrel" ? trialEligibility?.barrelMonthly.eligible : false));
        return <View key={plan.tier} style={[styles.planCard, plan.recommended && styles.recommendedCard, currentTier === plan.tier && styles.currentCard]}>
          <View style={styles.planTopRow}>
            <View style={styles.planHeading}>
              <Text style={styles.planEyebrow}>{plan.eyebrow.toUpperCase()}</Text>
              <Text accessibilityRole="header" style={styles.planName}>{plan.name}</Text>
            </View>
            {plan.recommended ? <View style={styles.recommendedBadge}><Text style={styles.recommendedText}>RECOMMENDED</Text></View> : null}
            {currentTier === plan.tier ? <View style={styles.activeBadge}><Text style={styles.activeText}>CURRENT</Text></View> : null}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{price?.price}</Text>
            <Text style={styles.priceSuffix}>{price?.suffix}</Text>
          </View>
          {trialEligible ? <Text style={styles.priceNote}>{price?.trialDays}-day free trial · {price?.price}{price?.suffix} after</Text> : price?.valueNote ? <Text style={styles.priceNote}>{price.valueNote}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => router.push({ pathname: "/(app)/account/membership/[tier]", params: { tier: plan.tier, interval } })}
            style={({ pressed }) => [styles.reviewButton, plan.recommended && styles.reviewButtonPrimary, pressed && styles.pressed]}
          ><Text style={[styles.reviewText, plan.recommended && styles.reviewTextPrimary]}>{action.label}</Text><Text accessible={false} style={[styles.arrow, plan.recommended && styles.reviewTextPrimary]}>›</Text></Pressable>
        </View>;
      })}
    </View>

    <View style={styles.comparisonSection}>
      <View style={styles.comparisonHeading}>
        <Text accessibilityRole="header" style={styles.comparisonTitle}>Compare features</Text>
        <Text style={styles.comparisonHint}>Free is shown as a baseline, without another pricing card.</Text>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.comparisonTable} showsHorizontalScrollIndicator>
        <View>
          <View style={[styles.comparisonRow, styles.comparisonHeaderRow]}>
            <Text style={[styles.comparisonCell, styles.featureCell, styles.comparisonHeaderText]}>FEATURE</Text>
            <Text style={[styles.comparisonCell, styles.tierCell, styles.comparisonHeaderText]}>FREE</Text>
            <Text style={[styles.comparisonCell, styles.tierCell, styles.comparisonHeaderText]}>STANDARD</Text>
            <Text style={[styles.comparisonCell, styles.tierCell, styles.comparisonHeaderText]}>BARREL</Text>
            <Text style={[styles.comparisonCell, styles.tierCell, styles.comparisonHeaderText]}>FOUNDER</Text>
          </View>
          {MEMBERSHIP_COMPARISON_ROWS.map((row) => <View
            accessible
            accessibilityLabel={`${row.feature}. Free: ${row.values.free}. Standard: ${row.values.standard}. Barrel: ${row.values.barrel}. Founder: ${row.values["bottled-in-bond"]}.`}
            key={row.feature}
            style={styles.comparisonRow}
          >
            <Text accessible={false} style={[styles.comparisonCell, styles.featureCell, styles.featureText]}>{row.feature}</Text>
            <Text accessible={false} style={[styles.comparisonCell, styles.tierCell, styles.valueText]}>{row.values.free}</Text>
            <Text accessible={false} style={[styles.comparisonCell, styles.tierCell, styles.valueText]}>{row.values.standard}</Text>
            <Text accessible={false} style={[styles.comparisonCell, styles.tierCell, styles.valueText]}>{row.values.barrel}</Text>
            <Text accessible={false} style={[styles.comparisonCell, styles.tierCell, styles.valueText]}>{row.values["bottled-in-bond"]}</Text>
          </View>)}
        </View>
      </ScrollView>
    </View>

    <Text style={styles.footnote}>Monthly Standard Proof and Barrel Proof include one eligible 7-day trial. Annual and lifetime memberships do not include a trial.</Text>
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
  priceRow: { flexDirection: "row", alignItems: "baseline" },
  price: { color: colors.text, fontSize: 31, lineHeight: 35, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceSuffix: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  priceNote: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  reviewButton: { minHeight: 48, borderRadius: 12, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  reviewText: { color: colors.text, fontSize: 14, fontWeight: "900" },
  reviewTextPrimary: { color: colors.background },
  arrow: { color: colors.accent, fontSize: 24, lineHeight: 26 },
  comparisonSection: { borderColor: colors.border, borderWidth: 1, borderRadius: 18, backgroundColor: colors.surface, overflow: "hidden" },
  comparisonHeading: { gap: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  comparisonTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  comparisonHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  comparisonTable: { paddingBottom: 8 },
  comparisonRow: { minHeight: 58, flexDirection: "row", alignItems: "stretch", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  comparisonHeaderRow: { minHeight: 40, backgroundColor: colors.surfaceRaised },
  comparisonCell: { paddingHorizontal: 9, paddingVertical: 10, textAlignVertical: "center" },
  featureCell: { width: 142 },
  tierCell: { width: 98, textAlign: "center" },
  comparisonHeaderText: { color: colors.accent, fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 0.7 },
  featureText: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  valueText: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 10 },
});

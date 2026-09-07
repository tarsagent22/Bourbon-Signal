import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, MembershipTrialEligibility } from "../../../src/api/types";
import { ErrorState, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { MembershipPlanChooser } from "../../../src/membership/MembershipPlanChooser";
import { type BillingInterval, type MembershipTier } from "../../../src/membership/membership-plans";
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
      <Text accessibilityRole="header" style={styles.title}>Pick your hunting plan.</Text>
      <Text style={styles.description}>Focused alerts, unlimited range, or Founder for life.</Text>
      {profile ? <View style={styles.currentBadge}><Text style={styles.currentBadgeLabel}>CURRENT</Text><Text style={styles.currentBadgeValue}>{profile.membership.label}</Text></View> : null}
    </View>

    {loading && !profile ? <View accessibilityLabel="Loading membership" style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : null}
    {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}

    <View accessibilityRole="tablist" style={styles.intervalControl}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "monthly" }} onPress={() => setInterval("monthly")} style={[styles.intervalOption, interval === "monthly" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "monthly" && styles.intervalTextSelected]}>Monthly</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: interval === "annual" }} onPress={() => setInterval("annual")} style={[styles.intervalOption, interval === "annual" && styles.intervalSelected]}><Text style={[styles.intervalText, interval === "annual" && styles.intervalTextSelected]}>Annual · 2 months free</Text></Pressable>
    </View>

    <MembershipPlanChooser
      barrelTrialEligible={Boolean(trialEligibility?.barrelMonthly.eligible)}
      currentTier={currentTier}
      interval={interval}
      onSelect={(tier) => router.push({ pathname: "/(app)/account/membership/[tier]", params: { tier, interval } })}
      standardTrialEligible={Boolean(trialEligibility?.standardMonthly.eligible)}
    />
  </ScrollView>;
}

const styles = StyleSheet.create({
  hero: { gap: 4, paddingTop: 3 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.35 },
  title: { color: colors.text, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.5 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  currentBadge: { marginTop: 4, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  currentBadgeLabel: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  currentBadgeValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
  loading: { minHeight: 72, alignItems: "center", justifyContent: "center" },
  intervalControl: { flexDirection: "row", borderRadius: 13, padding: 4, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  intervalOption: { minHeight: 44, flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  intervalSelected: { backgroundColor: colors.surfaceRaised, borderColor: "rgba(214,154,74,0.55)", borderWidth: 1 },
  intervalText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  intervalTextSelected: { color: colors.text },
});

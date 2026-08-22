import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, SignalPointsSummary } from "../../../src/api/types";
import { DataRow, ErrorState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

const WEB = "https://www.bourbonsignal.com";
const ACCOUNT_DELETION_URL = "mailto:support@bourbonsignal.com?subject=Bourbon%20Signal%20account%20deletion%20request&body=Please%20delete%20my%20Bourbon%20Signal%20account.%20I%20am%20sending%20this%20request%20from%20the%20email%20address%20associated%20with%20my%20account.";

export default function HqScreen() {
  const api = useMobileApi();
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [points, setPoints] = useState<SignalPointsSummary | null>(null);
  const [profileError, setProfileError] = useState("");
  const [pointsError, setPointsError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setProfileError("");
    setPointsError("");
    const [profileResult, pointsResult] = await Promise.allSettled([api.getMemberProfile(), api.getSignalPoints()]);
    if (profileResult.status === "fulfilled") setProfile(profileResult.value.profile);
    else if (profileResult.reason instanceof MobileApiError && profileResult.reason.status === 401) await signOut();
    else setProfileError(profileResult.reason instanceof Error ? profileResult.reason.message : "Membership details are temporarily unavailable.");
    if (pointsResult.status === "fulfilled") setPoints(pointsResult.value);
    else if (pointsResult.reason instanceof MobileApiError && pointsResult.reason.status === 401) await signOut();
    else setPointsError(pointsResult.reason instanceof Error ? pointsResult.reason.message : "Signal Points are temporarily unavailable.");
    setLoading(false);
  }, [api, signOut]);

  useEffect(() => { void load(); }, [load]);

  async function openExternal(url: string) {
    setLinkError("");
    try { await Linking.openURL(url); }
    catch { setLinkError("That link could not be opened. Contact support@bourbonsignal.com."); }
  }

  const inStockRewardCount = points?.catalog.filter((reward) => reward.inventoryRemaining !== 0).length || 0;

  return (
    <ScrollView
      contentContainerStyle={memberScreenStyles.content}
      refreshControl={<RefreshControl refreshing={loading && Boolean(profile)} onRefresh={load} tintColor={colors.accent} />}
      style={memberScreenStyles.screen}
    >
      <ScreenIntro eyebrow="Member headquarters" title="HQ" description="Identity, Signal Points, rewards, membership, and account controls. Your Radar and Cellar stay in their own destinations." />
      {loading && !profile ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading your member account…</Text></View> : null}
      {profileError ? <ErrorState message={profileError} onRetry={load} /> : null}
      {profile ? <View style={memberScreenStyles.section}>
        <SectionTitle>Membership</SectionTitle>
        <MemberCard accent>
          <Text style={styles.identity}>{profile.identity?.label || "Bourbon Signal Member"}</Text>
          <DataRow label="Plan" value={profile.membership.label} />
          <DataRow label="Signal feed" value={profile.entitlements.fullFeed ? "Full access" : "Preview access"} />
          <DataRow label="Posting" value={profile.entitlements.canSubmitSignals ? "Available" : "Unavailable"} last />
        </MemberCard>
      </View> : null}

      <View style={memberScreenStyles.section}>
        <SectionTitle>Signal Points</SectionTitle>
        {points ? <>
          <MemberCard>
            <View style={styles.pointsHero}><Text style={styles.pointsValue}>{points.balance}</Text><Text style={styles.pointsLabel}>AVAILABLE POINTS</Text></View>
            {points.debt > 0 ? <Text style={styles.warning}>{points.debt} points pending reconciliation</Text> : null}
          </MemberCard>
          <SectionTitle detail={points.redemptionEligible ? `${inStockRewardCount} in stock` : "View only"}>Rewards</SectionTitle>
          {points.catalog.map((reward) => (
            <MemberCard key={reward.key}>
              <View style={styles.rewardRow}><View style={styles.rewardCopy}><Text style={styles.rewardName}>{reward.name}</Text><Text style={styles.muted}>{reward.inventoryRemaining === 0 ? "Sold out" : !points.redemptionEligible ? "Membership required to redeem" : points.balance >= reward.points ? "Enough points to redeem" : `${reward.points - points.balance} more points needed`}</Text></View><Text style={styles.rewardPoints}>{reward.points} pts</Text></View>
            </MemberCard>
          ))}
        </> : pointsError ? <ErrorState message={pointsError} onRetry={load} /> : null}
      </View>

      <View style={memberScreenStyles.section}>
        <SectionTitle>Account</SectionTitle>
        <View style={styles.links}>
          <LinkRow label="Support" onPress={() => openExternal(`${WEB}/support`)} />
          <LinkRow label="Privacy policy" onPress={() => openExternal(`${WEB}/legal/privacy`)} />
          <LinkRow danger label="Request account deletion" onPress={() => openExternal(ACCOUNT_DELETION_URL)} />
        </View>
        {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><Text style={styles.signOutText}>Sign out</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function LinkRow({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}><Text style={[styles.linkText, danger && styles.danger]}>{label}</Text><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  loading: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  identity: { color: colors.text, fontSize: 22, fontWeight: "800" },
  pointsHero: { alignItems: "center", paddingVertical: 12, gap: 3 },
  pointsValue: { color: colors.accent, fontSize: 46, lineHeight: 50, fontWeight: "800" },
  pointsLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  warning: { color: colors.danger, textAlign: "center", fontSize: 12 },
  rewardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  rewardCopy: { flex: 1, gap: 3 },
  rewardName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rewardPoints: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  links: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  linkRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  linkText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  danger: { color: colors.danger },
  chevron: { color: colors.muted, fontSize: 24 },
  signOut: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center" },
  signOutText: { color: colors.text, fontWeight: "700" },
  pressed: { backgroundColor: colors.surfaceRaised },
  error: { color: colors.danger, fontSize: 13 },
});

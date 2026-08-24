import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, SignalPointsSummary, SignalRewardItem } from "../../../src/api/types";
import { DataRow, ErrorState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { rewardAvailability } from "../../../src/interactions/member-interactions";
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
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameSuccess, setDisplayNameSuccess] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setProfileError(""); setPointsError("");
    const [profileResult, pointsResult] = await Promise.allSettled([api.getMemberProfile({ fresh }), api.getSignalPoints({ fresh })]);
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value.profile);
      setDisplayNameDraft(profileResult.value.profile.customDisplayName || "");
    }
    else setProfileError(profileResult.reason instanceof MobileApiError && profileResult.reason.status === 401 ? "Your session could not be verified. Return to Signals and retry." : profileResult.reason instanceof Error ? profileResult.reason.message : "Membership details are temporarily unavailable.");
    if (pointsResult.status === "fulfilled") setPoints(pointsResult.value);
    else setPointsError(pointsResult.reason instanceof MobileApiError && pointsResult.reason.status === 401 ? "Your session could not be verified. Return to Signals and retry." : pointsResult.reason instanceof Error ? pointsResult.reason.message : "Signal Points are temporarily unavailable.");
    setLoading(false);
  }, [api]);

  useEffect(() => { void load(false); }, [load]);

  async function openExternal(url: string) {
    setLinkError("");
    try { await Linking.openURL(url); }
    catch { setLinkError("That link could not be opened. Contact support@bourbonsignal.com."); }
  }

  async function saveDisplayName(displayName: string | null) {
    setSavingDisplayName(true);
    setDisplayNameError("");
    setDisplayNameSuccess("");
    try {
      const next = await api.updateMemberProfile({ displayName });
      setProfile(next.profile);
      setDisplayNameDraft(next.profile.customDisplayName || "");
      setDisplayNameSuccess(displayName === null ? "Community name reset to your member identity." : "Community name saved.");
    } catch (caught) {
      setDisplayNameError(caught instanceof Error ? caught.message : "Community name could not be saved.");
    } finally {
      setSavingDisplayName(false);
    }
  }

  const availableRewardCount = points?.catalog.filter((reward) => reward.inventoryRemaining !== 0).length || 0;
  const updateLabel = Updates.updateId ? Updates.updateId.slice(0, 8) : "embedded";
  const runtimeLabel = String(Updates.runtimeVersion || "unknown");
  const versionLabel = Constants.nativeAppVersion || Constants.expoConfig?.version || "unknown";
  const buildLabel = Constants.nativeBuildVersion || "unknown";

  return <ScrollView contentContainerStyle={memberScreenStyles.content} refreshControl={<RefreshControl refreshing={loading && Boolean(profile)} onRefresh={() => void load(true)} tintColor={colors.accent} />} style={memberScreenStyles.screen}>
    <ScreenIntro eyebrow="Member headquarters" title="HQ" description="Membership, Signal Points, rewards, and account controls." />
    {loading && !profile ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading your member account…</Text></View> : null}
    {profileError ? <ErrorState message={profileError} onRetry={() => void load(true)} /> : null}
    {profile ? <View style={memberScreenStyles.section}><SectionTitle>Membership</SectionTitle><MemberCard accent><Text style={styles.identity}>{profile.identity?.label || "Bourbon Signal Member"}</Text><DataRow label="Plan" value={profile.membership.label} /><DataRow label="Signal feed" value={profile.entitlements.fullFeed ? "Full access" : "Preview access"} /><DataRow label="Posting" value={profile.entitlements.canSubmitSignals ? "Available" : "Unavailable"} last /></MemberCard></View> : null}

    {profile ? <View style={memberScreenStyles.section}>
      <SectionTitle>Community name</SectionTitle>
      <MemberCard>
        <Text style={styles.communityName}>{profile.displayName}</Text>
        <Text style={styles.muted}>Shown as “Reported by {profile.displayName}” on your Community sightings. Your numbered member identity stays unchanged.</Text>
        <TextInput
          accessibilityLabel="Community display name"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!savingDisplayName}
          maxLength={32}
          onChangeText={(value) => { setDisplayNameDraft(value); setDisplayNameError(""); setDisplayNameSuccess(""); }}
          placeholder="Choose a public Community name"
          placeholderTextColor={colors.muted}
          style={styles.displayNameInput}
          value={displayNameDraft}
        />
        {displayNameError ? <Text accessibilityRole="alert" style={styles.error}>{displayNameError}</Text> : null}
        {displayNameSuccess ? <Text accessibilityRole="alert" style={styles.success}>{displayNameSuccess}</Text> : null}
        <View style={styles.displayNameActions}>
          {profile.customDisplayName ? <Pressable accessibilityRole="button" disabled={savingDisplayName} onPress={() => void saveDisplayName(null)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Use {profile.identity?.label || "member identity"}</Text></Pressable> : null}
          <Pressable accessibilityRole="button" disabled={savingDisplayName} onPress={() => void saveDisplayName(displayNameDraft)} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, savingDisplayName && styles.disabled]}><Text style={styles.saveButtonText}>{savingDisplayName ? "Saving…" : "Save name"}</Text></Pressable>
        </View>
      </MemberCard>
    </View> : null}

    <View style={memberScreenStyles.section}>
      <SectionTitle>Signal Points</SectionTitle>
      {points ? <>
        <MemberCard><View style={styles.pointsHero}><Text style={styles.pointsValue}>{points.balance}</Text><Text style={styles.pointsLabel}>AVAILABLE POINTS</Text></View>{points.debt > 0 ? <Text style={styles.warning}>{points.debt} points pending reconciliation</Text> : null}<Pressable accessibilityRole="link" onPress={() => void openExternal(`${WEB}/sightings`)} style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}><Text style={styles.inlineLinkText}>How to earn points</Text></Pressable></MemberCard>
        <SectionTitle detail={points.redemptionEligible ? `${availableRewardCount} rewards available` : "View only"}>Rewards</SectionTitle>
        {points.catalog.map((reward) => <RewardCard key={reward.key} member={points} onOpen={() => void openExternal(`${WEB}/dashboard?section=memberPoints`)} reward={reward} />)}
        {points.redemptions.length ? <><SectionTitle detail={`${points.redemptions.length} total`}>Recent redemptions</SectionTitle><MemberCard>{points.redemptions.slice(0, 3).map((redemption, index) => <DataRow key={redemption.id} label={points.catalog.find((reward) => reward.key === redemption.itemKey)?.name || redemption.itemKey} value={`${redemption.status} · ${redemption.pointsSpent} pts`} last={index === Math.min(points.redemptions.length, 3) - 1} />)}</MemberCard></> : null}
      </> : pointsError ? <ErrorState message={pointsError} onRetry={() => void load(true)} /> : null}
    </View>

    <View style={memberScreenStyles.section}>
      <SectionTitle>Account</SectionTitle>
      <View style={styles.links}><LinkRow label="Manage membership" onPress={() => void openExternal(`${WEB}/dashboard`)} /><LinkRow label="Support" onPress={() => void openExternal(`${WEB}/support`)} /><LinkRow label="Privacy policy" onPress={() => void openExternal(`${WEB}/legal/privacy`)} /><LinkRow danger label="Request account deletion" onPress={() => void openExternal(ACCOUNT_DELETION_URL)} /></View>
      {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </View>

    <View style={styles.diagnostics}><Text style={styles.diagnosticTitle}>App diagnostics</Text><Text selectable style={styles.diagnosticText}>Version {versionLabel} (build {buildLabel}) · Runtime {runtimeLabel} · Update {updateLabel}</Text><Text style={styles.diagnosticHelp}>Include this line when reporting a TestFlight problem.</Text></View>
  </ScrollView>;
}

function RewardCard({ reward, member, onOpen }: { reward: SignalRewardItem; member: SignalPointsSummary; onOpen: () => void }) {
  const availability = rewardAvailability(reward, member);
  const fulfillment = reward.fulfillmentType === "physical"
    ? "Physical reward · details confirmed before redemption"
    : "Digital reward · details confirmed before redemption";
  return <Pressable accessibilityHint="Opens the canonical reward fulfillment flow" accessibilityRole="link" onPress={onOpen} style={({ pressed }) => pressed && styles.pressed}><MemberCard accent={availability.claimable}><View style={styles.rewardRow}><View style={styles.rewardCopy}><Text style={styles.rewardName}>{reward.name}</Text><Text style={[styles.muted, availability.claimable && styles.claimable]}>{availability.label}</Text><Text style={styles.fulfillment}>{fulfillment}</Text></View><View style={styles.rewardRight}><Text style={styles.rewardPoints}>{reward.points} pts</Text><Text style={styles.rewardAction}>{availability.claimable ? "Review redemption ›" : "View details ›"}</Text></View></View></MemberCard></Pressable>;
}

function LinkRow({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) { return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}><Text style={[styles.linkText, danger && styles.danger]}>{label}</Text><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>›</Text></Pressable>; }

const styles = StyleSheet.create({
  loading: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 12 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 17 }, identity: { color: colors.text, fontSize: 22, fontWeight: "800" },
  communityName: { color: colors.text, fontSize: 18, fontWeight: "800" }, displayNameInput: { minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 15, paddingHorizontal: 14 }, displayNameActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }, secondaryButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }, secondaryButtonText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, saveButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.accent }, saveButtonText: { color: colors.background, fontSize: 13, fontWeight: "900" }, success: { color: colors.success, fontSize: 12 }, disabled: { opacity: 0.55 },
  pointsHero: { alignItems: "center", paddingVertical: 12, gap: 3 }, pointsValue: { color: colors.accent, fontSize: 46, lineHeight: 50, fontWeight: "800" }, pointsLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, warning: { color: colors.danger, textAlign: "center", fontSize: 12 }, inlineLink: { minHeight: 44, alignItems: "center", justifyContent: "center" }, inlineLinkText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  rewardRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }, rewardCopy: { flex: 1, gap: 3 }, rewardRight: { alignItems: "flex-end", gap: 9 }, rewardName: { color: colors.text, fontSize: 15, fontWeight: "700" }, rewardPoints: { color: colors.accent, fontSize: 14, fontWeight: "800" }, rewardAction: { color: colors.muted, fontSize: 11, fontWeight: "700" }, fulfillment: { color: colors.muted, fontSize: 11, lineHeight: 16 }, claimable: { color: colors.success, fontWeight: "700" },
  links: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" }, linkRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, linkText: { color: colors.text, fontSize: 15, fontWeight: "600" }, danger: { color: colors.danger }, chevron: { color: colors.muted, fontSize: 24 }, signOut: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center" }, signOutText: { color: colors.text, fontWeight: "700" }, pressed: { opacity: 0.65 }, error: { color: colors.danger, fontSize: 13 },
  diagnostics: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 4 }, diagnosticTitle: { color: colors.text, fontSize: 12, fontWeight: "700" }, diagnosticText: { color: colors.muted, fontSize: 11 }, diagnosticHelp: { color: colors.muted, fontSize: 10, lineHeight: 15 },
});

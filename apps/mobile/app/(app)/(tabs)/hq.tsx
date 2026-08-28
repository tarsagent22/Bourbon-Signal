import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, SignalPointsSummary, SignalRewardItem } from "../../../src/api/types";
import { DataRow, ErrorState, MemberCard, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { rewardAvailability, rewardCatalogSummary } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const WEB = "https://www.bourbonsignal.com";
const REWARDS_URL = `${WEB}/dashboard?section=memberPoints`;
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
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [showEarningGuide, setShowEarningGuide] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setProfileError("");
    setPointsError("");
    const [profileResult, pointsResult] = await Promise.allSettled([
      api.getMemberProfile({ fresh }),
      api.getSignalPoints({ fresh }),
    ]);
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value.profile);
      setDisplayNameDraft(profileResult.value.profile.customDisplayName || "");
    } else {
      setProfileError(profileResult.reason instanceof MobileApiError && profileResult.reason.status === 401
        ? "Your session could not be verified. Return to Signals and retry."
        : profileResult.reason instanceof Error ? profileResult.reason.message : "Membership details are temporarily unavailable.");
    }
    if (pointsResult.status === "fulfilled") setPoints(pointsResult.value);
    else {
      setPointsError(pointsResult.reason instanceof MobileApiError && pointsResult.reason.status === 401
        ? "Your session could not be verified. Return to Signals and retry."
        : pointsResult.reason instanceof Error ? pointsResult.reason.message : "Signal Points are temporarily unavailable.");
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { void load(false); }, [load]);

  const rewards = useMemo(() => points
    ? rewardCatalogSummary(points.catalog, { balance: points.balance, redemptionEligible: points.redemptionEligible })
    : null, [points]);

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
      setDisplayNameSuccess(displayName === null ? "Public name reset to your member identity." : "Public name saved.");
      setEditingDisplayName(false);
    } catch (caught) {
      setDisplayNameError(caught instanceof Error ? caught.message : "Public name could not be saved.");
    } finally {
      setSavingDisplayName(false);
    }
  }

  const updateLabel = Updates.updateId ? Updates.updateId.slice(0, 8) : "embedded";
  const runtimeLabel = String(Updates.runtimeVersion || "embedded");
  const versionLabel = Constants.nativeAppVersion || Constants.expoConfig?.version || "not provided";
  const buildLabel = Constants.nativeBuildVersion || "not provided";
  const diagnostics = `Bourbon Signal ${versionLabel} (build ${buildLabel}) · Runtime ${runtimeLabel} · Update ${updateLabel}`;
  const trimmedDisplayName = displayNameDraft.trim();
  const displayNameDirty = trimmedDisplayName !== (profile?.customDisplayName || "") && trimmedDisplayName.length > 0;

  return <ScrollView
    contentContainerStyle={memberScreenStyles.content}
    refreshControl={<RefreshControl refreshing={loading && Boolean(profile)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    {loading && !profile ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading your member account…</Text></View> : null}
    {profileError ? <ErrorState message={profileError} onRetry={() => void load(true)} /> : null}

    {profile ? <View style={styles.commandCard}>
      <Text style={styles.eyebrow}>MEMBER COMMAND CENTER</Text>
      <View style={styles.identityRow}>
        <Text accessibilityRole="header" style={styles.identity}>{profile.identity?.label || "Bourbon Signal Member"}</Text>
        <View style={styles.planBadge}><Text style={styles.planBadgeText}>{profile.membership.label.toUpperCase()}</Text></View>
      </View>
      <Text style={styles.commandDetail}>{profile.entitlements.fullFeed ? "Full Intel" : "Preview Intel"} · {profile.entitlements.canSubmitSignals ? "Community posting" : "Posting unavailable"} · Member rewards</Text>
      {points ? <>
        <View style={styles.commandDivider} />
        <View style={styles.pointsCommandRow}>
          <View><Text style={styles.pointsValue}>{points.balance}</Text><Text style={styles.pointsLabel}>AVAILABLE POINTS</Text></View>
          <View style={styles.commandRewardSummary}>
            <Text style={styles.commandRewardValue}>{rewards?.claimableCount || 0} ready to redeem</Text>
            <Text style={styles.commandRewardDetail}>{!points.redemptionEligible ? "Membership required to redeem" : rewards?.nextReward && rewards.nextRewardProgress ? `${rewards.nextRewardProgress.remaining} pts to ${rewards.nextReward.name.replace(/^Bourbon Signal /, "")}` : "Your catalog is up to date"}</Text>
          </View>
        </View>
        {rewards?.nextReward && rewards.nextRewardProgress ? <ProgressBar label={rewards.nextReward.name} ratio={rewards.nextRewardProgress.ratio} /> : null}
      </> : null}
    </View> : null}

    <View style={memberScreenStyles.section}>
      <SectionTitle detail={rewards ? `${rewards.claimableCount} ready · ${rewards.catalogAvailableCount} in catalog` : undefined}>Rewards</SectionTitle>
      {points && rewards ? <>
        {rewards.featuredReward ? <FeaturedRewardCard member={points} onOpen={() => void openExternal(REWARDS_URL)} reward={rewards.featuredReward} /> : null}
        {rewards.orderedRewards.filter((reward) => reward.key !== rewards.featuredReward?.key).map((reward) => (
          <RewardProgressRow key={reward.key} member={points} onOpen={() => void openExternal(REWARDS_URL)} reward={reward} />
        ))}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarningGuide }} onPress={() => setShowEarningGuide((value) => !value)} style={({ pressed }) => [styles.guideToggle, pressed && styles.pressed]}>
          <View style={styles.guideCopy}><Text style={styles.guideTitle}>How Signal Points work</Text><Text style={styles.guideDetail}>Useful contributions earn progress toward member rewards.</Text></View>
          <Text accessible={false} style={styles.chevron}>{showEarningGuide ? "−" : "+"}</Text>
        </Pressable>
        {showEarningGuide ? <MemberCard>
          <Text style={styles.guideHeading}>Earn points by improving the community’s Intel</Text>
          <GuideItem title="Report a useful sighting" detail="Share the bottle, exact store, and current availability." />
          <GuideItem title="Add trustworthy details" detail="Useful location and timing evidence makes a report stronger." />
          <GuideItem title="Build verified contributions" detail="Accepted contributions add to your available balance." />
          <Text style={styles.guideFootnote}>Point awards depend on the contribution and verification result.</Text>
        </MemberCard> : null}
        {points.debt > 0 ? <Text style={styles.warning}>{points.debt} points are pending reconciliation.</Text> : null}
        {points.redemptions.length ? <MemberCard>
          <Text style={styles.cardEyebrow}>RECENT REDEMPTIONS</Text>
          {points.redemptions.slice(0, 3).map((redemption, index) => <DataRow
            key={redemption.id}
            label={points.catalog.find((reward) => reward.key === redemption.itemKey)?.name || redemption.itemKey}
            value={`${redemption.status} · ${redemption.pointsSpent} pts`}
            last={index === Math.min(points.redemptions.length, 3) - 1}
          />)}
        </MemberCard> : null}
      </> : pointsError ? <ErrorState message={pointsError} onRetry={() => void load(true)} /> : null}
    </View>

    {profile ? <View style={memberScreenStyles.section}>
      <SectionTitle>Profile</SectionTitle>
      <MemberCard>
        <View style={styles.settingSummary}>
          <View style={styles.settingCopy}><Text style={styles.settingLabel}>Public community name</Text><Text style={styles.settingValue}>{profile.displayName}</Text><Text style={styles.muted}>Shown on your Community sightings. Your numbered identity never changes.</Text></View>
          <Pressable accessibilityRole="button" onPress={() => {
            if (editingDisplayName) setDisplayNameDraft(profile.customDisplayName || "");
            setEditingDisplayName((value) => !value);
            setDisplayNameError("");
            setDisplayNameSuccess("");
          }} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}><Text style={styles.editButtonText}>{editingDisplayName ? "Cancel" : "Edit public name"}</Text></Pressable>
        </View>
        {editingDisplayName ? <View style={styles.nameEditor}>
          <TextInput
            accessibilityLabel="Public community name"
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
          <Text style={styles.characterCount}>{displayNameDraft.length}/32</Text>
          {displayNameError ? <Text accessibilityRole="alert" style={styles.error}>{displayNameError}</Text> : null}
          <View style={styles.nameActions}>
            {profile.customDisplayName ? <Pressable accessibilityRole="button" disabled={savingDisplayName} onPress={() => void saveDisplayName(null)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Use {profile.identity?.label || "member identity"}</Text></Pressable> : null}
            <Pressable accessibilityRole="button" disabled={!displayNameDirty || savingDisplayName} onPress={() => void saveDisplayName(trimmedDisplayName)} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed, (!displayNameDirty || savingDisplayName) && styles.disabled]}><Text style={styles.primaryButtonText}>{savingDisplayName ? "Saving…" : "Save name"}</Text></Pressable>
          </View>
        </View> : null}
        {displayNameSuccess ? <Text accessibilityRole="alert" style={styles.success}>{displayNameSuccess}</Text> : null}
      </MemberCard>
    </View> : null}

    <View style={memberScreenStyles.section}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAccount }} onPress={() => setShowAccount((value) => !value)} style={({ pressed }) => [styles.sectionToggle, pressed && styles.pressed]}>
        <View><Text style={styles.sectionToggleTitle}>Account & support</Text><Text style={styles.sectionToggleDetail}>Membership, help, privacy, and sign out</Text></View>
        <Text accessible={false} style={styles.chevron}>{showAccount ? "−" : "+"}</Text>
      </Pressable>
      {showAccount ? <View style={styles.accountPanel}>
        <LinkRow label="Manage membership" onPress={() => void openExternal(`${WEB}/dashboard`)} />
        <LinkRow label="Support" onPress={() => void openExternal(`${WEB}/support`)} />
        <LinkRow label="Privacy policy" onPress={() => void openExternal(`${WEB}/legal/privacy`)} />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDiagnostics }} onPress={() => setShowDiagnostics((value) => !value)} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}><Text style={styles.linkText}>App information</Text><Text accessible={false} style={styles.chevron}>{showDiagnostics ? "−" : "+"}</Text></Pressable>
        {showDiagnostics ? <View style={styles.diagnostics}>
          <Text selectable style={styles.diagnosticText}>{diagnostics}</Text>
          <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: diagnostics, title: "Bourbon Signal diagnostics" })} style={({ pressed }) => [styles.diagnosticAction, pressed && styles.pressed]}><Text style={styles.diagnosticActionText}>Share diagnostics</Text></Pressable>
        </View> : null}
        <Pressable accessibilityRole="button" onPress={() => signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><Text style={styles.signOutText}>Sign out</Text></Pressable>
        <View style={styles.dangerZone}><Text style={styles.dangerTitle}>Data & privacy</Text><Pressable accessibilityRole="link" onPress={() => void openExternal(ACCOUNT_DELETION_URL)} style={({ pressed }) => [styles.deletionButton, pressed && styles.pressed]}><Text style={styles.deletionText}>Request account deletion</Text></Pressable></View>
      </View> : null}
      {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
    </View>
  </ScrollView>;
}

function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const width = `${percent}%` as `${number}%`;
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={`${label}: ${percent} percent complete`} accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.progressTrack}><View style={[styles.progressFill, { width }]} /></View>;
}

function FeaturedRewardCard({ reward, member, onOpen }: { reward: SignalRewardItem; member: SignalPointsSummary; onOpen: () => void }) {
  const remaining = Math.max(0, member.balance - reward.points);
  return <View style={styles.featuredReward}>
    <View style={styles.unlockedPill}><Text style={styles.unlockedText}>UNLOCKED</Text></View>
    <Text style={styles.featuredRewardName}>{reward.name}</Text>
    <Text style={styles.featuredRewardPoints}>{reward.points} points</Text>
    <Text style={styles.featuredRewardDetail}>You’ll have {remaining} points remaining after redemption.</Text>
    <Text style={styles.fulfillmentHint}>{reward.fulfillmentType === "physical" ? "Physical reward · shipping details confirmed before redemption." : "Digital reward · delivery details confirmed before redemption."}</Text>
    <Pressable accessibilityRole="link" onPress={onOpen} style={({ pressed }) => [styles.redeemButton, pressed && styles.primaryPressed]}><Text style={styles.redeemButtonText}>Redeem reward</Text></Pressable>
  </View>;
}

function RewardProgressRow({ reward, member, onOpen }: { reward: SignalRewardItem; member: SignalPointsSummary; onOpen: () => void }) {
  const availability = rewardAvailability(reward, member);
  const ratio = member.balance / Math.max(1, reward.points);
  return <View style={styles.rewardRow}>
    <Pressable accessibilityRole="link" accessibilityLabel={`${reward.name}. ${availability.label}. ${reward.points} points.`} onPress={onOpen} style={({ pressed }) => [styles.rewardRowAction, pressed && styles.pressed]}>
      <View style={styles.rewardRowHeader}><View style={styles.rewardCopy}><Text style={styles.rewardName}>{reward.name}</Text><Text style={[styles.rewardStatus, availability.soldOut && styles.soldOut]}>{availability.label}</Text></View><Text style={styles.rewardPoints}>{reward.points} pts</Text></View>
    </Pressable>
    {member.redemptionEligible && !availability.soldOut ? <ProgressBar label={reward.name} ratio={ratio} /> : null}
  </View>;
}

function GuideItem({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.guideItem}><View style={styles.guideDot} /><View style={styles.guideItemCopy}><Text style={styles.guideItemTitle}>{title}</Text><Text style={styles.guideItemDetail}>{detail}</Text></View></View>;
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}><Text style={styles.linkText}>{label}</Text><Text accessible={false} style={styles.chevron}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.35 },
  commandCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  identityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  identity: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.4 },
  planBadge: { backgroundColor: "rgba(214,154,74,0.14)", borderColor: "rgba(214,154,74,0.55)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  planBadgeText: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  commandDetail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  commandDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  pointsCommandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  pointsValue: { color: colors.text, fontSize: 38, lineHeight: 42, fontWeight: "900", fontVariant: ["tabular-nums"] },
  pointsLabel: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.15 },
  commandRewardSummary: { flex: 1, alignItems: "flex-end", gap: 3 },
  commandRewardValue: { color: colors.success, fontSize: 14, fontWeight: "800", textAlign: "right" },
  commandRewardDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "right" },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 999 },
  featuredReward: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  unlockedPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.success, paddingHorizontal: 9, paddingVertical: 5 },
  unlockedText: { color: colors.background, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  featuredRewardName: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800" },
  featuredRewardPoints: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  featuredRewardDetail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  fulfillmentHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  redeemButton: { minHeight: 48, marginTop: 4, backgroundColor: colors.accent, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  redeemButtonText: { color: colors.background, fontSize: 15, fontWeight: "900" },
  rewardRow: { minHeight: 76, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 10, gap: 8, justifyContent: "center" },
  rewardRowAction: { minHeight: 44, justifyContent: "center" },
  rewardRowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  rewardCopy: { flex: 1, gap: 3 },
  rewardName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  rewardStatus: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  rewardPoints: { color: colors.accent, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
  soldOut: { color: colors.danger },
  guideToggle: { minHeight: 64, paddingHorizontal: 15, paddingVertical: 12, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  guideCopy: { flex: 1 },
  guideTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  guideDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  guideHeading: { color: colors.text, fontSize: 16, fontWeight: "800" },
  guideItem: { flexDirection: "row", gap: 11, alignItems: "flex-start", paddingVertical: 2 },
  guideDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: colors.accent, marginTop: 7 },
  guideItemCopy: { flex: 1, gap: 2 },
  guideItemTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  guideItemDetail: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  guideFootnote: { color: colors.muted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  cardEyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  settingSummary: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  settingCopy: { flex: 1, gap: 3 },
  settingLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.25 },
  settingValue: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800" },
  editButton: { minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  editButtonText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  nameEditor: { gap: 9, paddingTop: 8, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  displayNameInput: { minHeight: 48, borderRadius: 12, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 13, fontSize: 16 },
  characterCount: { color: colors.muted, fontSize: 12, textAlign: "right" },
  nameActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  primaryButton: { minHeight: 44, backgroundColor: colors.accent, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primaryButtonText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  secondaryButton: { minHeight: 44, borderRadius: 10, borderColor: colors.border, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  sectionToggle: { minHeight: 68, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  sectionToggleTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  sectionToggleDetail: { color: colors.muted, fontSize: 13, marginTop: 3 },
  chevron: { color: colors.accent, fontSize: 23, lineHeight: 25 },
  accountPanel: { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, backgroundColor: colors.surface, overflow: "hidden" },
  linkRow: { minHeight: 54, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  linkText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  diagnostics: { padding: 16, gap: 12, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: colors.background },
  diagnosticText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  diagnosticAction: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  diagnosticActionText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  signOut: { minHeight: 54, alignItems: "center", justifyContent: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  signOutText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  dangerZone: { padding: 16, gap: 8 },
  dangerTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  deletionButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
  deletionText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  warning: { color: colors.accent, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: colors.success, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.72 },
  primaryPressed: { backgroundColor: colors.accentPressed },
  disabled: { opacity: 0.45 },
});

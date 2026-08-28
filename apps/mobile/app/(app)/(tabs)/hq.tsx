import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, ReferralSummary, SignalPointsSummary, SignalRewardItem } from "../../../src/api/types";
import { DataRow, ErrorState, MemberCard, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { rewardAvailability, rewardCatalogSummary } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const WEB = "https://www.bourbonsignal.com";
const REWARDS_URL = `${WEB}/dashboard?section=memberPoints`;
const SETTINGS_URL = `${WEB}/settings`;
const ACCOUNT_DELETION_URL = "mailto:support@bourbonsignal.com?subject=Bourbon%20Signal%20account%20deletion%20request&body=Please%20delete%20my%20Bourbon%20Signal%20account.%20I%20am%20sending%20this%20request%20from%20the%20email%20address%20associated%20with%20my%20account.";

export default function AccountScreen() {
  const api = useMobileApi();
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [points, setPoints] = useState<SignalPointsSummary | null>(null);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [profileError, setProfileError] = useState("");
  const [pointsError, setPointsError] = useState("");
  const [referralError, setReferralError] = useState("");
  const [shareError, setShareError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [loading, setLoading] = useState(true);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameSuccess, setDisplayNameSuccess] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [showEarningGuide, setShowEarningGuide] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [sharingReferral, setSharingReferral] = useState(false);
  const referralRequestId = useRef(0);
  const accountRequestId = useRef(0);

  const loadReferral = useCallback(async (fresh = false) => {
    setReferralError("");
    setShareError("");
    const currentReferralRequestId = ++referralRequestId.current;
    try {
      const value = await api.getReferralSummary({ fresh });
      if (referralRequestId.current !== currentReferralRequestId) return;
      setReferral(value);
      setReferralError("");
    } catch (reason) {
      if (referralRequestId.current !== currentReferralRequestId) return;
      setReferral(null);
      setReferralError(reason instanceof Error ? reason.message : "Referral details are temporarily unavailable.");
    }
  }, [api]);

  const load = useCallback(async (fresh = false) => {
    const currentAccountRequestId = ++accountRequestId.current;
    setLoading(true);
    setProfileError("");
    setPointsError("");
    void loadReferral(fresh);
    const [profileResult, pointsResult] = await Promise.allSettled([
      api.getMemberProfile({ fresh }),
      api.getSignalPoints({ fresh }),
    ]);
    if (accountRequestId.current !== currentAccountRequestId) return;
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value.profile);
      setDisplayNameDraft(profileResult.value.profile.customDisplayName || "");
    } else {
      setProfile(null);
      setProfileError(profileResult.reason instanceof MobileApiError && profileResult.reason.status === 401
        ? "Your session could not be verified. Return to Signals and retry."
        : profileResult.reason instanceof Error ? profileResult.reason.message : "Membership details are temporarily unavailable.");
    }
    if (pointsResult.status === "fulfilled") setPoints(pointsResult.value);
    else {
      setPoints(null);
      setPointsError(pointsResult.reason instanceof MobileApiError && pointsResult.reason.status === 401
        ? "Your session could not be verified. Return to Signals and retry."
        : pointsResult.reason instanceof Error ? pointsResult.reason.message : "Signal Points are temporarily unavailable.");
    }
    setLoading(false);
  }, [api, loadReferral]);

  useEffect(() => { void load(false); }, [load]);

  const rewards = useMemo(() => points
    ? rewardCatalogSummary(points.catalog, { balance: points.balance, redemptionEligible: points.redemptionEligible })
    : null, [points]);

  async function openExternal(url: string) {
    setLinkError("");
    try { await Linking.openURL(url); }
    catch { setLinkError("That link could not be opened. Contact support@bourbonsignal.com."); }
  }

  async function shareReferral() {
    if (!referral || sharingReferral) return;
    setSharingReferral(true);
    setShareError("");
    try {
      await Share.share({
        message: `Join me on Bourbon Signal for verified bourbon availability, community sightings, and rewards. ${referral.referralLink}`,
        title: "Join Bourbon Signal",
      });
    } catch (caught) {
      setShareError(caught instanceof Error ? caught.message : "Your referral link could not be shared.");
    } finally {
      setSharingReferral(false);
    }
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
  const canSaveShipping = Boolean(profile?.membership.paid || (referral?.founderGlassesEarned || 0) > 0);
  const nextPreview = rewards?.nextReward && rewards.nextReward.key !== rewards.featuredReward?.key ? rewards.nextReward : null;

  return <ScrollView
    contentContainerStyle={memberScreenStyles.content}
    refreshControl={<RefreshControl refreshing={loading && Boolean(profile)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    {loading && !profile ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading your account…</Text></View> : null}
    {profileError ? <ErrorState message={profileError} onRetry={() => void load(true)} /> : null}

    {profile ? <View style={styles.commandCard}>
      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <View style={styles.identityRow}>
        <Text accessibilityRole="header" style={styles.identity}>{profile.identity?.label || "Bourbon Signal Member"}</Text>
        <View style={styles.planBadge}><Text style={styles.planBadgeText}>{profile.membership.label.toUpperCase()}</Text></View>
      </View>
      <Text style={styles.commandDetail}>{profile.entitlements.fullFeed ? "Full Intel" : "Preview Intel"} · {profile.entitlements.canSubmitSignals ? "Community posting" : "Posting unavailable"}</Text>
      {points ? <>
        <View style={styles.commandDivider} />
        <View style={styles.pointsCommandRow}>
          <View><Text style={styles.pointsValue}>{points.balance}</Text><Text style={styles.pointsLabel}>SIGNAL POINTS</Text></View>
          <View style={styles.commandRewardSummary}>
            <Text style={styles.commandRewardValue}>{rewards?.claimableCount || 0} ready to redeem</Text>
            <Text style={styles.commandRewardDetail}>{!points.redemptionEligible ? "Membership required to redeem" : rewards?.nextReward && rewards.nextRewardProgress ? `${rewards.nextRewardProgress.remaining} pts to ${rewards.nextReward.name.replace(/^Bourbon Signal /, "")}` : "Your catalog is up to date"}</Text>
          </View>
        </View>
        {rewards?.nextReward && rewards.nextRewardProgress ? <ProgressBar label={rewards.nextReward.name} ratio={rewards.nextRewardProgress.ratio} /> : null}
      </> : null}
    </View> : null}

    {profile ? <View style={memberScreenStyles.section}>
      <SectionTitle>Profile</SectionTitle>
      <MemberCard>
        <View style={styles.settingSummary}>
          <View style={styles.settingCopy}><Text style={styles.settingLabel}>Public community name</Text><Text style={styles.settingValue}>{profile.displayName}</Text><Text style={styles.muted}>Shown on Community sightings. Your numbered identity never changes.</Text></View>
          <Pressable accessibilityRole="button" onPress={() => {
            if (editingDisplayName) setDisplayNameDraft(profile.customDisplayName || "");
            setEditingDisplayName((value) => !value);
            setDisplayNameError("");
            setDisplayNameSuccess("");
          }} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}><Text style={styles.editButtonText}>{editingDisplayName ? "Cancel" : "Edit"}</Text></Pressable>
        </View>
        {editingDisplayName ? <View style={styles.nameEditor}>
          <TextInput accessibilityLabel="Public community name" autoCapitalize="words" autoCorrect={false} editable={!savingDisplayName} maxLength={32} onChangeText={(value) => { setDisplayNameDraft(value); setDisplayNameError(""); setDisplayNameSuccess(""); }} placeholder="Choose a public Community name" placeholderTextColor={colors.muted} style={styles.displayNameInput} value={displayNameDraft} />
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
      <SectionTitle>Account details</SectionTitle>
      <View style={styles.accountPanel}>
        <LinkRow label="Manage membership" onPress={() => void openExternal(`${WEB}/dashboard`)} />
        {canSaveShipping ? <LinkRow label="Shipping information" onPress={() => void openExternal(`${SETTINGS_URL}#shipping`)} /> : null}
        <LinkRow label="Support" onPress={() => void openExternal(`${WEB}/support`)} />
        <LinkRow label="Privacy policy" onPress={() => void openExternal(`${WEB}/legal/privacy`)} />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDiagnostics }} onPress={() => setShowDiagnostics((value) => !value)} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}><Text style={styles.linkText}>App information</Text><Text accessible={false} style={styles.chevron}>{showDiagnostics ? "−" : "+"}</Text></Pressable>
        {showDiagnostics ? <View style={styles.diagnostics}>
          <Text selectable style={styles.diagnosticText}>{diagnostics}</Text>
          <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: diagnostics, title: "Bourbon Signal diagnostics" })} style={({ pressed }) => [styles.diagnosticAction, pressed && styles.pressed]}><Text style={styles.diagnosticActionText}>Share diagnostics</Text></Pressable>
        </View> : null}
        <Pressable accessibilityRole="button" onPress={() => signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><Text style={styles.signOutText}>Sign out</Text></Pressable>
      </View>
      {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
    </View>

    <View style={memberScreenStyles.section}>
      <SectionTitle detail={rewards ? `${rewards.claimableCount} ready · ${rewards.catalogAvailableCount} in catalog` : undefined}>Rewards</SectionTitle>
      {points && rewards ? <>
        {rewards.featuredReward ? <FeaturedRewardCard member={points} onOpen={() => void openExternal(REWARDS_URL)} reward={rewards.featuredReward} /> : null}
        {nextPreview ? <RewardProgressRow member={points} onOpen={() => void openExternal(REWARDS_URL)} reward={nextPreview} /> : null}
        {!rewards.featuredReward && !nextPreview ? <MemberCard><Text style={styles.guideTitle}>{points.redemptionEligible ? "Reward catalog is up to date" : "Membership required to redeem"}</Text><Text style={styles.muted}>{points.redemptionEligible ? "Open the full catalog to review availability and redemption details." : "Free members can keep earning Signal Points. A paid membership is required before rewards can be redeemed."}</Text></MemberCard> : null}
        <Pressable accessibilityRole="link" onPress={() => void openExternal(REWARDS_URL)} style={({ pressed }) => [styles.catalogLink, pressed && styles.pressed]}><Text style={styles.catalogLinkText}>View all rewards</Text><Text accessible={false} style={styles.chevron}>›</Text></Pressable>
        {points.debt > 0 ? <Text style={styles.warning}>{points.debt} points are pending reconciliation.</Text> : null}
      </> : pointsError ? <ErrorState message={pointsError} onRetry={() => void load(true)} /> : null}
    </View>

    <View style={memberScreenStyles.section}>
      <SectionTitle>Ways to earn</SectionTitle>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarningGuide }} onPress={() => setShowEarningGuide((value) => !value)} style={({ pressed }) => [styles.guideToggle, pressed && styles.pressed]}>
        <View style={styles.guideCopy}><Text style={styles.guideTitle}>Earn Signal Points</Text><Text style={styles.guideDetail}>Sightings, useful contributions, and referrals.</Text></View>
        <Text accessible={false} style={styles.chevron}>{showEarningGuide ? "−" : "+"}</Text>
      </Pressable>
      {showEarningGuide ? <MemberCard>
        <GuideItem title="Report a useful sighting" detail="Share the bottle, exact store, and current availability." />
        <GuideItem title="Build verified contributions" detail="Accepted location and timing evidence adds to your available balance." />
        {referral ? <>
          <GuideItem title="Refer a friend" detail={`Free (first ${referral.program.freeAwardLimit} awards): ${referral.program.pointsByTier.free} pts · Standard: ${referral.program.pointsByTier.standard} · Barrel: ${referral.program.pointsByTier.barrel} · Bottled-in-Bond: ${referral.program.pointsByTier["bottled-in-bond"]}${referral.program.upgradeAwardsDifferenceOnly ? " · upgrade differences only." : "."}`} />
          <View style={styles.referralPanel}>
            <View style={styles.referralSummary}><Text style={styles.referralTitle}>{referral.referrals.total} referred · {referral.referralPoints} points earned</Text><Text selectable style={styles.referralLink}>{referral.referralLink}</Text></View>
            <Pressable accessibilityRole="button" disabled={sharingReferral} onPress={() => void shareReferral()} style={({ pressed }) => [styles.shareButton, pressed && styles.primaryPressed, sharingReferral && styles.disabled]}><Text style={styles.shareButtonText}>{sharingReferral ? "Opening…" : "Share referral link"}</Text></Pressable>
            {shareError ? <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text> : null}
          </View>
        </> : referralError ? <View style={styles.inlineError}><Text accessibilityRole="alert" style={styles.error}>{referralError}</Text><Pressable accessibilityRole="button" onPress={() => void loadReferral(true)} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}><Text style={styles.retryText}>Try again</Text></Pressable></View> : <ActivityIndicator accessibilityLabel="Loading referral details" color={colors.accent} />}
        <Text style={styles.guideFootnote}>Referral totals follow the referred member’s highest membership.{referral?.program.upgradeAwardsDifferenceOnly ? " Paid upgrades award only the difference." : ""}</Text>
      </MemberCard> : null}
    </View>

    {points ? <View style={memberScreenStyles.section}>
      <SectionTitle>Redemption history</SectionTitle>
      {points.redemptions.length ? <MemberCard>
        {points.redemptions.slice(0, 3).map((redemption, index) => <DataRow key={redemption.id} label={points.catalog.find((reward) => reward.key === redemption.itemKey)?.name || redemption.itemKey} value={`${redemption.status.replaceAll("_", " ")} · ${redemption.pointsSpent} pts`} last={index === Math.min(points.redemptions.length, 3) - 1} />)}
      </MemberCard> : <MemberCard><Text style={styles.muted}>No redemptions yet.</Text></MemberCard>}
      <Pressable accessibilityRole="link" onPress={() => void openExternal(REWARDS_URL)} style={({ pressed }) => [styles.catalogLink, pressed && styles.pressed]}><Text style={styles.catalogLinkText}>View redemption details</Text><Text accessible={false} style={styles.chevron}>›</Text></Pressable>
    </View> : null}

    <View style={[memberScreenStyles.section, styles.dangerZone]}>
      <Text style={styles.dangerTitle}>Data & privacy</Text>
      <Text style={styles.muted}>Account deletion is separate from everyday settings.</Text>
      <Pressable accessibilityRole="link" onPress={() => void openExternal(ACCOUNT_DELETION_URL)} style={({ pressed }) => [styles.deletionButton, pressed && styles.pressed]}><Text style={styles.deletionText}>Request account deletion</Text></Pressable>
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
  return <View style={styles.featuredReward}><View style={styles.unlockedPill}><Text style={styles.unlockedText}>UNLOCKED</Text></View><Text style={styles.featuredRewardName}>{reward.name}</Text><Text style={styles.featuredRewardPoints}>{reward.points} points</Text><Text style={styles.featuredRewardDetail}>You’ll have {remaining} points remaining after redemption.</Text><Text style={styles.fulfillmentHint}>{reward.fulfillmentType === "physical" ? "Physical reward · shipping details confirmed before redemption." : "Digital reward · delivery details confirmed before redemption."}</Text><Pressable accessibilityRole="link" onPress={onOpen} style={({ pressed }) => [styles.redeemButton, pressed && styles.primaryPressed]}><Text style={styles.redeemButtonText}>Redeem reward</Text></Pressable></View>;
}

function RewardProgressRow({ reward, member, onOpen }: { reward: SignalRewardItem; member: SignalPointsSummary; onOpen: () => void }) {
  const availability = rewardAvailability(reward, member);
  const ratio = member.balance / Math.max(1, reward.points);
  return <View style={styles.rewardRow}><Pressable accessibilityRole="link" accessibilityLabel={`${reward.name}. ${availability.label}. ${reward.points} points.`} onPress={onOpen} style={({ pressed }) => [styles.rewardRowAction, pressed && styles.pressed]}><View style={styles.rewardRowHeader}><View style={styles.rewardCopy}><Text style={styles.rewardName}>{reward.name}</Text><Text style={[styles.rewardStatus, availability.soldOut && styles.soldOut]}>{availability.label}</Text></View><Text style={styles.rewardPoints}>{reward.points} pts</Text></View></Pressable>{member.redemptionEligible && !availability.soldOut ? <ProgressBar label={reward.name} ratio={ratio} /> : null}</View>;
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
  commandCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 18, gap: 9 },
  identityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  identity: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.4 },
  planBadge: { backgroundColor: "rgba(214,154,74,0.14)", borderColor: "rgba(214,154,74,0.55)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  planBadgeText: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  commandDetail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  commandDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 3 },
  pointsCommandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  pointsValue: { color: colors.text, fontSize: 36, lineHeight: 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
  pointsLabel: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.15 },
  commandRewardSummary: { flex: 1, alignItems: "flex-end", gap: 3 },
  commandRewardValue: { color: colors.success, fontSize: 14, fontWeight: "800", textAlign: "right" },
  commandRewardDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "right" },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 999 },
  settingSummary: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  settingCopy: { flex: 1, gap: 3 },
  settingLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  settingValue: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800" },
  editButton: { minHeight: 44, minWidth: 56, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  editButtonText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  nameEditor: { gap: 9, paddingTop: 8, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  displayNameInput: { minHeight: 48, borderRadius: 12, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 13, fontSize: 16 },
  characterCount: { color: colors.muted, fontSize: 12, textAlign: "right" },
  nameActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  primaryButton: { minHeight: 44, backgroundColor: colors.accent, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primaryButtonText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  secondaryButton: { minHeight: 44, borderRadius: 10, borderColor: colors.border, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  accountPanel: { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, backgroundColor: colors.surface, overflow: "hidden" },
  linkRow: { minHeight: 54, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  linkText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  chevron: { color: colors.accent, fontSize: 23, lineHeight: 25 },
  diagnostics: { padding: 16, gap: 12, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: colors.background },
  diagnosticText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  diagnosticAction: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  diagnosticActionText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  signOut: { minHeight: 54, alignItems: "center", justifyContent: "center" },
  signOutText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  featuredReward: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  unlockedPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.success, paddingHorizontal: 9, paddingVertical: 5 },
  unlockedText: { color: colors.background, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  featuredRewardName: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800" },
  featuredRewardPoints: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  featuredRewardDetail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  fulfillmentHint: { color: colors.muted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
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
  catalogLink: { minHeight: 52, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catalogLinkText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  guideToggle: { minHeight: 64, paddingHorizontal: 15, paddingVertical: 12, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  guideCopy: { flex: 1 },
  guideTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  guideDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  guideItem: { flexDirection: "row", gap: 11, alignItems: "flex-start", paddingVertical: 2 },
  guideDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: colors.accent, marginTop: 7 },
  guideItemCopy: { flex: 1, gap: 2 },
  guideItemTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  guideItemDetail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  guideFootnote: { color: colors.muted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  referralPanel: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 12 },
  referralSummary: { gap: 5 },
  referralTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  referralLink: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  shareButton: { minHeight: 46, backgroundColor: colors.accent, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  shareButtonText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  inlineError: { gap: 8 },
  retryButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 4 },
  retryText: { color: colors.accent, fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  dangerZone: { borderColor: "rgba(220,80,80,0.35)", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 7 },
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

import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import type {
  AchievementSummary,
  MemberProfile,
  SignalPointsSummary,
} from "../../../src/api/types";
import {
  ErrorState,
  LoadingState,
  memberScreenStyles,
} from "../../../src/components/MemberScreen";
import { useAccessibleStatus } from "../../../src/hooks/useAccessibleStatus";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { signOutWithRadarPushDisabled } from "../../../src/push/push-registration";
import { rewardCatalogSummary } from "../../../src/interactions/member-interactions";
import { RewardEmblem, rewardStyles as s } from "../../../src/rewards/RewardUI";
import { colors, typeScale, fonts } from "../../../src/theme";

export default function AccountScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const { signOut } = useAuth();
  const sequence = useRef(0);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [points, setPoints] = useState<SignalPointsSummary | null>(null);
  const [achievements, setBadges] = useState<AchievementSummary | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useAccessibleStatus(error);
  const [signingOut, setSigningOut] = useState(false);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const load = useCallback(async (fresh = false) => {
    const id = ++sequence.current;
    setLoading(true);
    setError("");
    setAdminAllowed(false);
    await Promise.allSettled([
      api.getAdminAccess().then(a=>{if(id===sequence.current)setAdminAllowed(a.allowed);}).catch(()=>undefined),
      api.getMemberProfile({ fresh }).then(p => {
        if (id === sequence.current) setProfile(p.profile);
      }).catch(() => {
        if (id === sequence.current) { setError("Account details are temporarily unavailable."); }
      }),
      api.getSignalPoints({ fresh }).then(p => { if (id === sequence.current) setPoints(p); }).catch(() => { if (id === sequence.current) setError("Points couldn’t refresh. Try again for your latest balance."); }),
      api.getAchievements({ fresh }).then(a => { if (id === sequence.current) setBadges(a); }).catch(() => { if (id === sequence.current) setError("Badges couldn’t refresh. Try again for your latest progress."); }),
    ]);
    if (id === sequence.current) setLoading(false);
  }, [api]);
  useEffect(() => () => { sequence.current += 1; }, [api]);
  useScreenRevalidation(load);
  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutWithRadarPushDisabled(api, signOut);
    } catch {
      setError("Sign out could not finish. Please retry.");
    } finally {
      setSigningOut(false);
    }
  }
  const diagnostics = `Bourbon Signal ${Constants.nativeAppVersion || Constants.expoConfig?.version} (build ${Constants.nativeBuildVersion || "unknown"}) · Runtime ${Updates.runtimeVersion || "embedded"} · Update ${Updates.updateId || "embedded"}`;
  const rewards = points
    ? rewardCatalogSummary(points.catalog, {
        balance: points.balance,
        redemptionEligible: points.redemptionEligible,
      })
    : null;
  const openRewards = (section = "rewards") =>
    router.push({ pathname: "/(app)/account/rewards", params: { section } });
  return (
    <ScrollView
      style={memberScreenStyles.screen}
      contentContainerStyle={s.page}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!profile}
          onRefresh={() => void load(true)}
          tintColor={colors.accent}
        />
      }
    >
      {loading && !profile ? <LoadingState label="Loading account…" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void load(true)} />
      ) : null}
      {profile ? (
        <View style={[s.card, s.hero]}>
          <View style={s.spread}>
            <Text style={s.title}>
              {profile.customDisplayName || "Your account"}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(app)/account/profile")}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: colors.accent, fontWeight: "700" }}>
                Edit profile
              </Text>
            </Pressable>
          </View>
          <View style={s.spread}>
            {profile.identity?.label ? (
              <Text style={s.label}>{profile.identity.label}</Text>
            ) : null}
            <Text style={s.label}>{profile.membership.label}</Text>
          </View>
          {achievements?.featuredBadgeIds?.length?<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{achievements.badges.filter(badge=>achievements.featuredBadgeIds?.includes(badge.id)).map(badge=><Text key={badge.id} style={s.label}>{badge.label}{badge.tier?` · ${badge.tier[0].toUpperCase()+badge.tier.slice(1)}`:""}</Text>)}</View>:null}
          <View style={s.line} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View rewards and Signal Points"
            onPress={() => openRewards()}
            style={{ gap: 8, minHeight: 70 }}
          >
            <Text style={[s.title, { fontSize: typeScale.title, fontFamily: fonts.heading }]}>
              {points ? points.balance : "—"}{" "}
              <Text style={s.muted}>points available</Text>
            </Text>
            <Text style={s.muted}>
              {points
                ? (points.redemptionEligible || rewards?.claimableCount)
                  ? rewards?.claimableCount
                    ? `${rewards.claimableCount} reward${rewards.claimableCount === 1 ? "" : "s"} ready to redeem`
                    : "Keep contributing toward your next reward"
                  : "Earn points toward membership and rewards"
                : "View points and rewards"}
            </Text>
            <Text style={{ color: colors.accent, fontWeight: "800" }}>
              View rewards →
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => openRewards("achievements")}
        style={[s.card, s.row]}
      >
        <RewardEmblem rewardKey="achievement" />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={s.heading}>Badges</Text>
          <Text style={s.muted}>
            {achievements
              ? `${achievements.badges.length} badges earned · ${achievements.currentWeeklyStreak}-week streak`
              : "Badges, milestones, and your next challenge"}
          </Text>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>
            See your progress →
          </Text>
        </View>
      </Pressable>
      <View style={[s.card, { paddingVertical: 4 }]}>
        <AccountRow
          label="Membership"
          detail={
            profile
              ? `${profile.membership.label} · Plans and benefits`
              : "Plans and benefits"
          }
          onPress={() => router.push("/(app)/account/membership")}
        />
        <AccountRow
          label="Alert preferences"
          detail="Notifications, bottles, and locations"
          onPress={() =>
            router.push({
              pathname: "/(app)/(tabs)/radar",
              params: { section: "settings", request: String(Date.now()) },
            })
          }
        />
        <AccountRow
          label="Invite friends"
          detail="Share your link and earn referral points"
          onPress={() => openRewards("earn")}
        />
      </View>
      {adminAllowed ? <View style={s.card}><AccountRow label="Admin" detail="Requests, members, community and rewards" onPress={()=>router.push('/(app)/account/admin')} /></View> : null}
      <Text style={s.label}>SUPPORT & PRIVACY</Text>
      <View style={[s.card, { paddingVertical: 4 }]}>
        <AccountRow
          label="Request coverage"
          detail="Ask us to cover your area or store"
          onPress={() => router.push('/(app)/account/coverage')}
        />
        <AccountRow
          label="Support"
          onPress={() => router.push("/(app)/account/support")}
        />
        <AccountRow
          label="Privacy policy"
          onPress={() => router.push("/(app)/account/privacy")}
        />
        <AccountRow
          label="Terms"
          onPress={() => router.push("/(app)/account/terms")}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDiagnostics }}
          onPress={() => setShowDiagnostics(!showDiagnostics)}
          style={{ minHeight: 52, justifyContent: "center" }}
        >
          <Text style={s.text}>
            App information {showDiagnostics ? "−" : "+"}
          </Text>
        </Pressable>
        {showDiagnostics ? (
          <View style={{ gap: 10, paddingBottom: 16 }}>
            <Text selectable style={s.muted}>
              {diagnostics}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void Share.share({ message: diagnostics }).catch(() =>
                  setError("Diagnostics could not be shared."),
                )
              }
              style={{ minHeight: 44 }}
            >
              <Text style={{ color: colors.accent }}>Share diagnostics</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <AccountRow
        label={signingOut ? "Signing out…" : "Sign out"}
        disabled={signingOut}
        onPress={() => void logout()}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(app)/account/delete")}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ color: colors.danger, fontSize: typeScale.input }}>
          Delete account
        </Text>
      </Pressable>
    </ScrollView>
  );
}
function AccountRow({
  label,
  detail,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 64,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.text}>{label}</Text>
        {detail ? <Text style={s.muted}>{detail}</Text> : null}
      </View>
      <Text style={{ color: colors.accent, fontSize: typeScale.title, fontFamily: fonts.heading }}>›</Text>
    </Pressable>
  );
}

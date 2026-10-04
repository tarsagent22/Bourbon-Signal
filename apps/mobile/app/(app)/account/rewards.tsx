import { useAuth } from "@clerk/expo";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  ReferralSummary,
  SignalPointsSummary,
} from "../../../src/api/types";
import {
  ErrorState,
  LoadingState,
  memberScreenStyles,
} from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { useAccessibleStatus } from "../../../src/hooks/useAccessibleStatus";
import {
  activityLabel,
  formatPoints,
  rewardName,
  redemptionLabel,
  rewardGoal,
} from "../../../src/rewards/reward-model";
import {
  readRewardValue,
  saveRewardValue,
} from "../../../src/rewards/reward-storage";
import {
  ProgressBar,
  RewardButton,
  RewardCard,
  RewardEmblem,
  rewardStyles as s,
} from "../../../src/rewards/RewardUI";
import { BadgeCollection } from "../../../src/rewards/BadgeCollection";
import { colors } from "../../../src/theme";

type Section = "rewards" | "achievements" | "earn" | "activity";
const sections: Array<{ key: Section; label: string }> = [
  { key: "rewards", label: "Rewards" },
  { key: "achievements", label: "Badges" },
  { key: "earn", label: "Earn" },
  { key: "activity", label: "History" },
];

export default function RewardsScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>("rewards");
  const [points, setPoints] = useState<SignalPointsSummary | null>(null);
  const [achievements, setAchievements] = useState<AchievementSummary | null>(
    null,
  );
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [errors, setErrors] = useState({
    points: "",
    achievements: "",
    referral: "",
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [goalKey, setGoalKey] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [newBadge, setNewBadge] = useState("");
  const sequence = useRef(0);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);
  useAccessibleStatus(notice || newBadge);
  useEffect(() => {
    if (sections.some((item) => item.key === params.section))
      setSection(params.section as Section);
  }, [params.section]);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    // Independent panels remain usable if a secondary service fails.
    const [p, a, r, saved] = await Promise.allSettled([
      api.getSignalPoints({ fresh: true }),
      api.getAchievements({ fresh: true }),
      api.getReferralSummary({ fresh: true }),
      userId ? readRewardValue(userId, "goal") : Promise.resolve(null),
    ]);
    if (id !== sequence.current) return;
    setPoints(p.status === "fulfilled" ? p.value : null);
    setAchievements(a.status === "fulfilled" ? a.value : null);
    setReferral(r.status === "fulfilled" ? r.value : null);
    setErrors({
      points:
        p.status === "rejected"
          ? "Points and rewards are temporarily unavailable."
          : "",
      achievements:
        a.status === "rejected"
          ? "Achievements are temporarily unavailable."
          : "",
      referral:
        r.status === "rejected"
          ? "Referral details are temporarily unavailable."
          : "",
    });
    if (saved.status === "fulfilled") setGoalKey(saved.value);
    setLoading(false);
    if (a.status === "fulfilled" && userId) {
      try {
        const seen = await readRewardValue(userId, "badges");
        if (id !== sequence.current) return;
        const previous: string[] = seen ? JSON.parse(seen) : [];
        const latest = seen
          ? a.value.badges.filter((badge) => !previous.includes(badge.id))
          : [];
        setNewBadge(
          latest.length
            ? `Badge earned: ${latest.map((badge) => badge.label).join(", ")}`
            : "",
        );
        await saveRewardValue(
          userId,
          "badges",
          JSON.stringify(a.value.badges.map((badge) => badge.id)),
        );
      } catch {
        /* Celebration history is optional; server achievements remain authoritative. */
      }
    }
  }, [api, userId]);
  useScreenRevalidation(load);
  async function selectGoal(key: string) {
    if (!userId || savingGoal) return;
    setSavingGoal(true);
    try {
      await saveRewardValue(userId, "goal", key);
      setGoalKey(key);
      setNotice("Reward goal saved.");
    } catch {
      setNotice("Your reward goal could not be saved. Try again.");
    } finally {
      setSavingGoal(false);
    }
  }
  async function cancelRedemption() {
    if (!cancelId || busy) return;
    setBusy(true);
    try {
      await api.cancelReward(cancelId);
      setCancelId(null);
      setNotice("Redemption canceled. Points have been returned.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Cancellation could not finish.",
      );
    } finally {
      setBusy(false);
    }
  }
  const goal = points
    ? rewardGoal(points.catalog, goalKey, points.balance)
    : null;
  return (
    <ScrollView
      style={memberScreenStyles.screen}
      contentContainerStyle={s.page}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!points}
          onRefresh={() => void load()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={s.title}>
          {section === "achievements"
            ? "Your badges"
            : section === "earn"
              ? "Earn points"
              : section === "activity"
                ? "Rewards history"
                : "Rewards"}
        </Text>
        {section !== "achievements" ? (
          <Text style={s.heading}>
            {points ? formatPoints(points.balance) : "—"}{" "}
            <Text style={s.muted}>Signal Points available</Text>
          </Text>
        ) : null}
        {points && !points.redemptionEligible ? (
          <Text style={s.muted}>
            Earn on any plan. Paid membership is required to redeem rewards.
          </Text>
        ) : null}
        {points && !points.redemptionEligible ? (
          <RewardButton
            secondary
            label="View membership"
            onPress={() => router.push("/(app)/account/membership")}
          />
        ) : null}
        {points && points.debt > 0 ? (
          <Text style={s.muted}>
            {formatPoints(points.debt)} points awaiting adjustment. New points
            first cover this amount.
          </Text>
        ) : null}
      </View>
      {newBadge ? (
        <View style={[s.card, s.row]}>
          <RewardEmblem rewardKey="medal" />
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>{newBadge}</Text>
            <Text style={s.muted}>
              View your collection to see the badge details.
            </Text>
          </View>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        {sections.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item.key }}
            onPress={() => {
              setSection(item.key);
              setNotice("");
            }}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 24,
              backgroundColor:
                section === item.key ? colors.accent : colors.surface,
            }}
          >
            <Text
              style={{
                color: section === item.key ? colors.background : colors.text,
                fontWeight: "700",
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {notice ? (
        <Text accessibilityRole="alert" style={s.text}>
          {notice}
        </Text>
      ) : null}
      {loading && !points && !achievements ? (
        <LoadingState label="Loading your rewards…" />
      ) : null}
      {section === "rewards" ? (
        <>
          {errors.points ? (
            <ErrorState message={errors.points} onRetry={() => void load()} />
          ) : null}
          {goal && points ? (
            <RewardCard>
              <Text style={s.label}>Your goal</Text>
              <Text style={s.heading}>{rewardName(goal.name)}</Text>
              <Text style={s.muted}>
                {formatPoints(points.balance)} of {formatPoints(goal.points)}{" "}
                points ·{" "}
                {formatPoints(Math.max(0, goal.points - points.balance))} to go
              </Text>
              <ProgressBar
                value={points.balance}
                target={goal.points}
                label={`Progress toward ${goal.name}`}
              />
            </RewardCard>
          ) : null}
          {points?.catalog.map((item) => {
            const soldOut = item.inventoryRemaining === 0;
            const ready =
              points.redemptionEligible &&
              !soldOut &&
              points.balance >= item.points;
            return (
              <RewardCard key={item.key}>
                <View style={s.row}>
                  <RewardEmblem rewardKey={item.key} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.heading}>{rewardName(item.name)}</Text>
                    <Text style={s.label}>
                      {formatPoints(item.points)} points
                    </Text>
                  </View>
                </View>
                <Text style={ready ? s.success : s.muted}>
                  {soldOut
                    ? "Currently unavailable"
                    : ready
                      ? "Ready to redeem"
                      : !points.redemptionEligible
                        ? "Paid membership required to redeem"
                        : `${formatPoints(Math.max(0, item.points - points.balance))} points to go`}
                </Text>
                <Text style={s.muted}>
                  {item.fulfillmentType === "physical"
                    ? item.options?.usShippingIncluded
                      ? "U.S. shipping included."
                      : "Shipping details at redemption."
                    : item.options?.membershipCredit
                      ? "For eligible directly billed memberships. Once every 12 months; Apple subscriptions are not eligible."
                      : "Delivered by email."}
                </Text>
                {ready ? (
                  <>
                    <RewardButton
                      label={`Redeem · ${formatPoints(item.points)} points`}
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/account/redeem",
                          params: { item: item.key },
                        })
                      }
                    />
                  </>
                ) : null}
                {!soldOut ? (
                  <RewardButton
                    secondary
                    label={
                      goal?.key === item.key ? "Your goal ✓" : "Set as goal"
                    }
                    disabled={savingGoal || goal?.key === item.key}
                    onPress={() => void selectGoal(item.key)}
                  />
                ) : null}
              </RewardCard>
            );
          })}
          {points && !points.catalog.length ? (
            <Text style={s.muted}>
              No rewards are available right now. Your points balance is saved.
            </Text>
          ) : null}
        </>
      ) : null}
      {section === "achievements" ? (
        <>
          {errors.achievements ? (
            <ErrorState
              message={errors.achievements}
              onRetry={() => void load()}
            />
          ) : null}
          {achievements ? (
            <BadgeCollection
              summary={achievements}
              saving={savingFeatures}
              onFeature={async (ids) => {
                setSavingFeatures(true);
                try {
                  const result = await api.saveFeaturedBadges(ids);
                  setAchievements((current) =>
                    current
                      ? {
                          ...current,
                          featuredBadgeIds: result.featuredBadgeIds,
                        }
                      : current,
                  );
                } finally {
                  setSavingFeatures(false);
                }
              }}
            />
          ) : null}
        </>
      ) : null}
      {section === "earn" ? (
        <>
          <RewardCard>
            <Text style={s.heading}>Post a sighting</Text>
            {[
              ["Standard sighting", "10 points"],
              ["Allocated bottle sighting", "20 points total"],
              ["Unicorn bottle sighting", "30 points total"],
              ["Continue a weekly streak", "+10 points per qualifying week"],
            ].map(([label, value]) => (
              <View key={label} style={s.spread}>
                <Text style={[s.text, { flex: 1 }]}>{label}</Text>
                <Text style={[s.text, { fontWeight: "700" }]}>{value}</Text>
              </View>
            ))}
            <Text style={s.muted}>
              Use the bottle and store you found. The catalog determines bottle
              rarity.
            </Text>
            <RewardButton
              label="Post a sighting"
              onPress={() => router.push("/(app)/(tabs)/post")}
            />
          </RewardCard>
          <RewardCard>
            <Text style={s.heading}>Update availability</Text>
            <Text style={s.text}>
              5 points per qualifying update · Up to 3 per day
            </Text>
            <Text style={s.muted}>
              Record “Found it” or “Gone when checked” on a retailer or
              trusted-source listing. Each listing period earns once.
            </Text>
            <RewardButton
              secondary
              label="Browse Signals"
              onPress={() => router.push("/(app)/(tabs)")}
            />
          </RewardCard>
          <RewardCard>
            <Text style={s.heading}>Badge bonuses</Text>
            <Text style={s.text}>
              Some badges award 10 bonus points. Expansion badges recognize your
              progress without adding points. Each badge’s details show its
              bonus.
            </Text>
            <RewardButton
              secondary
              label="View badges"
              onPress={() => setSection("achievements")}
            />
          </RewardCard>
          <RewardCard>
            <Text style={s.heading}>What counts</Text>
            <Text style={s.text}>
              Bottle sightings with recorded store details count toward badges.
              Community endorsement means a sighting received at least 3 upvotes
              and at least 3 more upvotes than downvotes.
            </Text>
            <RewardButton
              secondary
              label={showRules ? "Hide points rules" : "View points rules"}
              onPress={() => setShowRules(!showRules)}
            />
            {showRules ? (
              <Text style={s.muted}>
                Duplicate posts do not earn twice. Removed or rejected
                contributions can reverse points. Weekly streaks use
                Monday–Sunday weeks in the store’s time zone. The first week
                starts your streak; each consecutive qualifying week earns 10
                bonus points. Availability awards are limited to 3 new listing
                periods per UTC day, resetting at midnight UTC. Community
                self-reports and “Didn’t go” do not qualify. Withdrawing an
                update reverses its points. Redeeming rewards does not affect
                earned badges. Rejected supporting contributions can remove a
                badge.
              </Text>
            ) : null}
          </RewardCard>
          <Text style={s.heading}>Invite friends</Text>
          {errors.referral ? (
            <ErrorState message={errors.referral} onRetry={() => void load()} />
          ) : referral ? (
            <RewardCard>
              <Text style={s.heading}>
                {referral.referrals.total} joined · {formatPoints(referral.referralPoints)}{" "}
                points earned
              </Text>
              <Text style={s.text}>
                Free: {formatPoints(referral.program.pointsByTier.free)} points for the first{" "}
                {referral.program.freeAwardLimit} qualifying referrals{"\n"}
                Standard: {formatPoints(referral.program.pointsByTier.standard)} points{"\n"}
                Barrel Proof: {formatPoints(referral.program.pointsByTier.barrel)} points
                {"\n"}Founder:{" "}
                {formatPoints(referral.program.pointsByTier["bottled-in-bond"])} points
              </Text>
              <Text style={s.muted}>
                Points are based on your friend’s qualifying membership.
                {referral.program.upgradeAwardsDifferenceOnly
                  ? " If they upgrade, you receive the difference."
                  : ""}{" "}
                Sharing a link alone does not earn points.
              </Text>
              <Text style={s.muted}>
                {referral.referrals.free} Free · {referral.referrals.standard}{" "}
                Standard · {referral.referrals.barrel} Barrel Proof ·{" "}
                {referral.referrals.founder} Founder
              </Text>
              {referral.referrals.awarded !== undefined ? (
                <Text style={s.muted}>
                  {referral.referrals.awarded} referrals awarded ·{" "}
                  {Math.max(
                    0,
                    referral.referrals.total - referral.referrals.awarded,
                  )}{" "}
                  awaiting an award or outside the referral limit.
                </Text>
              ) : null}
              <Text style={s.muted}>
                Only qualifying referrals earn points.
              </Text>
              <Text selectable style={s.muted}>
                {referral.referralLink}
              </Text>
              <RewardButton
                label="Share referral link"
                onPress={() =>
                  void Share.share({
                    message: `Join me on Bourbon Signal for bottle sightings and community rewards. ${referral.referralLink}`,
                  }).catch(() =>
                    setNotice(
                      "Your referral link could not be shared. Try again.",
                    ),
                  )
                }
              />
            </RewardCard>
          ) : loading ? (
            <LoadingState label="Loading referral details…" />
          ) : null}
        </>
      ) : null}
      {section === "activity" ? (
        <>
          {errors.points ? (
            <ErrorState message={errors.points} onRetry={() => void load()} />
          ) : null}
          <Text style={s.heading}>Your redemptions</Text>
          {points && !points.redemptions.length ? (
            <Text style={s.muted}>No redemptions yet.</Text>
          ) : null}
          {points?.redemptions.map((item) => (
            <RewardCard key={item.id}>
              <Text style={s.heading}>
                {rewardName(
                  item.itemSnapshot?.name ||
                    points.catalog.find((reward) => reward.key === item.itemKey)
                      ?.name ||
                    "Reward",
                )}
              </Text>
              <Text style={s.text}>{redemptionLabel(item.status)}</Text>
              <Text style={s.muted}>
                {item.pointsSpent} points ·{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              {item.trackingNumber ? (
                <Text selectable style={s.text}>
                  {item.carrier} · {item.trackingNumber}
                </Text>
              ) : null}
              {[
                "reserved",
                "details_required",
                "submitted",
                "approved",
              ].includes(item.status) ? (
                cancelId === item.id ? (
                  <>
                    <Text style={s.text}>
                      Cancel this redemption and return its points?
                    </Text>
                    <RewardButton
                      label={busy ? "Canceling…" : "Confirm cancellation"}
                      disabled={busy}
                      onPress={() => void cancelRedemption()}
                    />
                    <RewardButton
                      label="Keep reward"
                      secondary
                      disabled={busy}
                      onPress={() => setCancelId(null)}
                    />
                  </>
                ) : (
                  <RewardButton
                    label="Cancel redemption"
                    secondary
                    onPress={() => setCancelId(item.id)}
                  />
                )
              ) : null}
            </RewardCard>
          ))}
          <Text style={s.heading}>Points activity</Text>
          <Text style={s.muted}>
            Your latest 50 transactions. Awards, spending, and adjustments are
            recorded here.
          </Text>
          {points?.activity === undefined ? (
            <Text style={s.muted}>
              Points activity is temporarily unavailable. Pull down to refresh.
            </Text>
          ) : !points.activity.length ? (
            <Text style={s.muted}>No points activity yet.</Text>
          ) : (
            points.activity.map((entry) => (
              <RewardCard key={entry.id}>
                <View style={s.spread}>
                  <Text style={s.heading}>{activityLabel(entry)}</Text>
                  <Text style={entry.points > 0 ? s.success : s.text}>
                    {entry.points > 0 ? "+" : ""}
                    {entry.points} points
                  </Text>
                </View>
                <Text style={s.muted}>
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.debtDelta
                    ? ` · ${Math.abs(entry.debtDelta)} points ${entry.debtDelta < 0 ? "settled an adjustment" : "pending adjustment"}`
                    : ""}
                </Text>
              </RewardCard>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

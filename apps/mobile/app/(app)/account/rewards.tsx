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
  nextAchievements,
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
import { colors } from "../../../src/theme";

type Section = "rewards" | "achievements" | "earn" | "activity";
const sections: Array<{ key: Section; label: string }> = [
  { key: "rewards", label: "Rewards" },
  { key: "achievements", label: "Achievements" },
  { key: "earn", label: "Earn points" },
  { key: "activity", label: "Activity" },
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
            ? `Achievement unlocked: ${latest.map((badge) => badge.label).join(", ")}`
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
      setNotice("Reward goal saved on this device.");
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
      {section !== "achievements" ? (      <View style={[s.card, s.hero]}>
        <Text style={s.label}>YOUR CONTRIBUTIONS COUNT</Text>
        <Text style={[s.title, { fontSize: 38 }]}>
          {points ? points.balance : "—"}{" "}
          <Text style={s.muted}>Signal Points</Text>
        </Text>
        <Text style={s.muted}>
          Share useful finds. Build your reputation. Earn something worth
          keeping.
        </Text>
        {points && !points.redemptionEligible ? (
          <>
            <Text style={s.text}>
              Earn points and achievements on any plan. Paid membership is
              required to redeem rewards.
            </Text>
            <RewardButton
              label="Explore membership"
              secondary
              onPress={() => router.push("/(app)/account/membership")}
            />
          </>
        ) : null}
        {points && points.debt > 0 ? (
          <Text style={s.muted}>
            {points.debt} points under adjustment. Future earnings settle this
            before adding to your available balance.
          </Text>
        ) : null}
      </View>
) : <View style={{gap:6}}><Text style={s.title}>Your achievements</Text><Text style={s.muted}>Built by helping the community.</Text></View>}
      {newBadge ? (
        <View style={[s.card, s.row]}>
          <RewardEmblem rewardKey="medal" />
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>{newBadge}</Text>
            <Text style={s.muted}>
              Your contributions are making a difference.
            </Text>
          </View>
        </View>
      ) : null}
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
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
              paddingHorizontal: 14,
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
      </View>
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
              <Text style={s.label}>YOUR REWARD GOAL</Text>
              <Text style={s.heading}>
                {goal.name.replace(/^Bourbon Signal /, "")}
              </Text>
              <Text style={s.muted}>
                {points.balance} / {goal.points} points ·{" "}
                {Math.max(0, goal.points - points.balance)} to go
              </Text>
              <ProgressBar
                value={points.balance}
                target={goal.points}
                label={`Progress toward ${goal.name}`}
              />
              <Text style={s.muted}>
                Choose any available reward below as your goal. Redeeming
                another reward reduces this balance.
              </Text>
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
                    <Text style={s.heading}>
                      {item.name.replace(/^Bourbon Signal /, "")}
                    </Text>
                    <Text style={s.label}>{item.points} POINTS</Text>
                  </View>
                </View>
                <Text style={ready ? s.success : s.muted}>
                  {soldOut
                    ? "Currently unavailable"
                    : ready
                      ? "Ready to redeem"
                      : !points.redemptionEligible
                        ? "Paid membership required to redeem"
                        : `${item.points - points.balance} more points needed`}
                </Text>
                <Text style={s.muted}>
                  {item.fulfillmentType === "physical"
                    ? item.options?.usShippingIncluded
                      ? "U.S. shipping included · address reviewed before redemption"
                      : "Physical reward · review shipping before redemption"
                    : item.options?.membershipCredit
                      ? "For eligible directly billed memberships. Once every 12 months; Apple subscriptions are not eligible."
                      : "Digital delivery to your verified account email"}
                </Text>
                {ready ? (
                  <>
                    <Text style={s.muted}>
                      {points.balance - item.points} points remaining after
                      redemption
                      {goal && goal.key !== item.key
                        ? ` · ${Math.max(0, goal.points - (points.balance - item.points))} then needed for your goal`
                        : ""}
                      .
                    </Text>
                    <RewardButton
                      label={`Redeem for ${item.points} points`}
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
                      goalKey === item.key
                        ? "Your selected goal"
                        : "Save toward this"
                    }
                    disabled={savingGoal || goalKey === item.key}
                    onPress={() => void selectGoal(item.key)}
                  />
                ) : null}
              </RewardCard>
            );
          })}
          {points && !points.catalog.length ? (
            <Text style={s.muted}>
              The reward catalog is temporarily empty. Your points are still
              yours.
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
            <>
              <RewardCard>
                <View style={s.spread}>
                  <Text style={s.heading}>
                    {achievements.badges.length} badges earned
                  </Text>
                  <Text style={s.label}>
                    {achievements.currentWeeklyStreak}-WEEK STREAK
                  </Text>
                </View>
                <Text style={s.muted}>
                  {achievements.eligibleSightings} eligible sightings ·{" "}
                  {achievements.helpfulSightings} helpful sightings · Best
                  streak: {achievements.longestWeeklyStreak} weeks
                </Text>
                <Text style={s.text}>
                  Your badges stay separate from your spendable points.
                  Redeeming a reward never spends your achievements.
                </Text>
                <RewardButton
                  label="Post a sighting"
                  onPress={() => router.push("/(app)/(tabs)/post")}
                />
              </RewardCard>
              <Text style={s.heading}>Earned collection</Text>
              {!achievements.badges.length ? (
                <Text style={s.muted}>
                  Your first badge starts with a useful bottle sighting. Add the
                  exact store and what you found.
                </Text>
              ) : null}
              {achievements.badges.map((badge) => (
                <RewardCard key={badge.id}>
                  <View style={s.row}>
                    <RewardEmblem rewardKey={badge.id} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.heading}>{badge.label}</Text>
                      <Text style={s.label}>
                        {badge.tier ? `${badge.tier.toUpperCase()} · ` : ""}
                        EARNED
                      </Text>
                      <Text style={s.muted}>
                        {new Date(badge.earnedAt).toLocaleDateString()} ·{" "}
                        {badge.pointsAwarded} points awarded
                      </Text>
                    </View>
                  </View>
                </RewardCard>
              ))}
              <Text style={s.heading}>Your next achievements</Text>
              {nextAchievements(achievements).map((badge) => (
                <RewardCard key={badge.id}>
                  <View style={s.row}>
                    <RewardEmblem rewardKey={badge.id} earned={false} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.heading}>{badge.label}</Text>
                      <Text style={s.muted}>
                        {badge.tier ? `${badge.tier} · ` : ""}
                        {badge.current} / {badge.target}
                      </Text>
                    </View>
                  </View>
                  <ProgressBar
                    value={badge.current}
                    target={badge.target}
                    label={`${badge.label} ${badge.tier || ""}`}
                  />
                  <Text style={s.muted}>
                    {badge.description ||
                      "Contribute eligible sightings to progress toward this badge."}
                  </Text>
                </RewardCard>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {section === "earn" ? (
        <>
          <RewardCard>
            <Text style={s.heading}>Make the next hunt better</Text>
            <Text style={s.text}>
              Eligible sighting: 10 points{"\n"}Allocated bottle: 20 points
              {"\n"}Unicorn bottle: 30 points{"\n"}New achievement: 10 points
              {"\n"}Continue a weekly streak: 10 points
            </Text>
            <Text style={s.muted}>
              Use the exact bottle and store. Bottle rarity comes from the
              catalog. Duplicate posts do not earn twice; removed or rejected
              contributions can reverse points. A streak continues with at least
              one eligible sighting in consecutive weeks.
            </Text>
            <RewardButton
              label="Post a sighting"
              onPress={() => router.push("/(app)/(tabs)/post")}
            />
          </RewardCard>
          <RewardCard>
            <Text style={s.heading}>Keep availability useful</Text>
            <Text style={s.text}>
              Earn 5 points for a first-hand “Found it” or “Gone when checked”
              update on retailer or trusted-source availability.
            </Text>
            <Text style={s.muted}>
              Up to 3 new qualifying episodes per UTC day. Repeated updates to
              the same episode do not earn again. “Didn’t go,” removed updates,
              and community self-reports do not qualify. Open a bottle’s Signal
              to record what happened.
            </Text>
            <RewardButton
              secondary
              label="Browse Signals"
              onPress={() => router.push("/(app)/(tabs)")}
            />
          </RewardCard>
          <RewardCard>
            <Text style={s.heading}>Quality earns recognition</Text>
            <Text style={s.text}>
              Attach a useful photo for Photo Finish. Helpful Neighbor starts
              when a sighting receives at least 3 upvotes and a net score of at
              least 3.
            </Text>
            <Text style={s.muted}>
              Report only what you can support. Helpful updates and accurate
              store details give other members better information.
            </Text>
            <RewardButton
              secondary
              label="View achievement goals"
              onPress={() => setSection("achievements")}
            />
          </RewardCard>
          <Text style={s.heading}>Invite friends</Text>
          {errors.referral ? (
            <ErrorState message={errors.referral} onRetry={() => void load()} />
          ) : referral ? (
            <RewardCard>
              <Text style={s.heading}>
                {referral.referrals.total} joined · {referral.referralPoints}{" "}
                points earned
              </Text>
              <Text style={s.text}>
                Free: {referral.program.pointsByTier.free} points for the first{" "}
                {referral.program.freeAwardLimit} qualifying referrals{"\n"}
                Standard: {referral.program.pointsByTier.standard} points{"\n"}
                Barrel Proof: {referral.program.pointsByTier.barrel} points
                {"\n"}Founder:{" "}
                {referral.program.pointsByTier["bottled-in-bond"]} points
              </Text>
              <Text style={s.muted}>
                Points follow the referred member’s qualifying membership.
                {referral.program.upgradeAwardsDifferenceOnly
                  ? " Upgrades award only the difference."
                  : ""}{" "}
                Sharing a link alone does not earn points.
              </Text>
              <Text style={s.muted}>
                {referral.referrals.free} Free · {referral.referrals.standard}{" "}
                Standard · {referral.referrals.barrel} Barrel Proof ·{" "}
                {referral.referrals.founder} Founder
              </Text>
              {referral.referrals.awarded !== undefined ? <Text style={s.muted}>{referral.referrals.awarded} referrals awarded · {Math.max(0,referral.referrals.total-referral.referrals.awarded)} joined without a point award. Free referral limits and qualification rules apply.</Text> : null}
                <Text style={s.muted}>Joined → qualifying membership → points awarded. Undelivered invitations are not counted.</Text>
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
            <Text style={s.muted}>
              No redemptions yet. Your next reward starts in the catalog.
            </Text>
          ) : null}
          {points?.redemptions.map((item) => (
            <RewardCard key={item.id}>
              <Text style={s.heading}>
                {item.itemSnapshot?.name ||
                  points.catalog.find((reward) => reward.key === item.itemKey)
                    ?.name ||
                  "Reward"}
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
            <Text style={s.muted}>
              No points activity yet. Post your first useful sighting to get
              started.
            </Text>
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

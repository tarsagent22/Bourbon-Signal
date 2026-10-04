import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { AchievementSummary } from "../api/types";
import { badgeCatalog } from "./badge-catalog";
import {
  badgeDate,
  badgeFamily,
  canonicalBadgeId,
  earnedDescription,
  nextAchievements,
  tierLabel,
} from "./reward-model";
import {
  ProgressBar,
  RewardButton,
  RewardCard,
  RewardEmblem,
  rewardStyles as s,
} from "./RewardUI";
import { colors } from "../theme";
type Progress = AchievementSummary["badgeProgress"][number];
type Award = AchievementSummary["badges"][number];
const categoryNames = [
  "All",
  "Sightings",
  "Community",
  "Exploration",
  "Consistency",
  "Legacy",
];
export function BadgeCollection({
  summary,
  onFeature,
  saving,
}: {
  summary: AchievementSummary;
  onFeature: (ids: string[]) => Promise<void>;
  saving: boolean;
}) {
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const featured = summary.featuredBadgeIds || [];
  const definition = (id: string) =>
    badgeCatalog.find((item) => item.id === badgeFamily(id));
  const progressFor = (id: string) =>
    summary.badgeProgress.filter(
      (item) => badgeFamily(item.id) === badgeFamily(id),
    );
  const awardFor = (id: string) =>
    summary.badges.find(
      (item) => canonicalBadgeId(item.id) === canonicalBadgeId(id),
    );
  const earnedFamilies = [
    ...new Set(summary.badges.map((item) => badgeFamily(item.id))),
  ];
  const legacy = earnedFamilies.filter((id) => !definition(id));
  const families = [...badgeCatalog.map((item) => item.id), ...legacy];
  const selectedProgress = selected ? progressFor(selected) : [];
  const selectedAwards = selected
    ? summary.badges.filter(
        (item) => badgeFamily(item.id) === badgeFamily(selected),
      )
    : [];
  const selectedDefinition = selected ? definition(selected) : undefined;
  const selectedTitle =
    selectedDefinition?.name || selectedAwards[0]?.label || "Badge details";
  const visible = families.filter(
    (id) =>
      category === "All" || (definition(id)?.category || "Legacy") === category,
  );
  async function toggleFeature(award: Award) {
    const next = featured.includes(award.id)
      ? featured.filter((id) => id !== award.id)
      : [...featured, award.id];
    if (next.length > 3) {
      setMessage(
        "Choose up to 3 featured badges. Remove one before adding another.",
      );
      return;
    }
    try {
      await onFeature(next);
      setMessage(
        next.includes(award.id)
          ? "Badge featured on your community posts."
          : "Badge removed from your featured collection.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Featured badges could not be saved.",
      );
    }
  }
  function tile(id: string) {
    const progress = progressFor(id);
    const earned = progress.filter((item) => item.earned).at(-1);
    const next = progress.find((item) => !item.earned);
    const award = earned
      ? awardFor(earned.id)
      : summary.badges.filter((item) => badgeFamily(item.id) === id).at(-1);
    const current = earned || next;
    const name = definition(id)?.name || award?.label || id;
    const isFeatured = summary.badges.some(
      (item) => badgeFamily(item.id) === id && featured.includes(item.id),
    );
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${award ? `${tierLabel(award.tier)} earned` : `${next?.current || 0} of ${next?.target || 1} ${next?.unit || "sightings"}`}. View badge details`}
        onPress={() => {
          setSelected(id);
          setMessage("");
        }}
        style={{
          flexBasis: "47%",
          flexGrow: 1,
          minWidth: 125,
          padding: 14,
          gap: 9,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: award ? colors.accent : colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <RewardEmblem
          rewardKey={current?.id || award?.id || id}
          earned={!!award}
          tier={award?.tier}
        />
        <Text style={[s.heading, { fontSize: 16, lineHeight: 21 }]}>
          {name}
        </Text>
        <Text style={award ? s.label : s.muted}>
          {award
            ? `${tierLabel(award.tier)} · Earned`
            : `${next?.current || 0} of ${next?.target || 1} ${next?.unit || "sightings"}`}
        </Text>
        {award ? (
          <>
            <Text style={s.muted}>
              {earnedDescription(
                earned?.description || "Earned in the original badge program.",
              )}
            </Text>
            <Text style={s.muted}>Earned {badgeDate(award.earnedAt)}</Text>
          </>
        ) : next ? (
          <ProgressBar
            value={next.current}
            target={next.target}
            label={`Progress toward ${name}`}
          />
        ) : null}
        {isFeatured ? <Text style={s.label}>Featured ★</Text> : null}
      </Pressable>
    );
  }
  return (
    <>
      <RewardCard>
        <View style={[s.spread, { alignItems: "flex-start" }]}>
          {[
            ["Badges earned", summary.badges.length],
            [
              "Current streak",
              `${summary.currentWeeklyStreak} ${summary.currentWeeklyStreak === 1 ? "week" : "weeks"}`,
            ],
            [
              "Best streak",
              `${summary.longestWeeklyStreak} ${summary.longestWeeklyStreak === 1 ? "week" : "weeks"}`,
            ],
          ].map(([label, value]) => (
            <View key={label} style={{ gap: 5, minWidth: 90 }}>
              <Text style={s.muted}>{label}</Text>
              <Text style={s.heading}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={s.muted}>
          {summary.eligibleSightings} sightings counted ·{" "}
          {summary.helpfulSightings} marked helpful
        </Text>
      </RewardCard>
      {summary.metricsAvailable === false ? (
        <Text style={s.muted}>
          Availability and referral progress is temporarily unavailable. Your
          earned badges are still shown.
        </Text>
      ) : null}
      <Text style={s.heading}>Next to earn</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
      >
        {nextAchievements(summary)
          .slice(0, 3)
          .map((badge) => (
            <Pressable
              key={badge.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${badge.label} badge details`}
              onPress={() => {
                setSelected(badgeFamily(badge.id));
                setMessage("");
              }}
              style={{
                width: 235,
                padding: 14,
                gap: 10,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View style={s.row}>
                <RewardEmblem rewardKey={badge.id} earned={false} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={[s.heading, { fontSize: 16, lineHeight: 21 }]}>
                    {badge.label}
                  </Text>
                  <Text style={s.muted}>
                    {tierLabel(badge.tier)} · {badge.current} of {badge.target}
                  </Text>
                </View>
              </View>
              <ProgressBar
                value={badge.current}
                target={badge.target}
                label={`Progress toward ${badge.label}`}
              />
              <Text style={s.muted}>
                {badge.target - badge.current}{" "}
                {badge.target - badge.current === 1
                  ? badge.unit?.replace(/s$/u, "")
                  : badge.unit || "sightings"}{" "}
                to earn {badge.tier ? tierLabel(badge.tier) : "this badge"}
              </Text>
            </Pressable>
          ))}
      </ScrollView>
      <Text style={s.heading}>Your badges</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        accessibilityRole="tablist"
      >
        {categoryNames
          .filter((name) => name !== "Legacy" || legacy.length)
          .map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: category === name }}
              onPress={() => setCategory(name)}
              style={{
                minHeight: 44,
                padding: 12,
                borderRadius: 22,
                backgroundColor:
                  category === name ? colors.accent : colors.surface,
              }}
            >
              <Text
                style={{
                  color: category === name ? colors.background : colors.text,
                  fontWeight: "700",
                }}
              >
                {name}
              </Text>
            </Pressable>
          ))}
      </ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {visible.map(tile)}
      </View>
      <Text style={s.muted}>
        Tap a badge to see its requirements and milestones. You can feature up
        to 3 earned badges on your community posts.
      </Text>
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,.75)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              maxHeight: "90%",
              width: "100%",
              maxWidth: 560,
              alignSelf: "center",
              borderRadius: 24,
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityViewIsModal
          >
            <View
              style={[
                s.spread,
                {
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Text accessibilityRole="header" style={[s.title, { flex: 1 }]}>
                {selectedTitle}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close badge details"
                onPress={() => setSelected(null)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.accent, fontWeight: "700" }}>
                  Close
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ padding: 20, gap: 18 }}
            >
              <RewardEmblem
                rewardKey={selected || "medal"}
                earned={!!selectedAwards.length}
                tier={selectedAwards.at(-1)?.tier}
              />
              {selectedDefinition ? (
                <Text style={s.text}>{selectedDefinition.rules}</Text>
              ) : (
                <Text style={s.text}>
                  This badge was earned in the original program. It remains in
                  your collection; new milestones use the current badge
                  families.
                </Text>
              )}
              {selectedProgress.map((progress) => {
                const award = awardFor(progress.id);
                return (
                  <RewardCard key={progress.id}>
                    <Text style={s.heading}>{tierLabel(progress.tier)}</Text>
                    <Text style={s.text}>
                      {award
                        ? earnedDescription(progress.description || "")
                        : progress.description}
                    </Text>
                    <Text style={s.muted}>
                      {progress.current} of {progress.target}{" "}
                      {progress.unit || "sightings"}
                      {progress.context ? ` · ${progress.context}` : ""}
                    </Text>
                    <ProgressBar
                      value={progress.current}
                      target={progress.target}
                      label={`${selectedTitle} ${tierLabel(progress.tier)}`}
                    />
                    <Text style={s.muted}>
                      {award
                        ? `Earned ${badgeDate(award.earnedAt)}`
                        : "Not earned yet"}{" "}
                      ·{" "}
                      {(award?.pointsAwarded ?? progress.pointsAwarded ?? 0) > 0
                        ? `${award?.pointsAwarded ?? progress.pointsAwarded} bonus points`
                        : "Recognition badge"}
                    </Text>
                    {award ? (
                      <RewardButton
                        secondary
                        label={
                          featured.includes(award.id)
                            ? "Remove featured badge"
                            : "Feature this badge"
                        }
                        disabled={saving}
                        onPress={() => void toggleFeature(award)}
                      />
                    ) : null}
                  </RewardCard>
                );
              })}
              {!selectedProgress.length
                ? selectedAwards.map((award) => (
                    <RewardCard key={award.id}>
                      <Text style={s.heading}>
                        {tierLabel(award.tier)} · Earned
                      </Text>
                      <Text style={s.muted}>
                        Earned {badgeDate(award.earnedAt)} ·{" "}
                        {award.pointsAwarded} bonus points
                      </Text>
                      <RewardButton
                        secondary
                        label={
                          featured.includes(award.id)
                            ? "Remove featured badge"
                            : "Feature this badge"
                        }
                        disabled={saving}
                        onPress={() => void toggleFeature(award)}
                      />
                    </RewardCard>
                  ))
                : null}
              {message ? (
                <Text accessibilityRole="alert" style={s.text}>
                  {message}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { badgeCatalog } from "./badge-catalog";
import { communityLeaderBadge } from "../../../../shared/community-leader-badges";
import { badgeFamily } from "./reward-model";
import { colors, fonts, typeScale, layout, typography } from "../theme";

export const rewardStyles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 44, gap: 20 },
  card: {
    padding: 20,
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: typeScale.title, lineHeight: 40, fontWeight: "700" },
  heading: { color: colors.text, ...typography.section },
  text: { color: colors.text, fontSize: typeScale.input, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: typeScale.body, lineHeight: 21 },
  label: {
    color: colors.accent,
    fontSize: typeScale.caption,
    letterSpacing: 1.5,
    fontWeight: "800",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: colors.background,
    padding: 12,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  success: { color: colors.success, fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    color: colors.background,
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
  line: { height: 1, backgroundColor: colors.border },
});
export function RewardButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        rewardStyles.button,
        secondary && rewardStyles.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text
        style={[rewardStyles.buttonText, secondary && { color: colors.accent }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function ProgressBar({
  value,
  target,
  label,
}: {
  value: number;
  target: number;
  label: string;
}) {
  const percent = Math.round(
    Math.max(0, Math.min(1, value / Math.max(1, target))) * 100,
  );
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{
        height: 7,
        borderRadius: 6,
        backgroundColor: colors.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 7,
          width: `${percent}%`,
          backgroundColor: colors.accent,
          borderRadius: 6,
        }}
      />
    </View>
  );
}
export function RewardCard({ children }: { children: ReactNode }) {
  return <View style={rewardStyles.card}>{children}</View>;
}
type Icon = ComponentProps<typeof MaterialCommunityIcons>["name"];
const rewardImages: Record<string, number> = {
  rocks_glass: require("../../assets/rewards/rocks-glass.png"),
  glencairn: require("../../assets/rewards/glencairn.png"),
  sticker_pack: require("../../assets/rewards/sticker-pack.png"),
};
export function RewardEmblem({
  rewardKey,
  earned = true,
  tier,
}: {
  rewardKey: string;
  earned?: boolean;
  tier?: string;
}) {
  const definition = badgeCatalog.find(
    (item) => item.id === badgeFamily(rewardKey),
  );
  const icon: Icon =
    (communityLeaderBadge(rewardKey)?.icon as Icon) || (definition?.icon as Icon) ||
    (rewardKey.includes("gift")
      ? "credit-card-outline"
      : rewardKey.includes("credit")
        ? "calendar-star"
        : rewardKey.includes("coaster")
          ? "circle-double"
          : rewardKey.includes("clean")
            ? "shield-check-outline"
            : rewardKey.includes("sharp")
              ? "eye-outline"
              : "medal-outline");
  const tint = earned
    ? tier === "silver"
      ? "#D2D5D9"
      : tier === "bronze"
        ? "#CC956B"
        : colors.accent
    : colors.muted;
  return (
    <View
      accessible={false}
      style={{
        width: 62,
        height: 62,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: earned ? "#322719" : colors.background,
        borderWidth: 1,
        borderColor: earned ? tint : colors.border,
      }}
    >
      {rewardImages[rewardKey] ? (
        <Image
          source={rewardImages[rewardKey]}
          style={{ width: 38, height: 42, tintColor: tint }}
          resizeMode="contain"
        />
      ) : (
        <MaterialCommunityIcons name={icon} size={32} color={tint} />
      )}
    </View>
  );
}

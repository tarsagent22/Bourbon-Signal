import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export const rewardStyles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 44, gap: 20 },
  card: {
    padding: 20,
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  heading: { color: colors.text, fontSize: 19, fontWeight: "800" },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: {
    color: colors.accent,
    fontSize: 11,
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
export function RewardEmblem({
  rewardKey,
  earned = true,
}: {
  rewardKey: string;
  earned?: boolean;
}) {
  const icon: Icon =
    rewardKey.includes("glass") || rewardKey.includes("glencairn")
      ? "glass-cocktail"
      : rewardKey.includes("sticker")
        ? "sticker-circle-outline"
        : rewardKey.includes("coaster")
          ? "circle-double"
          : rewardKey.includes("gift")
            ? "gift-outline"
            : rewardKey.includes("credit")
              ? "calendar-star"
              : rewardKey.includes("photo")
                ? "camera-outline"
                : rewardKey.includes("streak")
                  ? "fire"
                  : rewardKey.includes("local")
                    ? "map-marker-star-outline"
                    : rewardKey.includes("helpful") ||
                        rewardKey.includes("sharp")
                      ? "hand-heart-outline"
                      : "medal-outline";
  return (
    <View
      accessible={false}
      style={{
        width: 62,
        height: 62,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: earned ? "#322719" : colors.background,
        borderWidth: 1,
        borderColor: earned ? colors.accent : colors.border,
      }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={32}
        color={earned ? colors.accent : colors.muted}
      />
    </View>
  );
}

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View } from "react-native";
import type { MarketSummary } from "../api/types";
import { colors } from "../theme";

function bottleList(names: string[]) {
  if (names.length < 2) return names[0] || "Allocated and limited bottles";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function MarketSummaryCard({ summary }: { summary: MarketSummary }) {
  return (
    <View accessibilityLabel={`${summary.areaLabel} had ${summary.signalCount} Signals this week. Bottles included ${bottleList(summary.bottleNames)}.`} style={styles.card}>
      <View style={styles.topline}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons color={colors.accent} name="radio-tower" size={20} />
        </View>
        <View style={styles.areaBlock}>
          <Text numberOfLines={1} style={styles.area}>{summary.areaLabel}</Text>
          <Text style={styles.week}>THIS WEEK</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.count}>{summary.signalCount}</Text>
          <Text style={styles.countLabel}>SIGNALS</Text>
        </View>
      </View>
      <Text style={styles.bottles}>Bottles included {bottleList(summary.bottleNames)}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    gap: 13,
  },
  topline: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  areaBlock: { flex: 1, gap: 2 },
  area: { color: colors.text, fontSize: 18, lineHeight: 22, fontWeight: "800" },
  week: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  countPill: { minWidth: 58, alignItems: "center", backgroundColor: "#2C2115", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7 },
  count: { color: colors.accent, fontSize: 18, lineHeight: 19, fontWeight: "900" },
  countLabel: { color: colors.accent, fontSize: 8, fontWeight: "800", letterSpacing: 0.75 },
  bottles: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: "600" },
});

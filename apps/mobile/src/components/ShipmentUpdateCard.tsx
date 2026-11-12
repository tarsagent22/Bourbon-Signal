import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import { relativeSignalTime } from "../api/presentation";
import { useReportClock } from "../hooks/useReportClock";
import { nearestMappedBoardMember } from "../nearby/map-feed";
import { colors, fonts } from "../theme";

export function ShipmentUpdateCard({ signal, owner, onPress }: { signal: Signal; owner: object; onPress: () => void }) {
  const now = useReportClock();
  const bottles = signal.shipmentUpdate?.bottles || [];
  const names = bottles.slice(0, 3).map(bottle => bottle.name).join(", ");
  const extra = bottles.length - 3;
  const distance = nearestMappedBoardMember(owner, signal.shipment?.boardId);
  const tiers = (["unicorn", "allocated", "limited"] as const).flatMap(tier => {
    const count = bottles.filter(bottle => bottle.tier === tier).length;
    return count ? [count + " " + tier] : [];
  }).join(" · ");
  const age = relativeSignalTime(signal.shipment?.reportedAt || signal.timing.displayAt, now);
  return <Pressable accessibilityRole="button" accessibilityHint="Opens the shipment and stores in this ABC area" onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.75 }]}>
    <MaterialCommunityIcons name="package-variant-closed" color={colors.accent} size={24} />
    <View style={s.copy}>
      <Text style={s.label}>ABC shipment update</Text>
      <Text style={s.title}>{signal.location.label || "ABC area"}</Text>
      <Text style={s.meta}>{[age && "Reported " + age, distance != null && "Nearest member store " + Math.round(distance) + " mi"].filter(Boolean).join(" · ")}</Text>
      <Text numberOfLines={2} style={s.names}>{names}{extra > 0 ? " +" + extra + " more" : ""}</Text>
      {tiers ? <Text style={s.label}>{tiers}</Text> : null}
      <Text style={s.meta}>Receiving stores unconfirmed</Text>
    </View>
    <MaterialCommunityIcons name="chevron-right" color={colors.accent} size={20} />
  </Pressable>;
}

const s = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 10, gap: 10, backgroundColor: colors.surface, borderRadius: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  label: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 19, lineHeight: 24 },
  names: { color: colors.text, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});

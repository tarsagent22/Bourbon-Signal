import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import { presentSignal, relativeSignalTime, signalAccessibilityLabel, signalLocationLabel, signalStatusLabel } from "../api/presentation";
import { colors } from "../theme";

function trustLabel(signal: Signal) {
  if (signal.source.type === "member") return signal.source.actor?.label || signal.source.label;
  if (signal.evidence.retailerReported) return "Retailer reported";
  if (signal.evidence.sourceBacked) return "Source-backed";
  return signal.source.label;
}

export function SignalCard({ signal, onPress }: { signal: Signal; onPress: () => void }) {
  const presented = presentSignal(signal);
  const details = [presented.price, presented.quantity].filter(Boolean).join(" · ");
  const status = signalStatusLabel(signal, presented.availability);
  const location = signalLocationLabel(signal, presented.location);
  const availableNow = signal.availability?.status === "available_now";

  return (
    <Pressable
      accessibilityHint="Opens Signal details"
      accessibilityLabel={signalAccessibilityLabel(signal)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topline}>
        <View style={[styles.statusPill, availableNow && styles.availablePill]}>
          <Text style={[styles.statusText, availableNow && styles.availableText]}>{status}</Text>
        </View>
        <Text style={styles.time}>{relativeSignalTime(signal.timing.displayAt)}</Text>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.content}>
          <Text numberOfLines={2} style={styles.bottle}>{signal.bottle.name}</Text>
          <Text numberOfLines={2} style={styles.location}>{location}</Text>
          {details ? <Text style={styles.details}>{details}</Text> : null}
          {presented.summary ? <Text numberOfLines={2} style={styles.note}>{presented.summary}</Text> : null}
          <View style={styles.trustRow}>
            <MaterialCommunityIcons
              color={colors.muted}
              name={signal.source.type === "member" ? "account-outline" : "shield-check-outline"}
              size={15}
            />
            <Text style={styles.trust}>{trustLabel(signal)}</Text>
          </View>
        </View>
        <MaterialCommunityIcons color={colors.muted} name="chevron-right" size={22} />
      </View>
    </Pressable>
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
  pressed: { backgroundColor: colors.surfaceRaised, transform: [{ scale: 0.992 }] },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusPill: { backgroundColor: colors.surfaceRaised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  availablePill: { backgroundColor: "#173122" },
  statusText: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 0.35 },
  availableText: { color: "#9BD6A5" },
  time: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  contentRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  content: { flex: 1, gap: 6 },
  bottle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "800" },
  location: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  details: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  trust: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});

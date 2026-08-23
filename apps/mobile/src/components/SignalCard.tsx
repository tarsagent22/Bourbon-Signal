import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import {
  presentSignal,
  relativeSignalTime,
  signalAccessibilityLabel,
  signalCardStatusLabel,
  signalCardSummary,
  signalLocationLabel,
} from "../api/presentation";
import { colors } from "../theme";

export function SignalCard({ signal, onPress }: { signal: Signal; onPress: () => void }) {
  const presented = presentSignal(signal);
  const status = signalCardStatusLabel(signal);
  const summary = signalCardSummary(signal);
  const location = signalLocationLabel(signal, presented.location);
  const availableNow = signal.availability?.status === "available_now";
  const upcoming = signal.availability?.status === "upcoming"
    || (!signal.availability && (signal.kind === "release" || signal.kind === "event"));

  return (
    <Pressable
      accessibilityHint="Opens Signal details"
      accessibilityLabel={signalAccessibilityLabel(signal)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topline}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, availableNow && styles.availableDot, upcoming && styles.upcomingDot]} />
          <Text style={[styles.status, availableNow && styles.availableStatus]}>{status}</Text>
        </View>
        <Text style={styles.time}>{relativeSignalTime(signal.timing.displayAt)}</Text>
      </View>

      <Text numberOfLines={2} style={styles.bottle}>{signal.bottle.name}</Text>
      <Text numberOfLines={2} style={styles.location}>{location}</Text>

      {presented.price || presented.quantity ? (
        <View style={styles.metaRow}>
          {presented.price ? <Text style={styles.price}>{presented.price}</Text> : null}
          {presented.price && presented.quantity ? <View style={styles.metaDivider} /> : null}
          {presented.quantity ? <Text style={styles.quantity}>{presented.quantity}</Text> : null}
        </View>
      ) : null}

      {summary ? <Text numberOfLines={2} style={styles.note}>{summary}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 7,
  },
  pressed: { backgroundColor: colors.surfaceRaised, opacity: 0.94 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 1 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  availableDot: { backgroundColor: colors.success },
  upcomingDot: { backgroundColor: colors.accent },
  status: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "700", letterSpacing: 0.2 },
  availableStatus: { color: colors.success },
  time: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  bottle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2 },
  location: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  metaRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 1 },
  metaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  price: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  quantity: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 1 },
});

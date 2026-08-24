import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import {
  presentSignal,
  relativeSignalTime,
  signalAccessibilityLabel,
  signalAvailabilityIsCurrent,
  signalAvailabilityRefreshAt,
  signalCardStatusLabel,
  signalCardSummary,
  signalCardAppearance,
  signalLocationLabel,
  signalReporterAttribution,
} from "../api/presentation";
import { colors } from "../theme";

export function SignalCard({ signal, onPress }: { signal: Signal; onPress: () => void }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refreshAt = signalAvailabilityRefreshAt(signal, now);
    if (!refreshAt) return undefined;

    let timer: ReturnType<typeof setTimeout>;
    const scheduleRefresh = () => {
      const remaining = refreshAt - Date.now();
      if (remaining <= 0) {
        setNow(new Date());
        return;
      }
      timer = setTimeout(scheduleRefresh, Math.min(remaining + 50, 2_147_483_647));
    };
    scheduleRefresh();
    return () => clearTimeout(timer);
  }, [signal.id, signal.timing.displayAt, signal.timing.expiresAt, signal.availability?.status, now]);

  const presented = presentSignal(signal);
  const status = signalCardStatusLabel(signal, now);
  const summary = signalCardSummary(signal);
  const location = signalLocationLabel(signal, presented.location);
  const appearance = signalCardAppearance(signal);
  const reporter = signalReporterAttribution(signal);
  const availableNow = signal.source.type !== "member" && signalAvailabilityIsCurrent(signal, now);
  const upcoming = status === "Upcoming"
    || signal.availability?.status === "upcoming"
    || (!signal.availability && (signal.kind === "release" || signal.kind === "event"));

  return (
    <Pressable
      accessibilityHint="Opens Signal details"
      accessibilityLabel={signalAccessibilityLabel(signal, now)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: appearance.surface, borderColor: appearance.keyline }, pressed && styles.pressed]}
    >
      <View style={styles.topline}>
        <View style={styles.sourceRow}>
          <Text style={[styles.sourceLabel, { color: appearance.accent }]}>{appearance.sourceLabel}</Text>
          <View style={[styles.labelKeyline, { backgroundColor: appearance.keyline }]} />
          <Text style={[styles.rarityLabel, { color: appearance.secondaryText }]}>{appearance.rarityLabel}</Text>
        </View>
        <Text style={[styles.time, { color: appearance.secondaryText }]}>{relativeSignalTime(signal.timing.displayAt, now)}</Text>
      </View>

      <Text numberOfLines={2} style={styles.bottle}>{signal.bottle.name}</Text>
      <Text numberOfLines={2} style={[styles.location, signal.source.type !== "member" && styles.marketLocation, { color: signal.source.type === "member" ? appearance.secondaryText : appearance.accent }]}>{location}</Text>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, availableNow && styles.availableDot, upcoming && styles.upcomingDot]} />
        <Text style={[styles.status, { color: appearance.secondaryText }, availableNow && styles.availableStatus]}>{status}</Text>
      </View>

      {presented.price || presented.quantity ? (
        <View style={styles.metaRow}>
          {presented.price ? <Text style={[styles.price, { color: appearance.accent }]}>{presented.price}</Text> : null}
          {presented.price && presented.quantity ? <View style={styles.metaDivider} /> : null}
          {presented.quantity ? <Text style={[styles.quantity, { color: appearance.secondaryText }]}>{presented.quantity}</Text> : null}
        </View>
      ) : null}

      {summary ? <Text numberOfLines={2} style={[styles.note, { color: appearance.secondaryText }]}>{summary}</Text> : null}
      {reporter ? <Text numberOfLines={1} style={[styles.reporter, { color: appearance.secondaryText }]}>{reporter}</Text> : null}
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
    paddingVertical: 11.5,
    gap: 6,
  },
  pressed: { opacity: 0.82 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 1 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  sourceLabel: { fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.05 },
  labelKeyline: { width: 1, height: 11 },
  rarityLabel: { fontSize: 9, lineHeight: 13, fontWeight: "800", letterSpacing: 0.8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  availableDot: { backgroundColor: colors.success },
  upcomingDot: { backgroundColor: colors.accent },
  status: { fontSize: 11, lineHeight: 15, fontWeight: "700", letterSpacing: 0.2 },
  availableStatus: { color: colors.success },
  time: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  bottle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2 },
  location: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  marketLocation: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  metaRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 1 },
  metaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  price: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  quantity: { fontSize: 12, lineHeight: 17, fontWeight: "600", flexShrink: 1 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  reporter: { fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 1 },
});

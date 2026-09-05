import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import {
  presentBottleIdentity,
  presentSignal,
  relativeSignalTime,
  signalAccessibilityLabel,
  signalAvailabilityIsCurrent,
  signalAvailabilityRefreshAt,
  signalFeedCardAppearance,
  signalCardStatusLabel,
  signalMemberTagLabel,
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
  const bottleIdentity = presentBottleIdentity(signal.bottle.name);
  const status = signalCardStatusLabel(signal, now);
  const appearance = signalFeedCardAppearance(signal);
  const reporter = signalReporterAttribution(signal);
  const community = signal.source.type === "member";
  const memberTag = signalMemberTagLabel(signal);
  const availableNow = !community && signalAvailabilityIsCurrent(signal, now);
  const upcoming = status === "Upcoming"
    || signal.availability?.status === "upcoming"
    || (!signal.availability && (signal.kind === "release" || signal.kind === "event"));
  const showStatus = !community || status === "Availability unconfirmed" || upcoming || signal.kind === "release" || signal.kind === "event";
  const reportedMetric = presented.quantity === "Quantity unknown" ? "" : presented.quantity;
  const metric = reportedMetric;

  return (
    <Pressable
      accessibilityHint="Opens Signal details"
      accessibilityLabel={signalAccessibilityLabel(signal, now)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topline}>
        <View style={[styles.rarityBadge, { backgroundColor: appearance.keyline }]}>
          <Text style={[styles.rarityLabel, { color: appearance.accent }]}>{appearance.rarityLabel}</Text>
        </View>
        <Text style={styles.time}>{relativeSignalTime(signal.timing.displayAt, now)}</Text>
      </View>

      <Text numberOfLines={3} style={styles.bottle}>{bottleIdentity.title}</Text>
      {bottleIdentity.subtitle ? <Text numberOfLines={2} style={styles.bottleSubtitle}>{bottleIdentity.subtitle}</Text> : null}

      {presented.price || metric ? <View style={styles.factsRow}>
        {presented.price ? <Text style={styles.price}>{presented.price}</Text> : null}
        {metric ? <Text numberOfLines={1} style={styles.metricText}>{metric}</Text> : null}
      </View> : null}

      <View style={styles.details}>
        {presented.storeName ? <View style={styles.detailRow}>
          <MaterialCommunityIcons color={colors.muted} name="storefront-outline" size={17} />
          <Text numberOfLines={1} style={styles.storeName}>{presented.storeName}</Text>
        </View> : null}
        {presented.geography ? <View style={styles.detailRow}>
          <MaterialCommunityIcons color={colors.muted} name="map-marker-outline" size={17} />
          <Text numberOfLines={1} style={styles.geography}>{presented.geography}</Text>
        </View> : null}
      </View>

      {showStatus ? <View style={styles.statusRow}>
        <View style={[styles.statusDot, availableNow && styles.availableDot, upcoming && styles.upcomingDot]} />
        <Text style={[styles.status, availableNow && styles.availableStatus, upcoming && styles.upcomingStatus]}>{status}</Text>
      </View> : null}

      {community && (reporter || memberTag) ? <View style={styles.authorRow}>
        {reporter ? <Text numberOfLines={1} style={styles.reporter}>{reporter}</Text> : null}
        {memberTag ? <View style={styles.memberTag}><Text style={styles.memberTagText}>{memberTag}</Text></View> : null}
      </View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 120,
    paddingHorizontal: 2,
    paddingVertical: 12,
    gap: 7,
  },
  pressed: { opacity: 0.8 },
  topline: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rarityBadge: { minHeight: 22, borderRadius: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  rarityLabel: { fontSize: 9, lineHeight: 12, fontWeight: "900", letterSpacing: 1.05 },
  time: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  bottle: { color: colors.text, fontFamily: "Fraunces_700Bold", fontSize: 18, lineHeight: 23, letterSpacing: -0.2 },
  bottleSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "500", marginTop: -4 },
  factsRow: { minHeight: 24, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  details: { gap: 4 },
  detailRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  storeName: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "600", flex: 1 },
  geography: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "500", flex: 1 },
  statusRow: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  availableDot: { backgroundColor: colors.success },
  upcomingDot: { backgroundColor: colors.accent },
  status: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "700", letterSpacing: 0.1 },
  availableStatus: { color: colors.success },
  upcomingStatus: { color: colors.accent },
  reporter: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600", flexShrink: 1 },
  authorRow: { minHeight: 22, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  memberTag: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  memberTagText: { color: colors.text, fontSize: 9, lineHeight: 12, fontWeight: "800", letterSpacing: 0.35 },
  price: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  metricText: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "700", flexShrink: 1 },
});

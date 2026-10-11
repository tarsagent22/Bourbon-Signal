import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import { CommunityPostCard } from "./CommunityPostCard";
import { CellarBottleArtwork } from "./CellarBottleArtwork";
import { signalRowBottleIdentity, signalRowFacts } from "./signal-row-presentation";
import { presentSignal, signalAccessibilityLabel, signalAvailabilityRefreshAt, signalFeedCardAppearance } from "../api/presentation";
import { reportAge } from "../signals/report-age";
import { useReportClock } from "../hooks/useReportClock";
import { colors, typeScale, fonts } from "../theme";

export function SignalCard({ signal, onPress, highlighted = false }: { signal: Signal; onPress: () => void; highlighted?: boolean }) {
  const clock = useReportClock();
  const [boundaryNow, setNow] = useState(() => new Date());
  const now = clock.getTime() > boundaryNow.getTime() ? clock : boundaryNow;
  const age = reportAge(signal, now);
  useEffect(() => {
    const refreshAt = signalAvailabilityRefreshAt(signal, now);
    if (!refreshAt) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleRefresh = () => {
      const remaining = refreshAt - Date.now();
      if (remaining <= 0) { setNow(new Date()); return; }
      timer = setTimeout(scheduleRefresh, Math.min(remaining + 50, 2_147_483_647));
    };
    scheduleRefresh();
    return () => clearTimeout(timer);
  }, [signal.id, signal.timing.displayAt, signal.timing.expiresAt, signal.availability?.status, now]);
  const presented = presentSignal(signal);
  const bottleIdentity = signalRowBottleIdentity(signal.bottle.name);
  const appearance = signalFeedCardAppearance(signal);
  const { quantity: metric, status, showStatus } = signalRowFacts(signal, now);
  if (signal.source.type === "member") return <CommunityPostCard signal={signal} onPress={onPress} highlighted={highlighted} now={now} />;
  return <Pressable accessibilityHint="Opens Signal details" accessibilityLabel={signalAccessibilityLabel(signal, now)} accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [styles.card, age.older && styles.older, highlighted && styles.highlighted, pressed && styles.pressed]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.artwork}>
      <Image source={require("../../assets/shelf/bottle-contact-shadow.png")} resizeMode="stretch" style={styles.contactShadow} />
      <CellarBottleArtwork bottle={{ bottleId: signal.bottle.id, bottleName: signal.bottle.name }} size="feed" />
    </View>
    <View style={styles.copy}>
      <View style={styles.topline}>
        <View style={[styles.rarityBadge, { backgroundColor: appearance.keyline }]}><Text style={[styles.rarityLabel, { color: appearance.accent }]}>{appearance.rarityLabel}</Text></View>
        <Text style={styles.time}>{age.label}</Text>
      </View>
      <Text style={styles.bottle}>{bottleIdentity.title}</Text>
      {bottleIdentity.subtitle ? <Text style={styles.bottleSubtitle}>{bottleIdentity.subtitle}</Text> : null}
      <View style={styles.details}>
        {presented.storeName ? <View style={styles.detailRow}><MaterialCommunityIcons color={colors.muted} name="storefront-outline" size={14} /><Text style={styles.storeName}>{presented.storeName}</Text></View> : null}
        {presented.geography ? <View style={styles.detailRow}><MaterialCommunityIcons color={colors.muted} name="map-marker-outline" size={14} /><Text style={styles.geography}>{presented.geography}</Text></View> : null}
      </View>
      <View style={styles.factsRow}>
        {presented.price ? <Text style={styles.price}>{presented.price}</Text> : null}
        {presented.price && metric ? <Text accessible={false} style={styles.metricDot}>·</Text> : null}
        {metric ? <Text style={styles.metricText}>{metric}</Text> : null}
      </View>
      {age.older ? <Text style={styles.status}>{signal.historical ? "Historical report" : "Older report · Availability may have changed"}</Text> : showStatus ? <Text style={styles.status}>{status}</Text> : null}
    </View>
    <MaterialCommunityIcons accessible={false} name="chevron-right" color={colors.accent} size={22} />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 120, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 0 },
  pressed: { opacity: 0.72 },
  older: { opacity: 0.78 },
  highlighted: { backgroundColor: "rgba(214,154,74,0.10)", borderLeftWidth: 2, borderLeftColor: colors.accent },
  artwork: { width: 68, minHeight: 104, alignItems: "center", justifyContent: "flex-end" },
  contactShadow: { position: "absolute", bottom: -2, left: 0, width: 68, height: 10, opacity: 0.75 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  topline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 },
  rarityBadge: { minHeight: 18, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 },
  rarityLabel: { fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.3 },
  time: { color: colors.muted, fontSize: typeScale.micro, lineHeight: 15 },
  bottle: { color: colors.text, fontFamily: fonts.heading, fontSize: typeScale.subheading, lineHeight: 23 },
  bottleSubtitle: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16 },
  details: { gap: 1 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  storeName: { color: colors.muted, fontSize: typeScale.small, lineHeight: 17, flex: 1 },
  geography: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16, flex: 1 },
  factsRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6, rowGap: 1 },
  price: { color: colors.text, fontSize: typeScale.small, lineHeight: 18, fontWeight: "700" },
  metricDot: { color: colors.muted, fontSize: typeScale.small },
  metricText: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 17, flexShrink: 1 },
  status: { color: colors.muted, fontSize: typeScale.micro, lineHeight: 16 },
});

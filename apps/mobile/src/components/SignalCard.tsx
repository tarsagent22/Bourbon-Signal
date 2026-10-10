import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import { CommunityPostCard } from "./CommunityPostCard";
import { CellarBottleArtwork } from "./CellarBottleArtwork";
import { signalRowFacts } from "./signal-row-presentation";
import { presentBottleIdentity, presentSignal, relativeSignalTime, signalAccessibilityLabel, signalAvailabilityRefreshAt, signalFeedCardAppearance } from "../api/presentation";
import { colors, typeScale, fonts } from "../theme";

export function SignalCard({ signal, onPress, highlighted = false }: { signal: Signal; onPress: () => void; highlighted?: boolean }) {
  const [now, setNow] = useState(() => new Date());
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
  const bottleIdentity = presentBottleIdentity(signal.bottle.name);
  // Retain identity-bearing expressions while removing generic spirit subtitles.
  const subtitle = /bottled in bond/i.test(bottleIdentity.subtitle) ? bottleIdentity.subtitle : "";
  const appearance = signalFeedCardAppearance(signal);
  const { quantity: metric, status, showStatus } = signalRowFacts(signal, now);
  if (signal.source.type === "member") return <CommunityPostCard signal={signal} onPress={onPress} highlighted={highlighted} />;
  return <Pressable accessibilityHint="Opens Signal details" accessibilityLabel={signalAccessibilityLabel(signal, now)} accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [styles.card, highlighted && styles.highlighted, pressed && styles.pressed]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.artwork}>
      <Image source={require("../../assets/shelf/bottle-contact-shadow.png")} resizeMode="stretch" style={styles.contactShadow} />
      <CellarBottleArtwork bottle={{ bottleId: signal.bottle.id, bottleName: signal.bottle.name }} size="feed" />
    </View>
    <View style={styles.copy}>
      <View style={styles.topline}>
        <View style={[styles.rarityBadge, { backgroundColor: appearance.keyline }]}><Text style={[styles.rarityLabel, { color: appearance.accent }]}>{appearance.rarityLabel}</Text></View>
        <Text style={styles.time}>{relativeSignalTime(signal.timing.displayAt, now)}</Text>
      </View>
      <Text style={styles.bottle}>{bottleIdentity.title}</Text>
      {subtitle ? <Text style={styles.bottleSubtitle}>{subtitle}</Text> : null}
      <View style={styles.details}>
        {presented.storeName ? <View style={styles.detailRow}><MaterialCommunityIcons color={colors.muted} name="storefront-outline" size={14} /><Text style={styles.storeName}>{presented.storeName}</Text></View> : null}
        {presented.geography ? <View style={styles.detailRow}><MaterialCommunityIcons color={colors.muted} name="map-marker-outline" size={14} /><Text style={styles.geography}>{presented.geography}</Text></View> : null}
      </View>
      <View style={styles.factsRow}>
        {presented.price ? <Text style={styles.price}>{presented.price}</Text> : null}
        {presented.price && metric ? <Text accessible={false} style={styles.metricDot}>·</Text> : null}
        {metric ? <Text style={styles.metricText}>{metric}</Text> : null}
      </View>
      {showStatus ? <Text style={styles.status}>{status}</Text> : null}
    </View>
    <MaterialCommunityIcons accessible={false} name="chevron-right" color={colors.accent} size={22} />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 120, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 0 },
  pressed: { opacity: 0.72 },
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

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { CellarBottleArtwork } from "../components/CellarBottleArtwork";
import {
  signalRowBottleIdentity,
  signalRowReportSummary,
} from "../components/signal-row-presentation";
import {
  signalCardStatusLabel,
  signalFeedCardAppearance,
} from "../api/presentation";
import { useReportClock } from "../hooks/useReportClock";
import { colors as c, fonts } from "../theme";
import type { mapFeedRows } from "./map-feed";
export const MapReportCard = memo(function MapReportCard({
  row,
  width,
  selected,
  onOpen,
  onStore,
}: {
  row: ReturnType<typeof mapFeedRows>[number];
  width: number;
  selected: boolean;
  onOpen: () => void;
  onStore: () => void;
}) {
  const { store, signal } = row;
  const now = useReportClock();
  const appearance = signalFeedCardAppearance(signal);
  const identity = signalRowBottleIdentity(signal.bottle.name);
  return (
    <View style={[s.card, { width }, selected && s.selected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show reports at ${store.name}`}
        onPress={onStore}
        style={s.store}
      >
        <Icon name="storefront-outline" size={16} color={c.accent} />
        <Text numberOfLines={1} style={s.storeName}>
          {store.name}
        </Text>
        <Text style={s.distance}>{store.distance.toFixed(1)} mi</Text>
        <Icon name="chevron-up" size={18} color={c.muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${signal.bottle.name} report at ${store.name}`}
        onPress={onOpen}
        style={({ pressed }) => [s.report, pressed && { opacity: 0.7 }]}
      >
        <View accessible={false} style={s.art}>
          <CellarBottleArtwork
            bottle={{
              bottleId: signal.bottle.id,
              bottleName: signal.bottle.name,
            }}
            size="feed"
          />
        </View>
        <View style={s.copy}>
          <Text style={[s.rarity, { color: appearance.accent }]}>
            {appearance.rarityLabel}
          </Text>
          <Text numberOfLines={2} style={s.title}>
            {identity.title}
          </Text>
          <Text style={s.price}>
            {signal.availability?.price != null
              ? `$${signal.availability.price.toFixed(2)}`
              : "Price not reported"}
          </Text>
          <Text numberOfLines={1} style={s.detail}>
            {signalRowReportSummary(signal, now).label}
          </Text>
          <Text numberOfLines={1} style={s.detail}>
            {signalCardStatusLabel(signal, now)}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color={c.accent} />
      </Pressable>
    </View>
  );
});
const s = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: "#181410",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  selected: { borderColor: "#9A7040" },
  store: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  storeName: { color: c.text, fontWeight: "600", fontSize: 12, flex: 1 },
  distance: { color: c.accent, fontSize: 12, fontWeight: "600" },
  report: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    minHeight: 148,
  },
  art: { width: 58, alignItems: "center" },
  copy: { flex: 1, gap: 3 },
  rarity: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  title: {
    fontFamily: fonts.heading,
    color: c.text,
    fontSize: 19,
    lineHeight: 23,
  },
  price: { color: c.text, fontWeight: "700", fontSize: 15 },
  detail: { color: c.muted, fontSize: 10, lineHeight: 14 },
});

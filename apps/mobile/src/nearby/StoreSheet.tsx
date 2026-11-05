import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import type { NearbyStore } from "../../../../shared/nearby";
import type { Signal } from "../api/types";
import { CellarBottleArtwork } from "../components/CellarBottleArtwork";
import {
  signalRowReportTimestamp,
  signalRowReportSummary,
} from "../components/signal-row-presentation";
import {
  signalLastCheckedAt,
  signalFeedCardAppearance,
} from "../api/presentation";
import { useReportClock } from "../hooks/useReportClock";
import { appleStoreDirectionsUrl, storeMapUrl } from "../signals/nearby";
import { colors as c, fonts } from "../theme";

const distance = (store: NearbyStore) =>
  `${store.approximateLocation ? "~" : ""}${store.distance.toFixed(1)} mi`;
const reports = (count: number) =>
  `${count} bottle ${count === 1 ? "report" : "reports"}`;
function Artwork({ signal }: { signal: Signal }) {
  return (
    <CellarBottleArtwork
      bottle={{ bottleId: signal.bottle.id, bottleName: signal.bottle.name }}
      size="list"
    />
  );
}
const BottleRow = memo(function BottleRow({
  signal,
  onOpen,
}: {
  signal: Signal;
  onOpen: (id: string) => void;
}) {
  const now = useReportClock();
  const appearance = signalFeedCardAppearance(signal);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${signal.bottle.name} report`}
      onPress={() => onOpen(signal.id)}
      style={s.bottle}
    >
      <View accessible={false} style={s.art}>
        <Artwork signal={signal} />
      </View>
      <View style={s.copy}>
        <Text style={[s.rarity, { color: appearance.accent }]}>
          {appearance.rarityLabel}
        </Text>
        <Text style={s.bottleName}>{signal.bottle.name}</Text>
        <Text style={s.price}>
          {signal.availability?.price != null
            ? `$${signal.availability.price.toFixed(2)}`
            : "Price not reported"}
        </Text>
        <Text style={s.meta}>{signalRowReportSummary(signal, now).label}</Text>
      </View>
      <Icon name="chevron-right" size={20} color={c.muted} />
    </Pressable>
  );
});
export function StoreSheet({
  stores,
  selected,
  onSelect,
  expanded,
  onExpand,
  height,
  bottom,
  busy,
  notice,
  unlocatedCount,
  onUnlocated,
  onRefresh,
  onOpen,
}: {
  stores: NearbyStore[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  expanded: boolean;
  onExpand: (value: boolean) => void;
  height: number;
  bottom: number;
  busy: boolean;
  notice: string;
  unlocatedCount: number;
  onUnlocated: () => void;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}) {
  const now = useReportClock();
  const store = stores.find((s) => s.id === selected);
  const freshest = store?.signals.reduce<Signal | undefined>(
    (latest, signal) => {
      const time = Date.parse(signalLastCheckedAt(signal) || "");
      const previous = latest
        ? Date.parse(signalLastCheckedAt(latest) || "")
        : -Infinity;
      return Number.isFinite(time) && time <= now.getTime() && time > previous
        ? signal
        : latest;
    },
    undefined,
  );
  const collapsed = (store ? 210 : 116) + bottom + (notice ? 52 : 0);
  const offset = useRef(new Animated.Value(height - collapsed)).current;
  const [directionsError, setDirectionsError] = useState("");
  useEffect(() => {
    setDirectionsError("");
  }, [selected]);
  useEffect(() => {
    Animated.spring(offset, {
      toValue: expanded ? 0 : Math.max(0, height - collapsed),
      useNativeDriver: true,
      damping: 28,
      stiffness: 260,
      mass: 1,
    }).start();
  }, [expanded, height, collapsed, offset]);
  const pan = useMemo(() => {
    const resting = expanded ? 0 : Math.max(0, height - collapsed);
    const settle = (next: boolean) => {
      onExpand(next);
      Animated.spring(offset, {
        toValue: next ? 0 : Math.max(0, height - collapsed),
        useNativeDriver: true,
        damping: 28,
        stiffness: 260,
        mass: 1,
      }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => offset.stopAnimation(),
      onPanResponderMove: (_, g) =>
        offset.setValue(
          Math.max(0, Math.min(height - collapsed, resting + g.dy)),
        ),
      onPanResponderRelease: (_, g) =>
        settle(Math.abs(g.dy) > 25 ? g.dy < 0 : expanded),
      onPanResponderTerminate: () => settle(expanded),
    });
  }, [onExpand, expanded, height, collapsed, offset]);
  async function directions() {
    if (!store) return;
    try {
      await Linking.openURL(
        Platform.OS === "ios"
          ? appleStoreDirectionsUrl(store)
          : storeMapUrl(store, true),
      );
    } catch {
      setDirectionsError("Directions could not open. Please try again.");
    }
  }
  return (
    <Animated.View
      style={[s.sheet, { height, transform: [{ translateY: offset }] }]}
    >
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? "Collapse list to map" : "Expand nearby list"
          }
          accessibilityState={{ expanded }}
          onPress={() => onExpand(!expanded)}
          style={s.handleTouch}
        >
          <View style={s.handle} />
        </Pressable>
        <View style={s.heading}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              store ? "Show all nearby stores" : "Expand nearby stores"
            }
            onPress={() => {
              onSelect(null);
              onExpand(true);
            }}
            disabled={Boolean(store) && !expanded}
            style={s.headingTitle}
          >
            {store && expanded && (
              <Icon name="chevron-left" size={20} color={c.muted} />
            )}
            <Text style={s.headingText}>
              {store
                ? expanded
                  ? "Nearby stores"
                  : "Selected store"
                : `${stores.length} nearby ${stores.length === 1 ? "store" : "stores"}`}
            </Text>
            {busy && <ActivityIndicator size="small" color={c.accent} />}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!expanded) onSelect(null);
              onExpand(!expanded);
            }}
            style={s.action}
          >
            <Icon
              name={expanded ? "map-outline" : "format-list-bulleted"}
              size={17}
              color={c.text}
            />
            <Text style={s.actionText}>{expanded ? "Map" : "List"}</Text>
          </Pressable>
        </View>
        {busy && <Text style={s.updating}>Updating results…</Text>}
      </View>
      {notice ? (
        <Pressable accessibilityRole="button" onPress={onRefresh}>
          <Text numberOfLines={2} accessibilityRole="alert" style={s.notice}>
            {notice} Tap to retry.
          </Text>
        </Pressable>
      ) : null}
      {store ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${reports(store.signals.length)} at ${store.name}`}
            onPress={() => onExpand(!expanded)}
            style={s.storePreview}
          >
            <View style={s.storeHeading}>
              <Text numberOfLines={1} style={s.storeName}>
                {store.name}
              </Text>
              <Text style={s.distance}>{distance(store)}</Text>
            </View>
            <Text numberOfLines={1} style={s.meta}>
              {reports(store.signals.length)}
              {expanded
                ? ` · ${store.city}, ${store.state}`
                : freshest
                  ? ` · ${signalRowReportTimestamp(freshest, now)}`
                  : ""}
            </Text>
            {!expanded && (
              <View style={s.thumbnails}>
                <View style={s.thumbnailGroup} accessible={false}>
                  {store.signals.slice(0, 3).map((signal) => (
                    <View key={signal.id} style={s.thumbnail}>
                      <Artwork signal={signal} />
                    </View>
                  ))}
                </View>
                <Text style={s.viewBottles}>View bottles</Text>
                <Icon name="chevron-up" size={18} color={c.accent} />
              </View>
            )}
          </Pressable>
          {expanded && (
            <>
              <View style={s.addressRow}>
                <View style={s.copy}>
                  <Text style={s.meta}>{store.address}</Text>
                  {store.approximateLocation && (
                    <Text style={s.meta}>Approximate map location</Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void directions()}
                  style={s.action}
                >
                  <Icon name="directions" size={18} color={c.accent} />
                  <Text style={s.viewBottles}>Directions</Text>
                </Pressable>
              </View>
              {directionsError ? (
                <Text accessibilityRole="alert" style={s.notice}>
                  {directionsError}
                </Text>
              ) : null}
              <FlatList
                data={store.signals}
                keyExtractor={(signal) => signal.id}
                renderItem={({ item }) => (
                  <BottleRow signal={item} onOpen={onOpen} />
                )}
                initialNumToRender={5}
                windowSize={5}
                contentContainerStyle={{ paddingBottom: bottom + 20 }}
              />
            </>
          )}
        </>
      ) : expanded ? (
        <FlatList
          data={stores}
          keyExtractor={(store) => store.id}
          initialNumToRender={6}
          windowSize={5}
          contentContainerStyle={{ paddingBottom: bottom + 20 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${distance(item)}, ${reports(item.signals.length)}`}
              onPress={() => onSelect(item.id)}
              style={s.storeRow}
            >
              <Icon name="storefront-outline" size={22} color={c.accent} />
              <View style={s.copy}>
                <Text style={s.listName}>{item.name}</Text>
                <Text style={s.meta}>
                  {reports(item.signals.length)} · {item.city}
                </Text>
              </View>
              <Text style={s.distance}>{distance(item)}</Text>
              <Icon name="chevron-right" size={18} color={c.muted} />
            </Pressable>
          )}
          ListHeaderComponent={
            <>
              {unlocatedCount > 0 && (
                <Pressable
                  accessibilityRole="button"
                  style={s.unlocated}
                  onPress={onUnlocated}
                >
                  <Icon
                    name="map-marker-question-outline"
                    size={18}
                    color={c.muted}
                  />
                  <Text style={s.meta}>
                    {unlocatedCount}{" "}
                    {unlocatedCount === 1 ? "report" : "reports"} without pins
                  </Text>
                  <Icon name="chevron-right" size={18} color={c.muted} />
                </Pressable>
              )}
            </>
          }
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => onExpand(true)}
          style={s.overview}
        >
          <Text style={s.meta}>
            {notice
              ? "Some results could not refresh. Open List to retry."
              : unlocatedCount
                ? `Tap a pin to explore · ${unlocatedCount} {unlocatedCount === 1 ? "report" : "reports"} without pins in List`
                : "Tap a store pin or swipe up to browse"}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
const s = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#181410",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  handleTouch: { height: 24, justifyContent: "center", alignItems: "center" },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: "#72675B" },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    minHeight: 44,
  },
  headingTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  headingText: { color: c.text, fontSize: 14, fontWeight: "600" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  actionText: { color: c.text, fontWeight: "600", fontSize: 13 },
  storePreview: { paddingHorizontal: 20, paddingTop: 5, gap: 4 },
  storeHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  storeName: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 23,
    color: c.text,
  },
  distance: { color: c.muted, fontSize: 13 },
  thumbnails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 66,
  },
  thumbnailGroup: { flex: 1, flexDirection: "row", gap: 7 },
  thumbnail: { width: 36, height: 62, alignItems: "center" },
  viewBottles: { color: c.accent, fontSize: 13, fontWeight: "600" },
  copy: { flex: 1, gap: 4 },
  meta: { color: c.muted, fontSize: 12, lineHeight: 18 },
  overview: { paddingHorizontal: 20, paddingTop: 6 },
  updating: { color: c.muted, fontSize: 11, paddingHorizontal: 20 },
  addressRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  bottle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  art: { width: 46, alignItems: "center" },
  rarity: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  bottleName: { fontFamily: fonts.heading, fontSize: 20, color: c.text },
  price: { color: c.text, fontSize: 14, fontWeight: "600" },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  listName: { color: c.text, fontSize: 16, fontWeight: "600" },
  unlocated: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 20,
    minHeight: 48,
  },
  notice: { color: c.muted, fontSize: 12, lineHeight: 18, padding: 16 },
});

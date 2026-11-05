import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import NearbyMap from "../../src/nearby/NearbyMap";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { colors as c, fonts } from "../../src/theme";
import { useMobileApi } from "../../src/hooks/useMobileApi";
import {
  nearbyVisible,
  parsePlace,
  placeLookupPath,
  storeMapUrl,
} from "../../src/signals/nearby";
import type {
  NearbyResult,
  NearbyStore,
  Point,
} from "../../../../shared/nearby";
type Place = Point & { label: string };
const KEY = "nearby-manual-place-v1";
function Button({
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        selected && s.active,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, selected && { color: c.background }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const StoreCard = memo(function StoreCard({ store }: { store: NearbyStore }) {
  const [expanded, setExpanded] = useState(false),
    [error, setError] = useState("");
  async function open(directions: boolean) {
    try {
      await Linking.openURL(
        Platform.OS === "ios"
          ? `https://maps.apple.com/?daddr=${store.latitude},${store.longitude}&dirflg=d`
          : storeMapUrl(store, directions),
      );
    } catch {
      setError("Maps could not open. Please try again.");
    }
  }
  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={s.storeIcon}>
          <Icon name="storefront-outline" size={21} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.storeName}>{store.name}</Text>
          <Text style={s.copy}>
            {store.city}, {store.state}
          </Text>
        </View>
        <View style={s.distance}>
          <Text style={s.distanceNumber}>{store.distance.toFixed(1)}</Text>
          <Text style={s.small}>MILES</Text>
        </View>
      </View>
      <Text style={s.address}>{store.address}</Text>
      {(expanded ? store.signals : store.signals.slice(0, 3)).map((signal) => (
        <Pressable
          key={signal.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${signal.bottle.name} report`}
          onPress={() =>
            router.push({
              pathname: "/(app)/signal/[id]",
              params: { id: signal.id },
            })
          }
          style={({ pressed }) => [s.report, pressed && { opacity: 0.65 }]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.bottle}>{signal.bottle.name}</Text>
            <Text style={s.copy}>
              {signal.historical
                ? "Older report"
                : signal.availability?.label || "Reported availability"}
              {signal.availability?.price != null
                ? ` · $${signal.availability.price.toFixed(2)}`
                : ""}
            </Text>
            <Text style={s.small}>
              {signal.timing.lastCheckedAt ? "Checked" : "Reported"}{" "}
              {new Date(
                signal.timing.lastCheckedAt ||
                  signal.timing.observedAt ||
                  signal.timing.displayAt,
              ).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={c.muted} />
        </Pressable>
      ))}
      {store.signals.length > 3 ? (
        <Button
          label={
            expanded ? "Show less" : `See all ${store.signals.length} reports`
          }
          onPress={() => setExpanded((v) => !v)}
        />
      ) : null}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Button label="Directions" selected onPress={() => void open(true)} />
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});
export default function Nearby() {
  const params = useLocalSearchParams<{
      store?: string;
      search?: string;
      view?: string;
      state?: string;
      area?: string;
      tiers?: string;
      freshness?: string;
    }>(),
    api = useMobileApi();
  const [place, setPlace] = useState<Place | null>(null),
    [draft, setDraft] = useState(""),
    [placeSheet, setPlaceSheet] = useState(false),
    [locating, setLocating] = useState(false),
    [placeError, setPlaceError] = useState("");
  const [radius, setRadius] = useState(25),
    [search, setSearch] = useState(params.search || ""),
    [query, setQuery] = useState(params.search || ""),
    [fresh, setFresh] = useState(params.freshness || ""),
    [tiers, setTiers] = useState(params.tiers || ""),
    [watchOnly, setWatchOnly] = useState(false),
    [watched, setWatched] = useState<string[] | null>(null),
    [filters, setFilters] = useState(false);
  const [result, setResult] = useState<NearbyResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const lastPlace = useRef<Place | null>(null);
  const sequence = useRef(0),
    placeSequence = useRef(0),
    touched = useRef(false);
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (!active || touched.current || !raw) return;
        const p = JSON.parse(raw) as Place;
        if (
          typeof p.label === "string" &&
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude) &&
          Math.abs(p.latitude) <= 90 &&
          Math.abs(p.longitude) <= 180
        )
          setPlace(p);
      })
      .catch(() => {});
    api
      .getMemberPreferences({ fresh: true })
      .then((p) => {
        if (active) setWatched(p.bottleAlertPreferences.bottleNames);
      })
      .catch(() => {});
    return () => {
      active = false;
      placeSequence.current++;
    };
  }, [api]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const id = ++sequence.current;
    if (!place) return;
    setBusy(true);
    setError("");
    if (lastPlace.current !== place) {
      setResult(null);
      lastPlace.current = place;
    }
    const q = new URLSearchParams({
      lat: String(place.latitude),
      lng: String(place.longitude),
      radius: "100",
      view: params.view || "market",
    });
    for (const [k, v] of Object.entries({
      search: query,
      tiers,
      freshness: fresh,
    }))
      if (v) q.set(k, v);
    api
      .nearby(q)
      .then((data) => {
        if (id === sequence.current) setResult(data);
      })
      .catch((e) => {
        if (id === sequence.current)
          setError(
            e?.status === 403
              ? "Your membership does not include these filters. Clear them or review your plan."
              : "Nearby reports could not be loaded. Please try again.",
          );
      })
      .finally(() => {
        if (id === sequence.current) setBusy(false);
      });
    return () => {
      sequence.current++;
    };
  }, [
    api,
    place,
    query,
    tiers,
    fresh,
    params.view,
    params.state,
    params.area,
    retry,
  ]);
  async function findPlace() {
    if (locating) return;
    const id = ++placeSequence.current;
    setLocating(true);
    setPlaceError("");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const path = placeLookupPath(draft, params.state);
      const response = await fetch(`https://api.zippopotam.us${path}`, {
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error("Location not found. Try a city and state or ZIP code.");
      const chosen = parsePlace(await response.json());
      if (id !== placeSequence.current) return;
      touched.current = true;
      setPlace(chosen);
      setPlaceSheet(false);
      Keyboard.dismiss();
      void SecureStore.setItemAsync(KEY, JSON.stringify(chosen)).catch(
        () => {},
      );
    } catch (e) {
      if (id === placeSequence.current)
        setPlaceError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "Location search timed out. Try again.",
        );
    } finally {
      clearTimeout(timer);
      if (id === placeSequence.current) setLocating(false);
    }
  }
  const stores = useMemo(
    () => nearbyVisible(result?.stores || [], radius, watchOnly, watched || []),
    [result, radius, watchOnly, watched],
  );
  const activeFilters = Boolean(tiers || fresh || watchOnly || query);
  const [selected, setSelected] = useState<string | null>(params.store || null);
  const [listMode, setListMode] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(140);
  const selectedStore = stores.find((store) => store.id === selected);
  async function useCurrentLocation() {
    if (locating) return;
    const id = ++placeSequence.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setLocating(true);
    setPlaceError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (id !== placeSequence.current) return;
      if (!permission.granted) {
        setPlaceError(
          "Location access is off. You can still enter a city or ZIP code.",
        );
        return;
      }
      const current = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Location timed out")),
            15000,
          );
        }),
      ]);
      if (id !== placeSequence.current) return;
      touched.current = true;
      setPlace({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        label: "Current location",
      });
      setSelected(null);
      setPlaceSheet(false);
    } catch {
      if (id === placeSequence.current)
        setPlaceError("Your location is unavailable. Try a city or ZIP code.");
    } finally {
      clearTimeout(timeout);
      if (id === placeSequence.current) setLocating(false);
    }
  }
  return (
    <View style={s.screen}>
      <NearbyMap
        origin={place}
        radius={radius}
        stores={stores}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          setListMode(false);
        }}
        onSearchArea={(point) => {
          setPlace({ ...point, label: "Map area" });
          setSelected(null);
        }}
        bottomInset={sheetHeight}
      />
      <View style={s.mapControls}>
        <View style={s.mapSearchRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change search location"
            onPress={() => {
              setDraft(place?.label || "");
              setPlaceError("");
              setPlaceSheet(true);
            }}
            style={s.mapPlace}
          >
            <Icon name="map-marker-outline" size={20} color={c.accent} />
            <Text numberOfLines={1} style={s.mapPlaceName}>
              {place?.label || "Choose location"}
            </Text>
            <Icon name="chevron-down" size={18} color={c.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter nearby reports"
            onPress={() => setFilters(true)}
            style={s.filterButton}
          >
            <Icon
              name="tune-variant"
              size={22}
              color={activeFilters ? c.accent : c.text}
            />
          </Pressable>
        </View>
        <View style={s.mapSearchRow}>
          <View style={s.search}>
            <Icon name="magnify" size={20} color={c.muted} />
            <TextInput
              accessibilityLabel="Search bottles or stores"
              placeholder="Bottles or stores"
              placeholderTextColor={c.muted}
              value={search}
              onChangeText={setSearch}
              style={s.searchInput}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {search ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => {
                  setSearch("");
                  setQuery("");
                }}
                style={s.clear}
              >
                <Icon name="close" size={18} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
          <Button label={`${radius} mi`} onPress={() => setFilters(true)} />
        </View>
      </View>
      <View
        onLayout={(event) =>
          setSheetHeight(Math.ceil(event.nativeEvent.layout.height))
        }
        style={[s.mapBottom, selectedStore && { maxHeight: "45%" }]}
      >
        {selectedStore ? (
          <>
            <View style={s.sheetHeading}>
              <Text style={s.small}>STORE REPORTS</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close store details"
                onPress={() => setSelected(null)}
                style={s.clear}
              >
                <Icon name="close" size={21} color={c.text} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <StoreCard key={selectedStore.id} store={selectedStore} />
            </ScrollView>
          </>
        ) : (
          <View style={s.mapSummary}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.section}>
                {busy
                  ? "Finding nearby reports"
                  : !place
                    ? "Where are you looking?"
                    : `${stores.length} nearby ${stores.length === 1 ? "store" : "stores"}`}
              </Text>
              <Text style={s.small}>
                {error ||
                  (!place
                    ? "Choose a location to start exploring."
                    : result?.partial
                      ? "Partial results. Narrow your search or try again."
                      : stores.length
                        ? "Tap a pin to see bottles. Distances are straight-line."
                        : "Try widening the radius or changing filters.")}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <Button
                label={!place ? "Choose" : error ? "Retry" : "List"}
                onPress={() => {
                  if (!place) setPlaceSheet(true);
                  else if (error) setRetry((n) => n + 1);
                  else setListMode(true);
                }}
              />
            )}
          </View>
        )}
      </View>
      <Modal
        visible={listMode}
        animationType="slide"
        onRequestClose={() => setListMode(false)}
      >
        <View
          style={[s.screen, { paddingTop: Platform.OS === "ios" ? 55 : 16 }]}
        >
          <View style={s.listHeading}>
            <Text style={s.section}>Nearby stores</Text>
            <Button label="Back to map" onPress={() => setListMode(false)} />
          </View>
          <FlatList
            data={stores}
            keyExtractor={(store) => store.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${item.name} on map`}
                onPress={() => {
                  setSelected(item.id);
                  setListMode(false);
                }}
                style={s.listStore}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.storeName}>{item.name}</Text>
                  <Text style={s.copy}>
                    {item.signals.length} bottle reports
                  </Text>
                </View>
                <Text style={s.distanceNumber}>
                  {item.distance.toFixed(1)} mi
                </Text>
                <Icon name="chevron-right" size={22} color={c.muted} />
              </Pressable>
            )}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <Text style={s.emptyCopy}>
                No matching reports. Try a wider radius or different filters.
              </Text>
            }
          />
        </View>
      </Modal>
      <Modal
        visible={placeSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setPlaceSheet(false)}
      >
        <KeyboardAvoidingView
          style={s.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.sheet}>
            <View style={s.row}>
              <Text style={[s.section, { flex: 1 }]}>
                Choose your starting point
              </Text>
              <Button label="Close" onPress={() => setPlaceSheet(false)} />
            </View>
            <Button
              label={locating ? "Locating..." : "Use my location"}
              disabled={locating}
              onPress={() => void useCurrentLocation()}
            />
            <Text style={s.intro}>
              Or enter a ZIP code or a city and state.
            </Text>
            <TextInput
              autoFocus
              accessibilityLabel="City and state or ZIP code"
              placeholder="Raleigh, NC or 27601"
              placeholderTextColor={c.muted}
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              returnKeyType="search"
              onSubmitEditing={() => void findPlace()}
            />
            {placeError ? (
              <Text accessibilityRole="alert" style={s.error}>
                {placeError}
              </Text>
            ) : null}
            <Button
              label={locating ? "Finding your location…" : "Explore this area"}
              selected
              disabled={locating || !draft.trim()}
              onPress={() => void findPlace()}
            />
            <Text style={s.small}>
              City and ZIP searches use an approximate center. Location access
              is optional.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={filters}
        transparent
        animationType="slide"
        onRequestClose={() => setFilters(false)}
      >
        <View style={s.overlay}>
          <ScrollView
            style={{ flexGrow: 0, maxHeight: "85%" }}
            contentContainerStyle={s.sheet}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.row}>
              <Text style={[s.section, { flex: 1 }]}>Make it your hunt</Text>
              <Button label="Done" onPress={() => setFilters(false)} />
            </View>
            <Text style={s.eyebrow}>DISTANCE</Text>
            <View style={s.wrap}>
              {[10, 25, 50, 100].map((n) => (
                <Button
                  key={n}
                  label={`${n} mi`}
                  selected={radius === n}
                  onPress={() => setRadius(n)}
                />
              ))}
            </View>
            <Text style={s.eyebrow}>BOTTLES</Text>
            <View style={s.wrap}>
              <Button
                label="All bottles"
                selected={!watchOnly}
                onPress={() => setWatchOnly(false)}
              />
              <Button
                label="My watchlist"
                selected={watchOnly}
                disabled={watched === null}
                onPress={() => setWatchOnly(true)}
              />
            </View>
            {watched === null ? (
              <Text style={s.small}>
                Watchlist unavailable. Reopen Nearby to try again.
              </Text>
            ) : null}
            <Text style={s.eyebrow}>RARITY</Text>
            <View style={s.wrap}>
              {[
                ["", "Any rarity"],
                ["limited", "Limited"],
                ["allocated", "Allocated"],
                ["unicorn", "Unicorn"],
              ].map(([v, l]) => (
                <Button
                  key={v}
                  label={l}
                  selected={tiers === v}
                  onPress={() => setTiers(v)}
                />
              ))}
            </View>
            <Text style={s.eyebrow}>REPORT AGE</Text>
            <View style={s.wrap}>
              {[
                ["", "Any time"],
                ["24h", "24 hours"],
                ["7d", "7 days"],
                ["30d", "30 days"],
              ].map(([v, l]) => (
                <Button
                  key={v}
                  label={l}
                  selected={fresh === v}
                  onPress={() => setFresh(v)}
                />
              ))}
            </View>
            <Text style={s.small}>
              Older reports are leads, not a guarantee of current stock.
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  mapControls: { position: "absolute", top: 12, left: 16, right: 16, gap: 8 },
  mapSearchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  mapPlace: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  mapPlaceName: { flex: 1, color: c.text, fontSize: 16, fontWeight: "600" },
  mapBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: c.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
  },
  mapSummary: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sheetHeading: {
    height: 40,
    paddingLeft: 20,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listHeading: {
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listStore: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  header: { gap: 12, paddingTop: 18, paddingBottom: 2 },
  eyebrow: {
    color: c.accent,
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "700",
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 46,
    color: c.text,
    letterSpacing: -0.8,
  },
  intro: { color: c.muted, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    padding: 16,
    minHeight: 84,
  },
  locationIcon: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#2B2117",
    alignItems: "center",
    justifyContent: "center",
  },
  locationName: { fontSize: 18, color: c.text, fontWeight: "600" },
  small: { fontSize: 11, color: c.muted, lineHeight: 17 },
  radius: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    backgroundColor: c.surface,
  },
  radiusItem: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  radiusSelected: {
    backgroundColor: c.surfaceRaised,
    borderWidth: 1,
    borderColor: "#6F5030",
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    backgroundColor: c.surface,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    color: c.text,
    fontSize: 16,
  },
  clear: {
    minHeight: 44,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: c.surfaceRaised,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { fontFamily: fonts.heading, fontSize: 21, color: c.text },
  card: {
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    gap: 12,
  },
  storeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#2B2117",
    alignItems: "center",
    justifyContent: "center",
  },
  storeName: { fontSize: 16, fontWeight: "600", color: c.text, lineHeight: 22 },
  copy: { fontSize: 12, lineHeight: 18, color: c.muted },
  address: { fontSize: 12, lineHeight: 18, color: c.muted, paddingBottom: 4 },
  distance: { alignItems: "flex-end" },
  distanceNumber: { color: c.accent, fontSize: 21, fontWeight: "600" },
  report: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: c.border,
    minHeight: 72,
  },
  bottle: {
    fontFamily: fonts.bottle,
    fontSize: 18,
    lineHeight: 24,
    color: c.text,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: c.text, fontSize: 13, fontWeight: "600" },
  active: { backgroundColor: c.accent, borderColor: c.accent },
  notice: { color: c.muted, fontSize: 12, lineHeight: 18 },
  noticeBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    gap: 12,
  },
  error: { color: c.danger, fontSize: 13, lineHeight: 20 },
  link: { minHeight: 44, justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 32, gap: 16 },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: c.text,
    textAlign: "center",
  },
  emptyCopy: {
    color: c.muted,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 285,
  },
  overlay: { flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.surface,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 42 : 24,
    gap: 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    fontSize: 17,
    backgroundColor: c.background,
  },
});

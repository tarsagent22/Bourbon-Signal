import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapReportCard } from "../../src/nearby/MapReportCard";
import {
  mapFeedRows,
  readNearbyPreview,
  saveNearbyPreview,
  clearNearbyPreview,
} from "../../src/nearby/map-feed";
import { SignalCard } from "../../src/components/SignalCard";
import NearbyMap from "../../src/nearby/NearbyMap";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { colors as c, fonts } from "../../src/theme";
import { useMobileApi } from "../../src/hooks/useMobileApi";
import {
  nearbyVisible,
  currentPlaceWithCity,
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
          <Text style={s.distanceNumber}>
            {store.approximateLocation ? "~" : ""}
            {store.distance.toFixed(1)}
          </Text>
          <Text style={s.small}>MILES</Text>
        </View>
      </View>
      <Text style={s.address}>{store.address}</Text>
      {store.approximateLocation && (
        <Text style={s.small}>Approximate address location</Text>
      )}
      {(expanded ? store.signals : store.signals.slice(0, 3)).map((signal) => (
        <SignalCard
          key={signal.id}
          signal={signal}
          onPress={() =>
            router.push({
              pathname: "/(app)/signal/[id]",
              params: { id: signal.id },
            })
          }
        />
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
      unlocated?: string;
      search?: string;
      view?: string;
      state?: string;
      area?: string;
      tiers?: string;
      freshness?: string;
    }>(),
    api = useMobileApi();
  const [place, setPlace] = useState<Place | null>(null),
    [restoringPlace, setRestoringPlace] = useState(true),
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardWidth = Math.max(240, width - 48);
  const carousel =
    useRef<FlatList<ReturnType<typeof mapFeedRows>[number]>>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [unlocatedOpen, setUnlocatedOpen] = useState(params.unlocated === "1");
  const unlocated = useMemo(
    () =>
      (result?.unlocated || []).filter(
        (signal) =>
          !watchOnly ||
          (watched || []).some(
            (name) =>
              name.trim().toLowerCase() ===
              signal.bottle.name.trim().toLowerCase(),
          ),
      ),
    [result, watchOnly, watched],
  );
  const [filterDraft, setFilterDraft] = useState({
    radius: 25,
    tiers: "",
    fresh: "",
    watchOnly: false,
  });
  const openFilters = () => {
    Keyboard.dismiss();
    setFilterDraft({ radius, tiers, fresh, watchOnly });
    setFilters(true);
  };
  const lastQuery = useRef("");
  const lastApi = useRef(api);
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
      .catch(() => {})
      .finally(() => {
        if (active) setRestoringPlace(false);
      });
    api
      .getMemberPreferences()
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
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const id = ++sequence.current;
    if (!place) return;
    setBusy(true);
    setError("");
    const q = new URLSearchParams({
      lat: String(place.latitude),
      lng: String(place.longitude),
      radius: String(radius),
      view: params.view || "market",
    });
    for (const [k, v] of Object.entries({
      search: query,
      tiers,
      freshness: fresh,
    }))
      if (v) q.set(k, v);
    const placeParts = place.label.match(/^(.+), ([A-Z]{2})$/);
    if (placeParts) {
      q.set("placeCity", placeParts[1]);
      q.set("placeState", placeParts[2]);
    }
    const key = q.toString();
    const preview = readNearbyPreview(api, key);
    if (lastApi.current !== api || lastQuery.current !== key || preview)
      setResult(preview);
    lastApi.current = api;
    lastQuery.current = key;
    api
      .nearby(q)
      .then((data) => {
        if (id === sequence.current) {
          saveNearbyPreview(api, key, data);
          setResult(data);
        }
      })
      .catch((e) => {
        if (id === sequence.current) {
          if (e?.status === 401 || e?.status === 403) {
            clearNearbyPreview(api);
            setResult(null);
          }
          setError(
            e?.status === 403
              ? "Your membership does not include these filters. Clear them or review your plan."
              : "Nearby reports could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (id === sequence.current) setBusy(false);
      });
    return () => {
      sequence.current++;
    };
  }, [api, place, query, tiers, fresh, params.view, radius, retry]);
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
  useEffect(() => {
    if (params.store) setSelected(params.store);
  }, [params.store]);
  const [listMode, setListMode] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(140);
  const selectedStore = stores.find((store) => store.id === selected);
  const rows = useMemo(() => mapFeedRows(stores), [stores]);
  const selectStore = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      setSelected(id);
      const index = rows.findIndex((row) => row.store.id === id);
      if (index >= 0) {
        setCardIndex(index);
        carousel.current?.scrollToOffset({
          offset: index * (cardWidth + 10),
          animated: true,
        });
      }
    },
    [rows, cardWidth],
  );
  useEffect(() => {
    const index = Math.max(
      0,
      rows.findIndex((row) => row.store.id === selected),
    );
    setCardIndex(index);
    carousel.current?.scrollToOffset({
      offset: index * (cardWidth + 10),
      animated: false,
    });
    if (result && selected && !stores.some((store) => store.id === selected)) {
      setSelected(null);
      setDetailOpen(false);
    }
  }, [rows]);
  const openReport = (id: string) =>
    router.push({ pathname: "/(app)/signal/[id]", params: { id } });
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
      const resolvedPlace = await currentPlaceWithCity(
        {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        },
        Location.reverseGeocodeAsync,
      );
      if (id !== placeSequence.current) return;
      touched.current = true;
      setPlace(resolvedPlace);
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
      {!restoringPlace && (
        <NearbyMap
          origin={place}
          radius={radius}
          stores={stores}
          selected={selected}
          onSelect={selectStore}
          onSearchArea={(point) => {
            setPlace({ ...point, label: "Map area" });
            setSelected(null);
          }}
          bottomInset={sheetHeight}
        />
      )}
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
            onPress={openFilters}
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
          <Button label={`${radius} mi`} onPress={openFilters} />
        </View>
      </View>
      <View
        onLayout={(event) =>
          setSheetHeight(Math.ceil(event.nativeEvent.layout.height))
        }
        style={[s.feedDock, { paddingBottom: Math.max(insets.bottom, 12) }]}
        pointerEvents="box-none"
      >
        <View style={s.feedToolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh nearby reports"
            disabled={busy || restoringPlace || !place}
            onPress={() => setRetry((n) => n + 1)}
            style={s.feedCount}
          >
            {busy || restoringPlace ? (
              <ActivityIndicator size="small" color={c.accent} />
            ) : (
              <Icon name="glass-cocktail" size={15} color={c.accent} />
            )}
            <Text style={s.feedCountText}>
              {rows.length
                ? `${Math.min(cardIndex + 1, rows.length)} / ${rows.length} reports`
                : busy || restoringPlace
                  ? "Finding bottles…"
                  : "Nearby bottles"}
            </Text>
          </Pressable>
          {rows.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open nearby report feed"
              onPress={() => setListMode(true)}
              style={s.feedCount}
            >
              <Icon name="format-list-bulleted" size={17} color={c.text} />
              <Text style={s.feedCountText}>Feed</Text>
            </Pressable>
          )}
        </View>
        {rows.length > 0 && unlocated.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setUnlocatedOpen(true)}
            style={s.feedCount}
          >
            <Icon
              name="map-marker-question-outline"
              size={16}
              color={c.accent}
            />
            <Text style={s.feedCountText}>
              {unlocated.length} reports without pins
            </Text>
          </Pressable>
        )}
        {rows.length ? (
          <>
            {(error || result?.partial) && (
              <Text accessibilityRole="alert" style={s.notice}>
                {error ||
                  "Some reports are still loading. Tap refresh to try again."}
              </Text>
            )}
            <FlatList
              ref={carousel}
              horizontal
              data={rows}
              keyExtractor={(row) => row.key}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + 10}
              decelerationRate="fast"
              disableIntervalMomentum
              initialNumToRender={2}
              maxToRenderPerBatch={3}
              windowSize={3}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              getItemLayout={(_, index) => ({
                length: cardWidth + 10,
                offset: index * (cardWidth + 10),
                index,
              })}
              onScrollBeginDrag={() => Keyboard.dismiss()}
              onMomentumScrollEnd={(event) => {
                const index = Math.min(
                  rows.length - 1,
                  Math.max(
                    0,
                    Math.round(
                      event.nativeEvent.contentOffset.x / (cardWidth + 10),
                    ),
                  ),
                );
                setCardIndex(index);
                setSelected(rows[index].store.id);
              }}
              renderItem={({ item }) => (
                <MapReportCard
                  row={item}
                  width={cardWidth}
                  selected={item.store.id === selected}
                  onOpen={() => openReport(item.signal.id)}
                  onStore={() => {
                    selectStore(item.store.id);
                    setDetailOpen(true);
                  }}
                />
              )}
            />
          </>
        ) : (
          <View style={s.emptyCard}>
            <Text style={s.section}>
              {restoringPlace
                ? "Opening your map"
                : !place
                  ? "Your next find starts here"
                  : busy
                    ? "Looking around you"
                    : error || result?.partial
                      ? "Reports are still catching up"
                      : result?.previewLocked
                        ? "More reports need membership access"
                        : unlocated.length
                          ? "Reports found without map pins"
                          : "No matching bottles yet"}
            </Text>
            <Text style={s.copy}>
              {error ||
                (restoringPlace
                  ? "Getting your saved location ready."
                  : !place
                    ? "Use your location or choose a city to explore."
                    : busy
                      ? "The map is ready. Reports are on their way."
                      : result?.partial
                        ? "The search could not finish. Try again to load nearby reports."
                        : result?.previewLocked
                          ? "Open the feed to review your membership access."
                          : unlocated.length
                            ? "These local reports need a verified map location. Their distance from you is unavailable."
                            : "Widen your radius or try another bottle.")}
            </Text>
            {!busy && !restoringPlace && (
              <Button
                label={
                  !place
                    ? "Choose location"
                    : error || result?.partial
                      ? "Try again"
                      : unlocated.length
                        ? `View ${unlocated.length} reports`
                        : "Adjust filters"
                }
                selected
                onPress={() =>
                  !place
                    ? setPlaceSheet(true)
                    : error || result?.partial
                      ? setRetry((n) => n + 1)
                      : unlocated.length
                        ? setUnlocatedOpen(true)
                        : openFilters()
                }
              />
            )}
          </View>
        )}
      </View>
      <Modal
        visible={detailOpen && Boolean(selectedStore)}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailOpen(false)}
      >
        <View style={s.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close store reports"
            onPress={() => setDetailOpen(false)}
          />
          <View
            style={[
              s.sheet,
              { maxHeight: "80%", paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={s.row}>
              <Text style={[s.section, { flex: 1 }]}>Store reports</Text>
              <Button
                label="Back to map"
                onPress={() => setDetailOpen(false)}
              />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {selectedStore && (
                <StoreCard key={selectedStore.id} store={selectedStore} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={listMode}
        animationType="slide"
        onRequestClose={() => setListMode(false)}
      >
        <View style={[s.screen, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={s.listHeading}>
            <Text style={s.section}>Nearby reports</Text>
            <Button label="Map" onPress={() => setListMode(false)} />
          </View>
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            initialNumToRender={4}
            windowSize={5}
            contentContainerStyle={[
              s.list,
              { paddingHorizontal: 16, paddingBottom: insets.bottom + 16 },
            ]}
            renderItem={({ item }) => (
              <MapReportCard
                row={item}
                width={width - 32}
                selected={item.store.id === selected}
                onOpen={() => {
                  setListMode(false);
                  openReport(item.signal.id);
                }}
                onStore={() => {
                  selectStore(item.store.id);
                  setListMode(false);
                }}
              />
            )}
            ListEmptyComponent={
              <Text style={s.emptyCopy}>
                No matching reports. Try another location or filter.
              </Text>
            }
          />
        </View>
      </Modal>
      <Modal
        visible={unlocatedOpen}
        animationType="slide"
        onRequestClose={() => setUnlocatedOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: c.background,
            paddingTop: insets.top + 16,
          }}
        >
          <View style={[s.row, { paddingHorizontal: 20 }]}>
            <Text style={[s.section, { flex: 1 }]}>Reports without pins</Text>
            <Button label="Close" onPress={() => setUnlocatedOpen(false)} />
          </View>
          <Text
            style={[s.copy, { paddingHorizontal: 20, paddingVertical: 12 }]}
          >
            Stores in the cities around your search. Distance and radius
            inclusion are unverified until their map locations are available.
          </Text>
          <FlatList
            data={unlocated}
            keyExtractor={(signal) => signal.id}
            initialNumToRender={5}
            windowSize={5}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 20,
            }}
            renderItem={({ item }) => (
              <SignalCard
                signal={item}
                onPress={() => {
                  setUnlocatedOpen(false);
                  openReport(item.id);
                }}
              />
            )}
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
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close location search"
            onPress={() => {
              Keyboard.dismiss();
              setPlaceSheet(false);
            }}
          />
          <View style={s.sheet}>
            <View style={s.row}>
              <Text style={[s.section, { flex: 1 }]}>Search location</Text>
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
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Dismiss filters"
            onPress={() => setFilters(false)}
          />
          <ScrollView
            style={{ flexGrow: 0, maxHeight: "85%" }}
            contentContainerStyle={s.sheet}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.row}>
              <Text style={[s.section, { flex: 1 }]}>Map filters</Text>
              <Button
                label="Show results"
                onPress={() => {
                  setRadius(filterDraft.radius);
                  setTiers(filterDraft.tiers);
                  setFresh(filterDraft.fresh);
                  setWatchOnly(filterDraft.watchOnly);
                  setFilters(false);
                }}
              />
            </View>
            <Button
              label="Reset filters"
              onPress={() =>
                setFilterDraft({
                  radius: 25,
                  tiers: "",
                  fresh: "",
                  watchOnly: false,
                })
              }
            />
            <Text style={s.eyebrow}>DISTANCE</Text>
            <View style={s.wrap}>
              {[10, 25, 50, 100].map((n) => (
                <Button
                  key={n}
                  label={`${n} mi`}
                  selected={filterDraft.radius === n}
                  onPress={() => setFilterDraft((v) => ({ ...v, radius: n }))}
                />
              ))}
            </View>
            <Text style={s.eyebrow}>BOTTLES</Text>
            <View style={s.wrap}>
              <Button
                label="All bottles"
                selected={!filterDraft.watchOnly}
                onPress={() =>
                  setFilterDraft((v) => ({ ...v, watchOnly: false }))
                }
              />
              <Button
                label="My watchlist"
                selected={filterDraft.watchOnly}
                disabled={watched === null}
                onPress={() =>
                  setFilterDraft((v) => ({ ...v, watchOnly: true }))
                }
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
                  selected={filterDraft.tiers === v}
                  onPress={() => setFilterDraft((d) => ({ ...d, tiers: v }))}
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
                  selected={filterDraft.fresh === v}
                  onPress={() => setFilterDraft((d) => ({ ...d, fresh: v }))}
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
  feedDock: { position: "absolute", bottom: 0, left: 0, right: 0, gap: 8 },
  feedToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 10,
  },
  feedCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: "#181410F2",
    borderWidth: 1,
    borderColor: c.border,
  },
  feedCountText: { color: c.text, fontSize: 12, fontWeight: "600" },
  emptyCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  notice: {
    marginHorizontal: 16,
    padding: 8,
    color: c.text,
    backgroundColor: c.surface,
    borderRadius: 8,
    fontSize: 11,
  },
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

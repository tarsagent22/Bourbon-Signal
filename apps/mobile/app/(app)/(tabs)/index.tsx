import { useAuth } from "@clerk/expo";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberAlertsResponse, MemberPreferences, MemberProfile, Signal, SignalFeedPage } from "../../../src/api/types";
import { SignalCard } from "../../../src/components/SignalCard";
import { parseTripModeState, serializeTripModeState, signalFiltersForTrip, tripModeForState, tripModeStorageKeyForUser, type TripModeState } from "../../../src/home/trip-mode";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { alertIsStale, radarMonitoringSummary, radarWatchlistSummary } from "../../../src/radar/radar-preferences";
import { DEFAULT_SIGNAL_FILTERS, areaOptionsForState, areaSelectorLabel, filterSignalsByRarity, normalizedFilters, rarityOptionsForView, serverSignalFilters, shouldBackfillRarity, toggleRarity, type SignalFeedFilters } from "../../../src/signals/feed-filters";
import { colors } from "../../../src/theme";

type FeedView = "market" | "community";

function OptionChooser({
  label,
  value,
  placeholder,
  clearLabel,
  options,
  icon,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  clearLabel?: string;
  options: Array<{ value: string; label: string }>;
  icon: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label || placeholder;
  const visibleOptions = value ? [{ value: "", label: clearLabel || placeholder }, ...options] : options;
  useEffect(() => { if (disabled) setExpanded(false); }, [disabled]);
  return <View style={[styles.fieldGroup, styles.filterChooser, disabled && styles.filterChooserDisabled]}>
    <Pressable
      accessibilityLabel={`${label}, ${selectedLabel}`}
      accessibilityRole="button"
      accessibilityState={{ expanded, disabled }}
      disabled={disabled}
      onPress={() => setExpanded((current) => !current)}
      style={({ pressed }) => [styles.chooserButton, pressed && styles.segmentPressed]}
    >
      <MaterialCommunityIcons color={disabled ? colors.border : colors.muted} name={icon as never} size={18} />
      <Text numberOfLines={1} style={[styles.chooserValue, !value && styles.chooserPlaceholder]}>{selectedLabel}</Text>
      <MaterialCommunityIcons color={disabled ? colors.border : colors.muted} name={expanded ? "chevron-up" : "chevron-down"} size={19} />
    </Pressable>
    {expanded && !disabled ? <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.chooserOptions}>
      {visibleOptions.map((option) => {
        const selected = option.value === value;
        return <Pressable
          key={option.value || "__all"}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          onPress={() => { onChange(option.value); setExpanded(false); }}
          style={({ pressed }) => [styles.chooserOption, selected && styles.chooserOptionSelected, pressed && styles.segmentPressed]}
        >
          <Text style={[styles.chooserOptionText, selected && styles.rarityChipTextSelected]}>{option.label}</Text>
          {selected ? <MaterialCommunityIcons color={colors.accent} name="check" size={18} /> : null}
        </Pressable>;
      })}
    </ScrollView> : null}
  </View>;
}

function FeedSkeleton() {
  return (
    <View accessibilityLabel="Loading Signals" style={styles.skeletonList}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonTop} />
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonShort} />
        </View>
      ))}
    </View>
  );
}

export default function SignalFeedScreen() {
  const api = useMobileApi();
  const { isLoaded: authLoaded, userId } = useAuth();
  const [view, setView] = useState<FeedView>("market");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [access, setAccess] = useState<SignalFeedPage["access"] | null>(null);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [alerts, setAlerts] = useState<MemberAlertsResponse | null>(null);
  const [tripMode, setTripMode] = useState<TripModeState | null>(null);
  const [tripRestoreReady, setTripRestoreReady] = useState(false);
  const [tripChooserOpen, setTripChooserOpen] = useState(false);
  const [tripError, setTripError] = useState("");
  const [filtersByView, setFiltersByView] = useState<Record<FeedView, SignalFeedFilters>>({
    market: { ...DEFAULT_SIGNAL_FILTERS },
    community: { ...DEFAULT_SIGNAL_FILTERS },
  });
  const [bottleQueries, setBottleQueries] = useState<Record<FeedView, string>>({ market: "", community: "" });
  const [remoteAreaState, setRemoteAreaState] = useState("");
  const [remoteAreaOptions, setRemoteAreaOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [areaOptionsLoading, setAreaOptionsLoading] = useState(false);
  const [areaOptionsError, setAreaOptionsError] = useState("");
  const filters = filtersByView[view];
  const effectiveFilters = useMemo(() => signalFiltersForTrip(filters, tripMode), [filters, tripMode]);
  const requestFilters = useMemo(() => serverSignalFilters(effectiveFilters), [effectiveFilters]);
  const visibleSignals = useMemo(() => filterSignalsByRarity(signals, filters.rarities), [filters.rarities, signals]);
  const rarityBackfillKey = JSON.stringify([view, requestFilters.state, requestFilters.area, requestFilters.freshness, requestFilters.bottle, filters.rarities]);
  const areaDirectory = profile?.feedAreas;
  const stateOptions = areaDirectory?.states.filter((state) => /^[A-Z]{2}$/.test(state.code)).map((state) => ({ value: state.code, label: `${state.label} (${state.code})` })) || [];
  const staticAreaOptions = areaOptionsForState(areaDirectory, effectiveFilters.state);
  const areaOptions = effectiveFilters.state !== "NC" && remoteAreaState === effectiveFilters.state && remoteAreaOptions.length
    ? remoteAreaOptions
    : staticAreaOptions;
  const areaLabel = effectiveFilters.state
    ? areaDirectory?.states.find((state) => state.code === effectiveFilters.state)?.areaLabel || areaSelectorLabel(effectiveFilters.state)
    : "Area / Board";
  const bottleQuery = bottleQueries[view];
  const tripStorageKey = useMemo(() => userId ? tripModeStorageKeyForUser(userId) : null, [userId]);
  const requestSequence = useRef(0);
  const requestInFlightRef = useRef<"refresh" | "page" | null>(null);
  const rarityBackfillRef = useRef({ key: "", attempts: 0 });
  const filtersByViewRef = useRef(filtersByView);
  const preTripGeographyRef = useRef<Record<FeedView, Pick<SignalFeedFilters, "state" | "area">> | null>(null);
  const tripRestoredRef = useRef(false);
  filtersByViewRef.current = filtersByView;

  const resetFeed = useCallback(() => {
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setSignals([]);
    setCursor(null);
    setHasMore(true);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, []);

  const handleError = useCallback((caught: unknown) => {
    const apiError = caught instanceof MobileApiError ? caught : null;
    setError(apiError?.status === 401
      ? "Your session could not be verified. Return to login and try again."
      : apiError?.message || "Signals are temporarily unavailable.");
  }, []);

  const loadProfile = useCallback(async (fresh = false) => {
    setProfileError("");
    setAlerts(null);
    const profilePromise = api.getMemberProfile({ fresh });
    const personalizationPromise = Promise.allSettled([
      api.getMemberPreferences({ fresh }),
      api.getMemberAlerts({ fresh }),
    ]);
    const tripPromise = tripStorageKey ? SecureStore.getItemAsync(tripStorageKey) : Promise.resolve(null);
    const [profileResult, tripResult] = await Promise.allSettled([profilePromise, tripPromise]);
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value.profile);
      if (!tripRestoredRef.current && tripResult.status === "fulfilled") {
        tripRestoredRef.current = true;
        const restoredTrip = parseTripModeState(tripResult.value, profileResult.value.profile.feedAreas);
        if (restoredTrip) {
          const current = filtersByViewRef.current;
          preTripGeographyRef.current = {
            market: { state: current.market.state, area: current.market.area },
            community: { state: current.community.state, area: current.community.area },
          };
        }
        setTripMode(restoredTrip);
        if (restoredTrip) resetFeed();
        else if (tripResult.value && tripStorageKey) void SecureStore.deleteItemAsync(tripStorageKey).catch(() => undefined);
      }
      if (tripResult.status === "fulfilled") setTripRestoreReady(true);
    }
    const [preferencesResult, alertsResult] = await personalizationPromise;
    if (preferencesResult.status === "fulfilled") setPreferences(preferencesResult.value);
    if (alertsResult.status === "fulfilled") setAlerts(alertsResult.value);
    const failed = [profileResult, tripResult, preferencesResult, alertsResult].some((result) => result.status === "rejected");
    if (failed) setProfileError("Some Home personalization is temporarily unavailable. Tap to retry.");
  }, [api, resetFeed, tripStorageKey]);

  const load = useCallback(async (refresh = false) => {
    const mode = refresh ? "refresh" : "page";
    const inFlight = requestInFlightRef.current;
    if (inFlight === "refresh" || (inFlight === "page" && !refresh) || (!refresh && !hasMore)) return;
    if (refresh && inFlight === "page") requestSequence.current += 1;
    const requestId = ++requestSequence.current;
    requestInFlightRef.current = mode;
    if (refresh) rarityBackfillRef.current.attempts = 0;
    setLoading(true);
    setError("");
    try {
      const page = await api.listSignals({ view, limit: 30, cursor: refresh ? null : cursor, fresh: refresh, ...requestFilters });
      if (requestId !== requestSequence.current) return;
      setSignals((current) => {
        const next = refresh ? page.signals : [...current, ...page.signals];
        return [...new Map(next.map((signal) => [signal.id, signal])).values()];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setAccess(page.access);
      setLoaded(true);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      const apiError = caught instanceof MobileApiError ? caught : null;
      if (apiError?.resetCursor && !refresh) {
        setCursor(null);
        setHasMore(true);
        setSignals([]);
        setLoaded(false);
        setError("The feed changed while you were reading. Pull to refresh.");
      } else handleError(caught);
    } finally {
      if (requestId === requestSequence.current) {
        requestInFlightRef.current = null;
        setLoading(false);
      }
    }
  }, [api, cursor, handleError, hasMore, requestFilters, view]);

  const selectView = useCallback((next: FeedView) => {
    if (next === view) return;
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setView(next);
    setSignals([]);
    setCursor(null);
    setHasMore(true);
    setAccess(null);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, [view]);

  const applyFilters = useCallback((next: SignalFeedFilters) => {
    const normalized = normalizedFilters(next, areaDirectory);
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setFiltersByView((current) => ({ ...current, [view]: normalized }));
    setSignals([]);
    setCursor(null);
    setHasMore(true);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, [areaDirectory, view]);

  const applyRarityFilters = useCallback((next: SignalFeedFilters) => {
    setFiltersByView((current) => ({
      ...current,
      [view]: { ...current[view], rarities: [...next.rarities] },
    }));
  }, [view]);

  const activateTripMode = useCallback(async (state: string) => {
    const next = tripModeForState(state, areaDirectory);
    if (!next) {
      setTripError("That destination is not available in your Home areas.");
      return;
    }
    if (!preTripGeographyRef.current) {
      const current = filtersByViewRef.current;
      preTripGeographyRef.current = {
        market: { state: current.market.state, area: current.market.area },
        community: { state: current.community.state, area: current.community.area },
      };
    }
    setTripError("");
    setTripMode(next);
    setTripChooserOpen(false);
    resetFeed();
    try {
      if (!tripStorageKey) throw new Error("Signed-in account unavailable");
      await SecureStore.setItemAsync(tripStorageKey, serializeTripModeState(next));
    } catch {
      setTripError("Trip Mode is active, but it could not be saved on this device.");
    }
  }, [areaDirectory, resetFeed, tripStorageKey]);

  const exitTripMode = useCallback(async () => {
    const previousGeography = preTripGeographyRef.current;
    if (previousGeography) {
      setFiltersByView((current) => ({
        market: { ...current.market, ...previousGeography.market },
        community: { ...current.community, ...previousGeography.community },
      }));
      preTripGeographyRef.current = null;
    }
    setTripMode(null);
    setTripChooserOpen(false);
    setTripError("");
    resetFeed();
    try {
      if (!tripStorageKey) throw new Error("Signed-in account unavailable");
      await SecureStore.deleteItemAsync(tripStorageKey);
    } catch {
      setTripError("Trip Mode ended, but its saved device state could not be cleared.");
    }
  }, [resetFeed, tripStorageKey]);

  useEffect(() => {
    if (!authLoaded || !tripStorageKey) return;
    tripRestoredRef.current = false;
    preTripGeographyRef.current = null;
    setTripMode(null);
    setProfile(null);
    setPreferences(null);
    setAlerts(null);
    setTripRestoreReady(false);
    resetFeed();
    void loadProfile();
  }, [authLoaded, loadProfile, resetFeed, tripStorageKey]);
  useEffect(() => { if (tripRestoreReady && !loaded && !loading && !error) void load(true); }, [error, load, loaded, loading, tripRestoreReady]);
  useEffect(() => {
    if (rarityBackfillRef.current.key !== rarityBackfillKey) {
      rarityBackfillRef.current = { key: rarityBackfillKey, attempts: 0 };
    }
    const backfill = rarityBackfillRef.current;
    if (loaded && shouldBackfillRarity({ rarities: filters.rarities, visibleCount: visibleSignals.length, hasMore, loading, error, attempts: backfill.attempts })) {
      backfill.attempts += 1;
      void load(false);
    }
  }, [error, filters.rarities, hasMore, load, loaded, loading, rarityBackfillKey, visibleSignals.length]);
  useEffect(() => {
    const normalizedBottle = bottleQuery.replace(/\s+/g, " ").trim().slice(0, 100);
    if (normalizedBottle === filters.bottle) return;
    const timer = setTimeout(() => applyFilters({ ...filters, bottle: bottleQuery }), 350);
    return () => clearTimeout(timer);
  }, [applyFilters, bottleQuery, filters]);
  useEffect(() => {
    if (!effectiveFilters.state || effectiveFilters.state === "NC") {
      setAreaOptionsLoading(false);
      setAreaOptionsError("");
      return;
    }
    let current = true;
    setAreaOptionsLoading(true);
    setAreaOptionsError("");
    void api.getSignalAreaOptions(effectiveFilters.state).then((options) => {
      if (!current) return;
      setRemoteAreaState(effectiveFilters.state);
      setRemoteAreaOptions(options);
      if (!options.length && !staticAreaOptions.length) setAreaOptionsError("No city options are available for this state yet.");
    }).catch(() => {
      if (current && !staticAreaOptions.length) setAreaOptionsError("City options are temporarily unavailable.");
    }).finally(() => { if (current) setAreaOptionsLoading(false); });
    return () => { current = false; };
  }, [api, effectiveFilters.state, staticAreaOptions.length]);

  const marketLocked = view === "market" && Boolean(access?.marketDetailsLocked);
  const paidAccessMismatch = Boolean(profile?.membership.paid && marketLocked);
  const canUseFilters = view === "community" || access?.marketDetailsLocked === false;
  const currentMatchCount = alerts ? alerts.alerts.filter((alert) => !alert.archivedAt && !alertIsStale(alert)).length : null;
  const radarStatus = preferences
    ? `${radarWatchlistSummary(preferences)} · ${radarMonitoringSummary(preferences.monitoringScopes)} · ${currentMatchCount === null ? "matches unavailable" : `${currentMatchCount} current match${currentMatchCount === 1 ? "" : "es"}`}`
    : "Radar status is temporarily unavailable";
  const tripDestination = tripMode ? stateOptions.find((option) => option.value === tripMode.state)?.label || tripMode.state : "";

  const header = (
    <View style={styles.header}>
      <View accessibilityLabel="Home overview" style={styles.homeOverview}>
        <Text style={styles.homeEyebrow}>HOME</Text>
        <Text accessibilityRole="header" style={styles.homeTitle}>Your Bourbon Signal home</Text>
        <Text style={styles.homeIntro}>{profile?.displayName ? `Welcome back, ${profile.displayName}.` : "Your personalized bourbon activity, in one place."}</Text>
        <View style={styles.homeRule} />
        <View style={styles.homeStatusRow}>
          <View style={styles.homeStatusIcon}><MaterialCommunityIcons color={colors.accent} name="radar" size={21} /></View>
          <View style={styles.homeStatusCopy}><Text style={styles.homeStatusTitle}>Radar</Text><Text numberOfLines={2} style={styles.homeStatusDetail}>{radarStatus}</Text></View>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(app)/(tabs)/radar", params: { section: "matches", request: Date.now().toString() } })} style={({ pressed }) => [styles.homeAction, pressed && styles.segmentPressed]}><Text style={styles.homeActionText}>OPEN RADAR</Text></Pressable>
        </View>
        <View style={styles.homeRule} />
        <View style={styles.homeStatusRow}>
          <View style={styles.homeStatusIcon}><MaterialCommunityIcons color={tripMode ? colors.success : colors.muted} name="map-marker-path" size={21} /></View>
          <View style={styles.homeStatusCopy}>
            <Text style={styles.homeStatusTitle}>{tripMode ? "Trip Mode active" : "Trip Mode"}</Text>
            <Text numberOfLines={2} style={styles.homeStatusDetail}>{tripMode ? `Home is browsing ${tripDestination}.` : "Temporarily browse Signals in another state."}</Text>
          </View>
          {tripMode
            ? <Pressable accessibilityLabel="Exit Trip Mode" accessibilityRole="button" onPress={() => void exitTripMode()} style={({ pressed }) => [styles.homeAction, pressed && styles.segmentPressed]}><Text style={styles.homeActionText}>EXIT</Text></Pressable>
            : <Pressable accessibilityRole="button" accessibilityState={{ expanded: tripChooserOpen }} onPress={() => setTripChooserOpen((current) => !current)} style={({ pressed }) => [styles.homeAction, pressed && styles.segmentPressed]}><Text style={styles.homeActionText}>CHOOSE STATE</Text></Pressable>}
        </View>
        {!tripMode && tripChooserOpen ? <View accessibilityLabel="Trip Mode destinations" style={styles.tripDestinations}>
          {stateOptions.map((option) => <Pressable accessibilityLabel={`Start Trip Mode for ${option.label}`} accessibilityRole="button" key={option.value} onPress={() => void activateTripMode(option.value)} style={({ pressed }) => [styles.tripDestination, pressed && styles.segmentPressed]}><Text style={styles.tripDestinationCode}>{option.value}</Text><Text numberOfLines={1} style={styles.tripDestinationLabel}>{option.label.replace(` (${option.value})`, "")}</Text></Pressable>)}
        </View> : null}
        {tripError ? <Text accessibilityRole="alert" style={styles.tripError}>{tripError}</Text> : null}
      </View>
      <View accessibilityLabel="Signal feed view" style={styles.segmentedControl}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: view === "market" }}
          onPress={() => selectView("market")}
          style={({ pressed }) => [styles.segment, view === "market" && styles.segmentSelected, pressed && styles.segmentPressed]}
        >
          <MaterialCommunityIcons color={view === "market" ? colors.accent : colors.muted} name="radio-tower" size={20} />
          <Text style={[styles.segmentLabel, view === "market" && styles.segmentLabelSelected]}>Intel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: view === "community" }}
          onPress={() => selectView("community")}
          style={({ pressed }) => [styles.segment, view === "community" && styles.segmentSelected, pressed && styles.segmentPressed]}
        >
          <MaterialCommunityIcons color={view === "community" ? colors.accent : colors.muted} name="account-group-outline" size={21} />
          <Text style={[styles.segmentLabel, view === "community" && styles.segmentLabelSelected]}>Community</Text>
        </Pressable>
      </View>

      {canUseFilters ? <>
        <View accessibilityLabel="Signal geography filters" style={styles.geographyRow}>
          <OptionChooser
            label="State"
            icon="map-marker-outline"
            value={effectiveFilters.state}
            placeholder="State"
            clearLabel="Any state"
            options={stateOptions}
            onChange={(state) => tripMode ? state ? void activateTripMode(state) : void exitTripMode() : applyFilters({ ...filters, state, area: "" })}
          />
          <OptionChooser
            label={areaLabel}
            icon="map-marker-radius-outline"
            value={effectiveFilters.area}
            placeholder={effectiveFilters.state ? areaLabel : "Area / Board"}
            clearLabel={`Any ${areaLabel.toLowerCase()}`}
            options={areaOptions}
            disabled={!effectiveFilters.state}
            onChange={(area) => applyFilters({ ...effectiveFilters, area })}
          />
        </View>
        {effectiveFilters.state && effectiveFilters.state !== "NC" && areaOptionsLoading ? <Text style={styles.areaOptionNote}>Loading cities…</Text> : null}
        {effectiveFilters.state && areaOptionsError ? <Text accessibilityRole="alert" style={styles.areaOptionError}>{areaOptionsError}</Text> : null}

        <View style={styles.filterInputShell}>
          <MaterialCommunityIcons color={colors.muted} name="magnify" size={20} />
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={(bottle) => setBottleQueries((current) => ({ ...current, [view]: bottle }))}
            onSubmitEditing={() => Keyboard.dismiss()}
            placeholder="Search bottle name"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.filterInput}
            value={bottleQuery}
          />
          {bottleQuery ? <Pressable accessibilityLabel="Clear bottle search" accessibilityRole="button" hitSlop={8} onPress={() => setBottleQueries((current) => ({ ...current, [view]: "" }))} style={styles.inputClearButton}><MaterialCommunityIcons color={colors.muted} name="close-circle" size={19} /></Pressable> : null}
        </View>

        <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.rarityRow} showsHorizontalScrollIndicator={false} accessibilityLabel="Bottle rarity filters">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filters.rarities.length === 0 }}
            onPress={() => applyRarityFilters({ ...filters, rarities: [] })}
            style={({ pressed }) => [styles.rarityChip, filters.rarities.length === 0 && styles.rarityChipSelected, pressed && styles.segmentPressed]}
          >
            <Text style={[styles.rarityChipText, filters.rarities.length === 0 && styles.rarityChipTextSelected]}>All</Text>
          </Pressable>
          {rarityOptionsForView(view).map((option) => {
            const selected = filters.rarities.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => applyRarityFilters(toggleRarity(filters, option.value))}
                style={({ pressed }) => [styles.rarityChip, selected && styles.rarityChipSelected, pressed && styles.segmentPressed]}
              >
                <Text style={[styles.rarityChipText, selected && styles.rarityChipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </> : null}

      {profileError ? (
        <Pressable accessibilityRole="button" onPress={() => loadProfile(true)} style={styles.inlineError}>
          <Text accessibilityRole="alert" style={styles.inlineErrorText}>{profileError}</Text>
        </Pressable>
      ) : null}

      {paidAccessMismatch ? (
        <View style={styles.inlineError}>
          <Text accessibilityRole="alert" style={styles.inlineErrorText}>Paid access was not recognized. Refresh or sign in again.</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <FlatList
      contentContainerStyle={styles.list}
      data={visibleSignals}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SignalCard signal={item} onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: item.id } })} />}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => { if (tripRestoreReady) void load(true); void loadProfile(true); }} tintColor={colors.accent} colors={[colors.accent]} />}
      onEndReached={() => { if (loaded && signals.length && !filters.rarities.length) void load(false); }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={header}
      ListEmptyComponent={!loaded && loading
        ? <FeedSkeleton />
        : error
          ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(true)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View>
          : filters.rarities.length && loading
            ? <View style={styles.message}><Text style={styles.loadingText}>Finding more matching Signals…</Text></View>
            : <Text style={styles.empty}>{filters.rarities.length
              ? view === "community" ? "No member sightings match these tiers." : "No Intel Signals match these tiers right now."
              : view === "community" ? "No member sightings yet." : "No fresh Intel Signals are available right now."}</Text>}
      ListFooterComponent={loaded && loading
        ? <View style={styles.footer}><Text style={styles.loadingText}>Loading…</Text></View>
        : error && signals.length
          ? <View style={styles.footer}><Text accessibilityRole="alert" style={styles.footerError}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(false)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View>
          : loaded && filters.rarities.length > 0 && hasMore
            ? <View style={styles.footer}><Pressable accessibilityRole="button" onPress={() => load(false)} style={styles.retryTarget}><Text style={styles.retry}>Load more matching Signals</Text></Pressable></View>
            : loaded && !hasMore && visibleSignals.length
              ? <Text style={styles.end}>You’re caught up.</Text>
              : null}
    />
    </>
    );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 64 },
  gap: { height: 12 },
  header: { gap: 11, marginBottom: 14 },
  homeOverview: { gap: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 15 },
  homeEyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  homeTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800" },
  homeIntro: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  homeRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  homeStatusRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10 },
  homeStatusIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.surfaceRaised },
  homeStatusCopy: { flex: 1, gap: 2 },
  homeStatusTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  homeStatusDetail: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  homeAction: { minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  homeActionText: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.45 },
  tripDestinations: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingTop: 2 },
  tripDestination: { minHeight: 38, maxWidth: "48%", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 9 },
  tripDestinationCode: { color: colors.accent, fontSize: 11, fontWeight: "800" },
  tripDestinationLabel: { flexShrink: 1, color: colors.text, fontSize: 11, fontWeight: "600" },
  tripError: { color: colors.danger, fontSize: 11, lineHeight: 15 },
  segmentedControl: { flexDirection: "row", padding: 3, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segmentSelected: { backgroundColor: "#241A10" },
  segmentPressed: { opacity: 0.78 },
  segmentLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  segmentLabelSelected: { color: colors.text },
  geographyRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 8 },
  filterChooser: { flex: 1, minWidth: 0 },
  filterChooserDisabled: { opacity: 0.48 },
  rarityRow: { flexGrow: 1, gap: 7, paddingRight: 8, justifyContent: "center" },
  rarityChip: { minHeight: 36, justifyContent: "center", paddingHorizontal: 13, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  rarityChipSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" },
  rarityChipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  rarityChipTextSelected: { color: colors.text },
  inlineError: { borderRadius: 12, borderColor: colors.danger, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  inlineErrorText: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  summaryList: { gap: 12 },
  unlockCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, borderColor: colors.accentPressed, borderWidth: StyleSheet.hairlineWidth, backgroundColor: "#201810", padding: 14 },
  unlockIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2C2115" },
  unlockCopy: { flex: 1, gap: 3 },
  unlockTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  unlockText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  skeletonList: { gap: 12 },
  skeletonCard: { height: 132, borderRadius: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 11 },
  skeletonTop: { width: 80, height: 15, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  skeletonTitle: { width: "68%", height: 20, borderRadius: 7, backgroundColor: colors.surfaceRaised },
  skeletonLine: { width: "84%", height: 14, borderRadius: 7, backgroundColor: colors.surfaceRaised },
  skeletonShort: { width: "45%", height: 12, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  message: { alignItems: "center", gap: 12, padding: 28 },
  error: { color: colors.danger, textAlign: "center" },
  retry: { color: colors.accent, fontWeight: "800" },
  retryTarget: { minWidth: 80, minHeight: 44, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center", padding: 32, lineHeight: 20 },
  footer: { padding: 20, alignItems: "center", gap: 8 },
  loadingText: { color: colors.muted, fontSize: 12 },
  footerError: { color: colors.danger, textAlign: "center" },
  end: { color: colors.muted, textAlign: "center", padding: 24, fontSize: 12 },
  fieldGroup: { gap: 6 },
  chooserButton: { minHeight: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7 },
  chooserValue: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  chooserPlaceholder: { color: colors.muted, fontWeight: "500" },
  chooserOptions: { maxHeight: 190, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  chooserOption: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chooserOptionSelected: { backgroundColor: "#2A1F13" },
  chooserOptionText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  areaOptionNote: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: "center" },
  areaOptionError: { color: colors.danger, fontSize: 11, lineHeight: 15, textAlign: "center" },
  filterInputShell: { minHeight: 46, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 12, paddingRight: 6, gap: 7 },
  filterInput: { minHeight: 44, flex: 1, color: colors.text, fontSize: 15, paddingRight: 6 },
  inputClearButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAuth } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, FlatList, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import { relativeSignalTime, signalAccessibilityTime } from "../../../src/api/presentation";
import type { MemberProfile, Signal, SignalFeedPage } from "../../../src/api/types";
import { SignalCard } from "../../../src/components/SignalCard";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { DEFAULT_SIGNAL_FILTERS, areaOptionsForState, areaSelectorLabel, filterSignalsByRarity, normalizedFilters, rarityOptionsForView, serverSignalFilters, shouldBackfillRarity, toggleRarity, type SignalFeedFilters } from "../../../src/signals/feed-filters";
import { acceptQueuedSignals, recentTickerSignals, reconcileDisplayedSignals, reconcileQueuedSignals, tickerLocationLabel } from "../../../src/signals/home-feed-live";
import { homeBrowsingStorageKey, loadHomeBrowsingPreferences, saveHomeBrowsingPreferences } from "../../../src/signals/home-browsing-preferences";
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
  const { userId } = useAuth();
  const browsingStorageKey = homeBrowsingStorageKey(userId);
  const [view, setView] = useState<FeedView>("market");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [queuedSignals, setQueuedSignals] = useState<Signal[]>([]);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerNow, setTickerNow] = useState(() => Date.now());
  const [reduceMotion, setReduceMotion] = useState(true);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(true);
  const [screenFocused, setScreenFocused] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [access, setAccess] = useState<SignalFeedPage["access"] | null>(null);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [filtersByView, setFiltersByView] = useState<Record<FeedView, SignalFeedFilters>>({
    market: { ...DEFAULT_SIGNAL_FILTERS },
    community: { ...DEFAULT_SIGNAL_FILTERS },
  });
  const [bottleQueries, setBottleQueries] = useState<Record<FeedView, string>>({ market: "", community: "" });
  const [remoteAreaState, setRemoteAreaState] = useState("");
  const [remoteAreaOptions, setRemoteAreaOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [areaOptionsLoading, setAreaOptionsLoading] = useState(false);
  const [areaOptionsError, setAreaOptionsError] = useState("");
  const [loadedBrowsingStorageKey, setLoadedBrowsingStorageKey] = useState("");
  const browsingLoaded = Boolean(browsingStorageKey) && loadedBrowsingStorageKey === browsingStorageKey;
  const filters = filtersByView[view];
  const requestFilters = useMemo(() => serverSignalFilters(filters), [filters]);
  const visibleSignals = useMemo(() => filterSignalsByRarity(signals, filters.rarities), [filters.rarities, signals]);
  const tickerSignals = useMemo(() => recentTickerSignals(visibleSignals, new Date(tickerNow)), [tickerNow, visibleSignals]);
  const tickerSignal = tickerSignals.length ? tickerSignals[tickerIndex % tickerSignals.length] : null;
  const scopeKey = JSON.stringify([userId, view, requestFilters, filters.rarities]);
  const screenActive = screenFocused && appState === "active";
  const motionDisabled = reduceMotion || screenReaderEnabled;
  const rarityBackfillKey = JSON.stringify([view, requestFilters.state, requestFilters.area, requestFilters.freshness, requestFilters.bottle, filters.rarities]);
  const areaDirectory = profile?.feedAreas;
  const stateOptions = areaDirectory?.states.filter((state) => /^[A-Z]{2}$/.test(state.code)).map((state) => ({ value: state.code, label: `${state.label} (${state.code})` })) || [];
  const staticAreaOptions = areaOptionsForState(areaDirectory, filters.state);
  const areaOptions = filters.state !== "NC" && remoteAreaState === filters.state && remoteAreaOptions.length
    ? remoteAreaOptions
    : staticAreaOptions;
  const areaLabel = filters.state
    ? areaDirectory?.states.find((state) => state.code === filters.state)?.areaLabel || areaSelectorLabel(filters.state)
    : "Area / Board";
  const bottleQuery = bottleQueries[view];
  const requestSequence = useRef(0);
  const requestInFlightRef = useRef<"refresh" | "page" | null>(null);
  const rarityBackfillRef = useRef({ key: "", attempts: 0 });
  const profileRequestSequence = useRef(0);
  const browsingMutationSequence = useRef(0);
  const backgroundRequestSequence = useRef(0);
  const scopeKeyRef = useRef(scopeKey);
  const listRef = useRef<FlatList<Signal>>(null);
  const signalsSnapshotRef = useRef<Signal[]>(signals);
  const accessSnapshotRef = useRef<SignalFeedPage["access"] | null>(access);
  const latestDisplayedBaselineRef = useRef("");
  const tickerOpacity = useRef(new Animated.Value(1)).current;
  const tickerAnimationGeneration = useRef(0);
  scopeKeyRef.current = scopeKey;
  signalsSnapshotRef.current = signals;
  accessSnapshotRef.current = access;

  const handleError = useCallback((caught: unknown) => {
    const apiError = caught instanceof MobileApiError ? caught : null;
    if (apiError?.status === 401 || apiError?.status === 403) {
      requestSequence.current += 1;
      backgroundRequestSequence.current += 1;
      requestInFlightRef.current = null;
      setSignals([]);
      setQueuedSignals([]);
      setHighlightedIds([]);
      setAccess(null);
      setCursor(null);
      setHasMore(false);
      setLoading(false);
      latestDisplayedBaselineRef.current = "";
    }
    setError(apiError?.status === 401
      ? "Your session could not be verified. Return to login and try again."
      : apiError?.message || "Signals are temporarily unavailable.");
  }, []);

  const loadProfile = useCallback(async (fresh = false) => {
    const requestId = ++profileRequestSequence.current;
    setProfileError("");
    try {
      const response = await api.getMemberProfile({ fresh });
      if (requestId === profileRequestSequence.current) setProfile(response.profile);
    } catch {
      if (requestId === profileRequestSequence.current) setProfileError("Home filters are temporarily unavailable. Tap to retry.");
    }
  }, [api]);

  const load = useCallback(async (refresh = false) => {
    const mode = refresh ? "refresh" : "page";
    const inFlight = requestInFlightRef.current;
    if (inFlight === "refresh" || (inFlight === "page" && !refresh) || (!refresh && !hasMore)) return;
    if (refresh) {
      backgroundRequestSequence.current += 1;
      setQueuedSignals([]);
    }
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
      if (refresh) latestDisplayedBaselineRef.current = page.signals[0]?.timing.displayAt || "";
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setAccess(page.access);
      if (refresh) setQueuedSignals([]);
      setLoaded(true);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      const apiError = caught instanceof MobileApiError ? caught : null;
      if (apiError?.resetCursor && !refresh) {
        setCursor(null);
        setHasMore(false);
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
    browsingMutationSequence.current += 1;
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setView(next);
    setSignals([]);
    setQueuedSignals([]);
    setHighlightedIds([]);
    setCursor(null);
    setHasMore(true);
    setAccess(null);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, [view]);

  const applyFilters = useCallback((next: SignalFeedFilters) => {
    browsingMutationSequence.current += 1;
    const normalized = normalizedFilters(next, areaDirectory);
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setFiltersByView((current) => ({ ...current, [view]: normalized }));
    setSignals([]);
    setQueuedSignals([]);
    setHighlightedIds([]);
    setCursor(null);
    setHasMore(true);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, [areaDirectory, view]);

  const applyRarityFilters = useCallback((next: SignalFeedFilters) => {
    browsingMutationSequence.current += 1;
    backgroundRequestSequence.current += 1;
    setQueuedSignals([]);
    setHighlightedIds([]);
    setFiltersByView((current) => ({
      ...current,
      [view]: { ...current[view], rarities: [...next.rarities] },
    }));
  }, [view]);

  useEffect(() => {
    let current = true;
    const mutationAtStart = browsingMutationSequence.current;
    requestSequence.current += 1;
    backgroundRequestSequence.current += 1;
    profileRequestSequence.current += 1;
    requestInFlightRef.current = null;
    setLoadedBrowsingStorageKey("");
    setView("market");
    setFiltersByView({ market: { ...DEFAULT_SIGNAL_FILTERS }, community: { ...DEFAULT_SIGNAL_FILTERS } });
    setBottleQueries({ market: "", community: "" });
    setSignals([]);
    setQueuedSignals([]);
    setHighlightedIds([]);
    setCursor(null);
    setHasMore(true);
    setAccess(null);
    setProfile(null);
    setProfileError("");
    setRemoteAreaState("");
    setRemoteAreaOptions([]);
    setAreaOptionsLoading(false);
    setAreaOptionsError("");
    latestDisplayedBaselineRef.current = "";
    setError("");
    setLoaded(false);
    setLoading(false);
    void loadHomeBrowsingPreferences(browsingStorageKey).catch(() => null).then((saved) => {
      if (!current) return;
      if (saved && mutationAtStart === browsingMutationSequence.current) {
        setView(saved.view);
        setFiltersByView(saved.filtersByView);
        setBottleQueries({ market: saved.filtersByView.market.bottle, community: saved.filtersByView.community.bottle });
      }
      setLoadedBrowsingStorageKey(browsingStorageKey);
    });
    return () => { current = false; };
  }, [browsingStorageKey]);

  useEffect(() => {
    if (!browsingLoaded || loadedBrowsingStorageKey !== browsingStorageKey) return;
    const timer = setTimeout(() => {
      void saveHomeBrowsingPreferences(browsingStorageKey, { version: 1, view, filtersByView }).catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [browsingLoaded, browsingStorageKey, filtersByView, loadedBrowsingStorageKey, view]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => setScreenFocused(false);
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.all([AccessibilityInfo.isReduceMotionEnabled(), AccessibilityInfo.isScreenReaderEnabled()]).then(([motion, reader]) => {
      if (mounted) { setReduceMotion(motion); setScreenReaderEnabled(reader); }
    });
    const motionSubscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const readerSubscription = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReaderEnabled);
    return () => { mounted = false; motionSubscription.remove(); readerSubscription.remove(); };
  }, []);
  useEffect(() => {
    backgroundRequestSequence.current += 1;
    setQueuedSignals([]);
    setHighlightedIds([]);
    setTickerIndex(0);
  }, [scopeKey]);

  useEffect(() => {
    if (!screenActive || !browsingLoaded || !loaded || error) return undefined;
    let stopped = false;
    const capturedScope = scopeKey;
    const poll = async () => {
      const requestId = ++backgroundRequestSequence.current;
      try {
        const page = await api.listSignals({ view, limit: 30, cursor: null, fresh: true, ...requestFilters });
        if (stopped || requestId !== backgroundRequestSequence.current || capturedScope !== scopeKeyRef.current) return;
        const scopedIncoming = filterSignalsByRarity(page.signals, filters.rarities);
        const accessChanged = JSON.stringify(accessSnapshotRef.current) !== JSON.stringify(page.access);
        if (accessChanged) {
          requestSequence.current += 1;
          requestInFlightRef.current = null;
          setLoading(false);
          setHighlightedIds([]);
          setSignals(scopedIncoming);
          setQueuedSignals([]);
          setCursor(page.nextCursor);
          setHasMore(page.hasMore);
          latestDisplayedBaselineRef.current = scopedIncoming[0]?.timing.displayAt || "";
        } else {
          const displayed = signalsSnapshotRef.current;
          setSignals(reconcileDisplayedSignals(displayed, scopedIncoming, page.hasMore));
          setQueuedSignals((current) => reconcileQueuedSignals(displayed, current, scopedIncoming, latestDisplayedBaselineRef.current));
        }
        setAccess(page.access);
      } catch (caught) {
        if (!stopped && requestId === backgroundRequestSequence.current && caught instanceof MobileApiError && (caught.status === 401 || caught.status === 403)) {
          setSignals([]);
          setQueuedSignals([]);
          setHighlightedIds([]);
          setAccess(null);
          setCursor(null);
          setHasMore(true);
          latestDisplayedBaselineRef.current = "";
          handleError(caught);
        }
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 60_000);
    return () => {
      stopped = true;
      backgroundRequestSequence.current += 1;
      clearInterval(timer);
    };
  }, [api, browsingLoaded, error, filters.rarities, handleError, loaded, requestFilters, scopeKey, screenActive, view]);

  useEffect(() => {
    if (!screenActive) return undefined;
    setTickerNow(Date.now());
    const timer = setInterval(() => setTickerNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [screenActive]);
  useEffect(() => {
    if (!screenActive || motionDisabled || tickerSignals.length < 2) return undefined;
    const timer = setInterval(() => setTickerIndex((current) => (current + 1) % tickerSignals.length), 8_000);
    return () => clearInterval(timer);
  }, [motionDisabled, screenActive, tickerSignals.length]);
  useEffect(() => {
    const generation = ++tickerAnimationGeneration.current;
    tickerOpacity.stopAnimation();
    if (!screenActive || motionDisabled || !tickerSignal) {
      tickerOpacity.setValue(1);
      return () => { tickerAnimationGeneration.current += 1; tickerOpacity.stopAnimation(); };
    }
    tickerOpacity.setValue(0);
    const animation = Animated.timing(tickerOpacity, { toValue: 1, duration: 180, useNativeDriver: true });
    animation.start(({ finished }) => {
      if (!finished || generation !== tickerAnimationGeneration.current) return;
    });
    return () => { tickerAnimationGeneration.current += 1; animation.stop(); tickerOpacity.stopAnimation(); };
  }, [motionDisabled, screenActive, tickerOpacity, tickerSignal?.id]);
  useEffect(() => {
    if (!screenActive || !highlightedIds.length) return undefined;
    const timer = setTimeout(() => setHighlightedIds([]), reduceMotion ? 2_000 : 2_600);
    return () => clearTimeout(timer);
  }, [highlightedIds.length, reduceMotion, screenActive]);

  const acceptNewSignals = useCallback(() => {
    if (!queuedSignals.length) return;
    const acceptedIds = queuedSignals.map((signal) => signal.id);
    setSignals((current) => acceptQueuedSignals(current, queuedSignals));
    latestDisplayedBaselineRef.current = queuedSignals[0]?.timing.displayAt || latestDisplayedBaselineRef.current;
    setQueuedSignals([]);
    setHighlightedIds(acceptedIds);
    listRef.current?.scrollToOffset({ offset: 0, animated: !motionDisabled });
  }, [motionDisabled, queuedSignals]);

  useEffect(() => { if (browsingStorageKey) void loadProfile(true); }, [browsingStorageKey, loadProfile]);
  useScreenRevalidation(() => { void loadProfile(true); if (browsingLoaded && !loaded) void load(true); });
  useEffect(() => { if (browsingLoaded && !loaded && !loading && !error) void load(true); }, [browsingLoaded, error, load, loaded, loading]);
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
    if (!filters.state || filters.state === "NC") {
      setAreaOptionsLoading(false);
      setAreaOptionsError("");
      return;
    }
    let current = true;
    setAreaOptionsLoading(true);
    setAreaOptionsError("");
    void api.getSignalAreaOptions(filters.state).then((options) => {
      if (!current) return;
      setRemoteAreaState(filters.state);
      setRemoteAreaOptions(options);
      if (!options.length && !staticAreaOptions.length) setAreaOptionsError("No city options are available for this state yet.");
    }).catch(() => {
      if (current && !staticAreaOptions.length) setAreaOptionsError("City options are temporarily unavailable.");
    }).finally(() => { if (current) setAreaOptionsLoading(false); });
    return () => { current = false; };
  }, [api, filters.state, staticAreaOptions.length]);

  const marketLocked = view === "market" && Boolean(access?.marketDetailsLocked);
  const paidAccessMismatch = Boolean(profile?.membership.paid && marketLocked);

  const header = (
    <View style={styles.header}>
      {tickerSignal ? <View accessibilityLabel="Recent reports" style={styles.tickerShell}>
        <Animated.View style={[styles.tickerAnimated, { opacity: tickerOpacity }]}>
        <Pressable
          accessibilityHint="Opens Signal details"
          accessibilityLabel={`${tickerSignal.bottle.name}, ${tickerLocationLabel(tickerSignal)}, Reported ${signalAccessibilityTime(tickerSignal.timing.displayAt)}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: tickerSignal.id } })}
          style={({ pressed }) => [styles.tickerSignal, pressed && styles.segmentPressed]}
        >
          <View style={styles.tickerMarker}><MaterialCommunityIcons color={colors.accent} name="radio-tower" size={15} /></View>
          <View style={styles.tickerCopy}>
            <Text numberOfLines={1} style={styles.tickerBottle}>{tickerSignal.bottle.name}</Text>
            <Text numberOfLines={1} style={styles.tickerMeta}>{tickerLocationLabel(tickerSignal)} · Reported {relativeSignalTime(tickerSignal.timing.displayAt)}</Text>
          </View>
        </Pressable>
        </Animated.View>
        {tickerSignals.length > 1 ? <Pressable
          accessibilityLabel="Show next recent report"
          accessibilityRole="button"
          onPress={() => setTickerIndex((current) => (current + 1) % tickerSignals.length)}
          style={({ pressed }) => [styles.tickerNext, pressed && styles.segmentPressed]}
        >
          <MaterialCommunityIcons color={colors.muted} name="chevron-right" size={20} />
        </Pressable> : null}
      </View> : null}
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

      <>
        <View accessibilityLabel="Signal geography filters" style={styles.geographyRow}>
          <OptionChooser
            label="State"
            icon="map-marker-outline"
            value={filters.state}
            placeholder="All states"
            clearLabel="All states"
            options={stateOptions}
            onChange={(state) => applyFilters({ ...filters, state, area: "" })}
          />
          <OptionChooser
            label={areaLabel}
            icon="map-marker-radius-outline"
            value={filters.area}
            placeholder={filters.state ? areaLabel : "Area / Board"}
            clearLabel={`Any ${areaLabel.toLowerCase()}`}
            options={areaOptions}
            disabled={!filters.state}
            onChange={(area) => applyFilters({ ...filters, area })}
          />
        </View>
        {filters.state ? <View style={styles.locationSelection}>
          <Text numberOfLines={1} style={styles.locationSelectionText}>{filters.area ? `${filters.state} · ${filters.area}` : `${filters.state} · All ${areaLabel === "City" ? "cities" : "boards"}`}</Text>
          <Pressable accessibilityLabel="Clear Home location filters" accessibilityRole="button" onPress={() => applyFilters({ ...filters, state: "", area: "" })} style={styles.clearLocationButton}>
            <MaterialCommunityIcons color={colors.accent} name="close" size={17} />
            <Text style={styles.clearLocationText}>Clear</Text>
          </Pressable>
        </View> : null}
        {filters.state && filters.state !== "NC" && areaOptionsLoading ? <Text style={styles.areaOptionNote}>Loading cities…</Text> : null}
        {filters.state && areaOptionsError ? <Text accessibilityRole="alert" style={styles.areaOptionError}>{areaOptionsError}</Text> : null}

        <View style={styles.filterInputShell}>
          <MaterialCommunityIcons color={colors.muted} name="magnify" size={20} />
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={(value) => { browsingMutationSequence.current += 1; setBottleQueries((current) => ({ ...current, [view]: value })); }}
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
      </>

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
    <View style={styles.screen}>
      <FlatList
      ref={listRef}
      contentContainerStyle={styles.list}
      data={visibleSignals}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SignalCard highlighted={highlightedIds.includes(item.id)} signal={item} onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: item.id } })} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => { void load(true); void loadProfile(true); }} tintColor={colors.accent} colors={[colors.accent]} />}
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
      {queuedSignals.length ? <Pressable
        accessibilityLabel={`${queuedSignals.length} new ${queuedSignals.length === 1 ? "signal" : "signals"}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        onPress={acceptNewSignals}
        style={({ pressed }) => [styles.newSignalsPill, pressed && styles.newSignalsPillPressed]}
      >
        <MaterialCommunityIcons color="#171009" name="arrow-up" size={17} />
        <Text style={styles.newSignalsText}>New signals · {queuedSignals.length}</Text>
      </Pressable> : null}
    </View>
    );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 64 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  header: { gap: 8, marginBottom: 4 },
  tickerShell: { minHeight: 54, flexDirection: "row", alignItems: "stretch", borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: "#5A4127", backgroundColor: "#1D150D", overflow: "hidden" },
  tickerAnimated: { flex: 1 },
  tickerSignal: { minHeight: 54, flex: 1, flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 10, paddingVertical: 6 },
  tickerMarker: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#2B1E11" },
  tickerCopy: { flex: 1, gap: 2 },
  tickerBottle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: "800" },
  tickerMeta: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  tickerNext: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  newSignalsPill: { position: "absolute", zIndex: 5, top: 8, alignSelf: "center", minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.accent, borderWidth: 1, borderColor: "#F1BC72", shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  newSignalsPillPressed: { backgroundColor: colors.accentPressed, transform: [{ scale: 0.98 }] },
  newSignalsText: { color: "#171009", fontSize: 12, lineHeight: 16, fontWeight: "900" },
  segmentedControl: { flexDirection: "row", padding: 3, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segmentSelected: { backgroundColor: "#241A10" },
  segmentPressed: { opacity: 0.78 },
  segmentLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  segmentLabelSelected: { color: colors.text },
  geographyRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 8 },
  locationSelection: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 4 },
  locationSelectionText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 15 },
  clearLocationButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 6 },
  clearLocationText: { color: colors.accent, fontSize: 11, fontWeight: "800" },
  filterChooser: { flex: 1, minWidth: 0 },
  filterChooserDisabled: { opacity: 0.48 },
  rarityRow: { flexGrow: 1, gap: 7, paddingRight: 8, justifyContent: "center" },
  rarityChip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 13, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
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

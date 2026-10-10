import { feedCacheScope, homeFeedCache } from "../../../src/signals/home-feed-cache";
import { feedRetryAction } from "../../../src/signals/feed-recovery";
import { EmptyState } from "../../../src/components/MemberScreen";
import { allowedFeedFilters, canUseDetailedFeedFilters } from "../../../src/signals/feed-access";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAuth } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, FlatList, ImageBackground, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, Signal, SignalFeedPage } from "../../../src/api/types";
import { SignalCard } from "../../../src/components/SignalCard";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { DEFAULT_SIGNAL_FILTERS, activeFilterCount, areaOptionsForState, areaSelectorLabel, filterSignalsByRarity, normalizedFilters, rarityOptionsForView, serverSignalFilters, toggleRarity, type SignalFeedFilters } from "../../../src/signals/feed-filters";
import { acceptQueuedSignals, reconcileDisplayedSignals, reconcileQueuedSignals, sortSignalTimeline } from "../../../src/signals/home-feed-live";
import { homeBrowsingStorageKey, loadHomeBrowsingPreferences, saveHomeBrowsingPreferences } from "../../../src/signals/home-browsing-preferences";
import { colors, typeScale, layout, typography } from "../../../src/theme";
import { dropdownRevealOffset } from "../../../src/interactions/dropdown-visibility";

type FeedView = "market" | "community";

const FeedSignalRow = memo(function FeedSignalRow({ signal, highlighted }: { signal: Signal; highlighted: boolean }) {
  return <SignalCard highlighted={highlighted} signal={signal} onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: signal.id } })} />;
});

function OptionChooser({
  label,
  value,
  placeholder,
  clearLabel,
  options,
  icon,
  disabled = false,
  onChange,
  onReveal,
  viewportHeight,
}: {
  label: string;
  value: string;
  placeholder: string;
  clearLabel?: string;
  options: Array<{ value: string; label: string; displayName?: string; subtitle?: string }>;
  icon: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onReveal: (node: View) => void;
  viewportHeight: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [buttonHeight, setButtonHeight] = useState(46);
  const chooserRef = useRef<View>(null);
  const pendingReveal = useRef(false);
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.displayName || selectedOption?.label || placeholder;
  const visibleOptions = value ? [{ value: "", label: clearLabel || placeholder }, ...options] : options;
  useEffect(() => { if (disabled) setExpanded(false); }, [disabled]);
  return <View ref={chooserRef} collapsable={false} onLayout={() => {
    if (!pendingReveal.current || !expanded || disabled) return;
    pendingReveal.current = false;
    requestAnimationFrame(() => { if (chooserRef.current) onReveal(chooserRef.current); });
  }} style={[styles.fieldGroup, styles.filterChooser, disabled && styles.filterChooserDisabled]}>
    <Pressable
      onLayout={(event) => setButtonHeight(event.nativeEvent.layout.height)}
      accessibilityLabel={`${label}, ${selectedLabel}${selectedOption?.subtitle ? `, ${selectedOption.subtitle}` : ""}`}
      accessibilityRole="button"
      accessibilityState={{ expanded, disabled }}
      disabled={disabled}
      onPress={() => { Keyboard.dismiss(); pendingReveal.current = !expanded; setExpanded(!expanded); }}
      style={({ pressed }) => [styles.chooserButton, pressed && styles.segmentPressed]}
    >
      <MaterialCommunityIcons color={disabled ? colors.border : colors.muted} name={icon as never} size={18} />
      <View style={styles.chooserText}><Text style={[styles.chooserValue, !value && styles.chooserPlaceholder]}>{selectedLabel}</Text>{selectedOption?.subtitle ? <Text numberOfLines={2} style={styles.chooserSubtitle}>{selectedOption.value}</Text> : null}</View>
      <MaterialCommunityIcons color={disabled ? colors.border : colors.muted} name={expanded ? "chevron-up" : "chevron-down"} size={19} />
    </Pressable>
    {expanded && !disabled ? <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={[styles.chooserOptions, { maxHeight: Math.max(60, Math.min(240, viewportHeight - buttonHeight - 30)) }]}>
      {visibleOptions.map((option) => {
        const selected = option.value === value;
        return <Pressable
          key={option.value || "__all"}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          onPress={() => { onChange(option.value); setExpanded(false); }}
          style={({ pressed }) => [styles.chooserOption, selected && styles.chooserOptionSelected, pressed && styles.segmentPressed]}
        >
          <View style={styles.chooserText}><Text style={[styles.chooserOptionText, selected && styles.rarityChipTextSelected]}>{option.displayName || option.label}</Text>{"subtitle" in option && option.subtitle ? <Text numberOfLines={3} style={styles.chooserSubtitle}>{option.subtitle}</Text> : null}</View>
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
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const { userId } = useAuth();
  const browsingStorageKey = homeBrowsingStorageKey(userId);
  const [view, setView] = useState<FeedView>("market");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [queuedSignals, setQueuedSignals] = useState<Signal[]>([]);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
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
  const [marketSummaries, setMarketSummaries] = useState<SignalFeedPage["marketSummaries"]>([]);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [filtersByView, setFiltersByView] = useState<Record<FeedView, SignalFeedFilters>>({
    market: { ...DEFAULT_SIGNAL_FILTERS },
    community: { ...DEFAULT_SIGNAL_FILTERS },
  });
  const [bottleQueries, setBottleQueries] = useState<Record<FeedView, string>>({ market: "", community: "" });
  const [remoteAreaState, setRemoteAreaState] = useState("");
  const [remoteAreaOptions, setRemoteAreaOptions] = useState<Array<{ value: string; label: string; displayName?: string; subtitle?: string }>>([]);
  const [areaOptionsLoading, setAreaOptionsLoading] = useState(false);
  const [areaOptionsError, setAreaOptionsError] = useState("");
  const [loadedBrowsingStorageKey, setLoadedBrowsingStorageKey] = useState("");
  const browsingLoaded = Boolean(browsingStorageKey) && loadedBrowsingStorageKey === browsingStorageKey;
  const tier = profile?.membership.tier;
  const detailedFilters = canUseDetailedFeedFilters(tier);
  const filters = useMemo(() => allowedFeedFilters(filtersByView[view], tier), [filtersByView, view, tier]);
  const requestFilters = useMemo(() => serverSignalFilters(filters), [filters]);
  const visibleSignals = useMemo(() => filterSignalsByRarity(signals, filters.rarities), [filters.rarities, signals]);
  const scopeKey = JSON.stringify([userId, view, requestFilters, filters.rarities]);
  const screenActive = screenFocused && appState === "active";
  const motionDisabled = reduceMotion || screenReaderEnabled;
  const cacheScope = feedCacheScope(view, requestFilters);
  const areaDirectory = profile?.feedAreas;
  const stateOptions = areaDirectory?.states.filter((state) => /^[A-Z]{2}$/.test(state.code)).map((state) => ({ value: state.code, label: state.label })) || [];
  const staticAreaOptions = areaOptionsForState(areaDirectory, filters.state);
  const areaOptions = filters.state !== "NC" && remoteAreaState === filters.state && remoteAreaOptions.length
    ? remoteAreaOptions
    : staticAreaOptions;
  const areaLabel = filters.state === "NC" ? "Location" : filters.state
    ? areaDirectory?.states.find((state) => state.code === filters.state)?.areaLabel || areaSelectorLabel(filters.state)
    : "Location";
  const selectedArea = areaOptions.find(option => option.value === filters.area);
  const selectedAreaLabel = selectedArea?.displayName || selectedArea?.label || filters.area;
  const bottleQuery = tier === undefined || detailedFilters ? bottleQueries[view] : "";
  const requestSequence = useRef(0);
  const requestInFlightRef = useRef<"refresh" | "page" | null>(null);
  const loadedScopeRef = useRef("");
  const successfulRequestRef = useRef(0);
  const lastRefreshRef = useRef(0);
  const profileRequestSequence = useRef(0);
  const browsingMutationSequence = useRef(0);
  const backgroundRequestSequence = useRef(0);
  const scopeKeyRef = useRef(scopeKey);
  const listRef = useRef<FlatList<Signal>>(null);
  const viewportRef = useRef<View>(null);
  const [viewportHeight, setViewportHeight] = useState(480);
  const scrollOffset = useRef(0);
  const revealChooser = useCallback((node: View) => {
    node.measureInWindow((_x, top, _width, height) => {
      viewportRef.current?.measureInWindow((_vx, viewportTop, _vw, viewportHeight) => {
        if (!height || !viewportHeight) return;
        const offset = dropdownRevealOffset(scrollOffset.current, top, height, viewportTop, viewportHeight);
        if (Math.abs(offset - scrollOffset.current) > 1) listRef.current?.scrollToOffset({ offset, animated: !motionDisabled });
      });
    });
  }, [motionDisabled]);
  const signalsSnapshotRef = useRef<Signal[]>(signals);
  const accessSnapshotRef = useRef<SignalFeedPage["access"] | null>(access);
  const latestDisplayedBaselineRef = useRef("");
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
    if (apiError?.status === 401 || apiError?.status === 403) void homeFeedCache.clear(userId || "").catch(() => undefined);
    setError(apiError?.status === 401
      ? "Your session could not be verified. Return to login and try again."
      : apiError?.message || "Signals are temporarily unavailable.");
  }, [userId]);

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
    const capturedScope = scopeKey;
    setLoading(true);
    setError("");
    try {
      const page = await api.listSignals({ view, limit: 30, cursor: refresh ? null : cursor, fresh: refresh, ...requestFilters, bottle: undefined, search: requestFilters.bottle });
      if (requestId !== requestSequence.current || capturedScope !== scopeKeyRef.current) return;
      successfulRequestRef.current = requestId;
      lastRefreshRef.current = Date.now();
      setSignals((current) => {
        const next = refresh ? page.signals : [...current, ...page.signals];
        return sortSignalTimeline(next);
      });
      if (refresh) latestDisplayedBaselineRef.current = page.signals[0]?.timing.displayAt || "";
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setAccess(page.access);
      if (refresh) {
        setMarketSummaries(page.marketSummaries);
        void homeFeedCache.save(userId || "", cacheScope, page).catch(() => undefined);
      }
      if (refresh) setQueuedSignals([]);
      setLoaded(true);
    } catch (caught) {
      if (requestId !== requestSequence.current || capturedScope !== scopeKeyRef.current) return;
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
  }, [api, cacheScope, cursor, handleError, hasMore, requestFilters, scopeKey, userId, view]);

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
    setMarketSummaries([]);
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
    setMarketSummaries([]);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, [areaDirectory, view]);

  const applyRarityFilters = useCallback((next: SignalFeedFilters) => {
    browsingMutationSequence.current += 1;
    applyFilters(next);
  }, [applyFilters]);

  useEffect(() => {
    let current = true;
    const mutationAtStart = browsingMutationSequence.current;
    requestSequence.current += 1;
    backgroundRequestSequence.current += 1;
    profileRequestSequence.current += 1;
    requestInFlightRef.current = null;
    setLoadedBrowsingStorageKey("");
    loadedScopeRef.current = "";
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
    setMarketSummaries([]);
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
    return () => {
      current = false;
      requestSequence.current += 1;
      backgroundRequestSequence.current += 1;
      profileRequestSequence.current += 1;
    };
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
  }, [scopeKey]);

  useEffect(() => {
    if (!screenActive || !browsingLoaded || !loaded || error) return undefined;
    let stopped = false;
    const capturedScope = scopeKey;
    const poll = async () => {
      const requestId = ++backgroundRequestSequence.current;
      try {
        const page = await api.listSignals({ view, limit: 30, cursor: null, fresh: true, ...requestFilters, bottle: undefined, search: requestFilters.bottle });
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
        lastRefreshRef.current = Date.now();
        setAccess(page.access);
        void homeFeedCache.save(userId || "", cacheScope, page).catch(() => undefined);
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
    if (Date.now() - lastRefreshRef.current > 30_000) void poll();
    const timer = setInterval(() => { void poll(); }, 60_000);
    return () => {
      stopped = true;
      backgroundRequestSequence.current += 1;
      clearInterval(timer);
    };
  }, [api, browsingLoaded, error, filters.rarities, handleError, loaded, requestFilters, scopeKey, screenActive, cacheScope, userId, view]);

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

  useEffect(() => { if (browsingStorageKey) void loadProfile(false); }, [browsingStorageKey, loadProfile]);
  useScreenRevalidation(() => { void loadProfile(false); if (browsingLoaded && (error || Date.now() - lastRefreshRef.current > 30_000)) void load(true); });
  useEffect(() => {
    if (!browsingLoaded || loadedScopeRef.current === scopeKey) return;
    loadedScopeRef.current = scopeKey;
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setSignals([]);
    setQueuedSignals([]);
    setHighlightedIds([]);
    setCursor(null);
    setHasMore(true);
    setLoaded(false);
    const restore = (page: SignalFeedPage | null) => {
      if (!page || loadedScopeRef.current !== scopeKey || scopeKeyRef.current !== scopeKey) return;
      setSignals(page.signals);
      setAccess(page.access);
      setMarketSummaries(page.marketSummaries);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setLoaded(true);
      latestDisplayedBaselineRef.current = page.signals[0]?.timing.displayAt || "";
    };
    const cached = homeFeedCache.peek(userId || "", cacheScope);
    restore(cached);
    const beforeLoad = requestSequence.current + 1;
    if (!cached) void homeFeedCache.load(userId || "", cacheScope).then(page => {
      // A disk read can never overwrite a successful or superseding network result.
      if (requestSequence.current === beforeLoad && successfulRequestRef.current !== beforeLoad) restore(page);
    });
    void load(true);
  }, [browsingLoaded, cacheScope, load, scopeKey, userId]);
  useEffect(() => {
    if (tier === undefined) return;
    const normalizedBottle = bottleQuery.replace(/\s+/g, " ").trim().slice(0, 100);
    if (normalizedBottle === filters.bottle) return;
    const timer = setTimeout(() => applyFilters({ ...filters, bottle: bottleQuery }), 350);
    return () => clearTimeout(timer);
  }, [applyFilters, bottleQuery, filters, tier]);
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
            onReveal={revealChooser}
            viewportHeight={viewportHeight}
          />
          <OptionChooser
            label={areaLabel}
            icon="map-marker-radius-outline"
            value={filters.area}
            placeholder={filters.state ? "All areas" : "Location"}
            clearLabel={`Any ${areaLabel.toLowerCase()}`}
            options={areaOptions}
            disabled={!filters.state || !detailedFilters}
            onChange={(area) => applyFilters({ ...filters, area })}
            onReveal={revealChooser}
            viewportHeight={viewportHeight}
          />
        </View>

        {filters.state && filters.state !== "NC" && areaOptionsLoading ? <Text style={styles.areaOptionNote}>Loading cities…</Text> : null}
        {filters.state && areaOptionsError ? <Text accessibilityRole="alert" style={styles.areaOptionError}>{areaOptionsError}</Text> : null}


        {!detailedFilters && profile ? <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/membership")} style={styles.clearLocationButton}><Text style={styles.clearLocationText}>Local area filters and feed search · Barrel Proof →</Text></Pressable> : null}
        {detailedFilters ? <View style={styles.filterInputShell}>
          <MaterialCommunityIcons color={colors.muted} name="magnify" size={20} />
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={(value) => { browsingMutationSequence.current += 1; setBottleQueries((current) => ({ ...current, [view]: value })); }}
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel="Search bottles or locations"
            placeholder="Search bottles or locations"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.filterInput}
            value={bottleQuery}
          />
          {bottleQuery ? <Pressable accessibilityLabel="Clear feed search" accessibilityRole="button" hitSlop={8} onPress={() => setBottleQueries((current) => ({ ...current, [view]: "" }))} style={styles.inputClearButton}><MaterialCommunityIcons color={colors.muted} name="close-circle" size={19} /></Pressable> : null}
        </View> : null}

        <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.rarityRow} showsHorizontalScrollIndicator={false} accessibilityLabel="Bottle rarity filters">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filters.rarities.length === 0 }}
            onPress={() => applyRarityFilters({ ...filters, rarities: [] })}
            style={({ pressed }) => [styles.rarityChip, filters.rarities.length === 0 && styles.rarityChipSelected, pressed && styles.segmentPressed]}
          >
            <Text style={[styles.rarityChipText, filters.rarities.length === 0 && styles.rarityChipTextSelected]}>All</Text>
          </Pressable>
          {rarityOptionsForView(view).slice().sort((left, right) => ["unicorn", "allocated", "limited"].indexOf(left.value) - ["unicorn", "allocated", "limited"].indexOf(right.value)).map((option) => {
            const selected = filters.rarities.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="checkbox"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityHint="Toggle this rarity independently"
                onPress={() => applyRarityFilters(toggleRarity(filters, option.value))}
                style={({ pressed }) => [styles.rarityChip, selected && styles.rarityChipSelected, pressed && styles.segmentPressed]}
              >
                {selected ? <MaterialCommunityIcons accessible={false} name="check" color={colors.accent} size={13} /> : null}<Text style={[styles.rarityChipText, selected && styles.rarityChipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {filters.state ? <View style={styles.locationSelection}>
          <Text numberOfLines={2} style={styles.locationSelectionText}>{filters.area ? `${filters.state} · ${selectedAreaLabel}${filters.state === "NC" && selectedArea?.subtitle ? ` · ${filters.area}` : ""}` : `${filters.state} · All ${areaLabel === "City" ? "cities" : "areas"}`}</Text>
          <Pressable accessibilityLabel="Clear Home location filters" accessibilityRole="button" onPress={() => applyFilters({ ...filters, state: "", area: "" })} style={styles.clearLocationButton}>
            <MaterialCommunityIcons color={colors.accent} name="close" size={17} />
            <Text style={styles.clearLocationText}>Clear</Text>
          </Pressable>
        </View> : null}
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

  const feedFooter = loaded && loading
        ? <View style={styles.footer}><Text style={styles.loadingText}>Loading…</Text></View>
        : error && signals.length
          ? <View style={styles.footer}><Text accessibilityRole="alert" style={styles.footerError}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(feedRetryAction(hasMore).refresh)} style={styles.retryTarget}><Text style={styles.retry}>{feedRetryAction(hasMore).label}</Text></Pressable></View>
          : loaded && hasMore
            ? <View style={styles.footer}><Pressable accessibilityRole="button" onPress={() => load(false)} style={styles.retryTarget}><Text style={styles.retry}>Load more matching Signals</Text></Pressable></View>
            : loaded && !hasMore && visibleSignals.length
              ? <Text style={styles.end}>You’re caught up.</Text>
              : null;

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.homeBackdrop}>
        <ImageBackground
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={require("../../../assets/home-shelf-background.jpg")}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View ref={viewportRef} collapsable={false} onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)} style={[styles.feedViewport, { marginTop: headerHeight }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.feedShade]} />
      <FlatList
      key={JSON.stringify([userId, view])}
      removeClippedSubviews={false}
      initialNumToRender={30}
      maxToRenderPerBatch={30}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      ref={listRef}
      contentContainerStyle={styles.list}
      data={visibleSignals}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => index === visibleSignals.length - 1 ? <View><FeedSignalRow highlighted={highlightedIds.includes(item.id)} signal={item} />{feedFooter}</View> : <FeedSignalRow highlighted={highlightedIds.includes(item.id)} signal={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => { void load(true); void loadProfile(true); }} tintColor={colors.accent} colors={[colors.accent]} />}
      onEndReached={() => { if (loaded && signals.length) void load(false); }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={header}
      ListEmptyComponent={!loaded && !error
        ? <FeedSkeleton />
        : error
          ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(true)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View>
          : marketLocked && !paidAccessMismatch
              ? <View style={styles.message}>
                <Text style={styles.previewTitle}>Find bottles near you</Text>
                <Text style={styles.previewDetail}>Free membership includes a market overview. Standard unlocks bottle locations and alerts.</Text>
                {marketSummaries.slice(0, 7).map((summary) => <View key={`${summary.state}:${summary.areaLabel}`} style={styles.summaryCard}>
                  <Text style={styles.previewTitle}>{summary.areaLabel} · {summary.state}</Text>
                  <Text style={styles.previewDetail}>{summary.signalCount} bottle report{summary.signalCount === 1 ? "" : "s"} this week</Text>
                  <Text style={styles.previewDetail}>{summary.bottleNames.join(" · ")}</Text>
                </View>)}
                {!marketSummaries.length ? <Text style={styles.previewDetail}>No recent reports in this view. Try another state or check Community.</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/membership")} style={styles.retryTarget}><Text style={styles.retry}>View memberships →</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => selectView("community")} style={styles.retryTarget}><Text style={styles.retry}>Browse Community →</Text></Pressable>
              </View>
            : <View style={{gap:12}}><EmptyState title={view === "community" ? "No member sightings yet" : "No Intel Signals match these filters"}
              detail={activeFilterCount(filters) ? "Try a broader search or clear your filters." : view === "community" ? "Share what you spotted to help nearby members." : "New Signals will appear here as they arrive."}
              actionLabel={activeFilterCount(filters) ? "Clear filters" : view === "community" ? "Post a sighting" : "Refresh feed"}
              onAction={() => { if (activeFilterCount(filters)) { setBottleQueries(current => ({ ...current, [view]: "" })); applyFilters({ ...DEFAULT_SIGNAL_FILTERS }); } else if (view === "community") router.push("/(app)/(tabs)/post"); else void load(true); }} />
              {view!=="community"?<Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/(app)/account/coverage',params:{state:filters.state}})} style={{minHeight:48,justifyContent:'center',paddingHorizontal:16}}><Text style={{color:colors.accent,fontWeight:'700'}}>Request coverage here →</Text></Pressable>:null}</View>}
      ListFooterComponent={!visibleSignals.length ? feedFooter : null}
    />
      </View>
      {queuedSignals.length ? <Pressable
        accessibilityLabel={`${queuedSignals.length} new ${queuedSignals.length === 1 ? "signal" : "signals"}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        onPress={acceptNewSignals}
        style={({ pressed }) => [styles.newSignalsPill, { top: headerHeight + 8 }, pressed && styles.newSignalsPillPressed]}
      >
        <MaterialCommunityIcons color="#171009" name="arrow-up" size={17} />
        <Text style={styles.newSignalsText}>New signals · {queuedSignals.length}</Text>
      </Pressable> : null}
    </View>
    );
}

const styles = StyleSheet.create({
  previewTitle: { color: colors.text, fontSize: typeScale.input, fontWeight: "700" },
  previewDetail: { color: colors.muted, fontSize: typeScale.body, lineHeight: 21, marginTop: 6 },
  summaryCard: { alignSelf: "stretch", padding: 14, marginTop: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  screen: { flex: 1, backgroundColor: colors.background },
  homeBackdrop: StyleSheet.absoluteFill,
  feedViewport: { flex: 1, backgroundColor: "transparent" },
  feedShade: { backgroundColor: "rgba(8,6,4,0.64)" },
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(210,184,145,0.12)", marginLeft: 78 },
  header: { gap: 8, marginBottom: 4 },
  newSignalsPill: { position: "absolute", zIndex: 5, top: 8, alignSelf: "center", minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.accent, borderWidth: 1, borderColor: "#F1BC72", shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  newSignalsPillPressed: { backgroundColor: colors.accentPressed, transform: [{ scale: 0.98 }] },
  newSignalsText: { color: "#171009", fontSize: typeScale.small, lineHeight: 16, fontWeight: "900" },
  segmentedControl: { flexDirection: "row", padding: 2, borderRadius: 26, backgroundColor: "rgba(17,14,11,0.72)", borderColor: "rgba(210,184,145,0.22)", borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, minHeight: 44, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 8 },
  segmentSelected: { backgroundColor: "rgba(214,154,74,0.15)" },
  segmentPressed: { opacity: 0.78 },
  segmentLabel: { color: colors.muted, fontSize: typeScale.small, fontWeight: "700" },
  segmentLabelSelected: { color: colors.accent },
  geographyRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 8 },
  locationSelection: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 4 },
  locationSelectionText: { flex: 1, color: colors.muted, ...typography.caption },
  clearLocationButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 6 },
  clearLocationText: { color: colors.accent, fontSize: typeScale.caption, fontWeight: "800" },
  filterChooser: { flex: 1, minWidth: 0 },
  filterChooserDisabled: { opacity: 0.48 },
  rarityRow: { flexGrow: 1, gap: 6, paddingRight: 2, paddingVertical: 3 },
  rarityChip: { flexGrow: 1, minWidth: 44, minHeight: 44, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 8, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(210,184,145,0.18)", backgroundColor: "rgba(17,14,11,0.78)" },
  rarityChipSelected: { borderColor: colors.accent, backgroundColor: "rgba(214,154,74,0.13)" },
  rarityChipText: { color: colors.muted, fontSize: typeScale.caption, fontWeight: "600" },
  rarityChipTextSelected: { color: colors.accent },
  inlineError: { borderRadius: 12, borderColor: colors.danger, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  inlineErrorText: { color: colors.danger, fontSize: typeScale.small, lineHeight: 17 },
  summaryList: { gap: 12 },
  unlockCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, borderColor: colors.accentPressed, borderWidth: StyleSheet.hairlineWidth, backgroundColor: "#201810", padding: 14 },
  unlockIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2C2115" },
  unlockCopy: { flex: 1, gap: 3 },
  unlockTitle: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  unlockText: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16 },
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
  footer: { paddingTop: 12, paddingBottom: 8, alignItems: "center", gap: 8 },
  loadingText: { color: colors.muted, fontSize: typeScale.small },
  footerError: { color: colors.danger, textAlign: "center" },
  end: { color: colors.muted, textAlign: "center", padding: 24, fontSize: typeScale.small },
  fieldGroup: { gap: 6 },
  chooserButton: { minHeight: 44, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(210,184,145,0.22)", backgroundColor: "rgba(12,10,8,0.86)", paddingHorizontal: 11, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 7 },
  chooserValue: { color: colors.text, fontSize: typeScale.small, fontWeight: "600" },
  chooserPlaceholder: { color: colors.muted, fontWeight: "500" },
  chooserText: { flex: 1, minWidth: 0, gap: 3 },
  chooserSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  chooserOptions: { maxHeight: 240, borderRadius: layout.controlRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  chooserOption: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chooserOptionSelected: { backgroundColor: "#2A1F13" },
  chooserOptionText: { color: colors.muted, fontSize: typeScale.small, fontWeight: "600" },
  areaOptionNote: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15, textAlign: "center" },
  areaOptionError: { color: colors.danger, fontSize: typeScale.caption, lineHeight: 15, textAlign: "center" },
  filterInputShell: { minHeight: 44, flexDirection: "row", alignItems: "center", borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(210,184,145,0.22)", backgroundColor: "rgba(17,14,11,0.82)", paddingLeft: 12, paddingRight: 6, gap: 7 },
  filterInput: { minHeight: 44, flex: 1, color: colors.text, fontSize: typeScale.body, paddingRight: 6 },
  inputClearButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});

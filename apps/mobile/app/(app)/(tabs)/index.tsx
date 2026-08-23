import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MarketSummary, MemberProfile, Signal, SignalFeedPage } from "../../../src/api/types";
import { MarketSummaryCard } from "../../../src/components/MarketSummaryCard";
import { SignalCard } from "../../../src/components/SignalCard";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

type FeedView = "market" | "community";

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
  const [view, setView] = useState<FeedView>("market");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketSummaries, setMarketSummaries] = useState<MarketSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [access, setAccess] = useState<SignalFeedPage["access"] | null>(null);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const requestSequence = useRef(0);
  const requestInFlightRef = useRef<"refresh" | "page" | null>(null);

  const handleError = useCallback((caught: unknown) => {
    const apiError = caught instanceof MobileApiError ? caught : null;
    setError(apiError?.status === 401
      ? "Your session could not be verified. Return to login and try again."
      : apiError?.message || "Signals are temporarily unavailable.");
  }, []);

  const loadProfile = useCallback(async (fresh = false) => {
    setProfileError("");
    try {
      setProfile((await api.getMemberProfile({ fresh })).profile);
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "Membership details are temporarily unavailable.");
    }
  }, [api]);

  const load = useCallback(async (refresh = false) => {
    const mode = refresh ? "refresh" : "page";
    const inFlight = requestInFlightRef.current;
    if (inFlight === "refresh" || (inFlight === "page" && !refresh) || (!refresh && !hasMore)) return;
    if (refresh && inFlight === "page") requestSequence.current += 1;
    const requestId = ++requestSequence.current;
    requestInFlightRef.current = mode;
    setLoading(true);
    setError("");
    try {
      const page = await api.listSignals({ view, limit: 30, cursor: refresh ? null : cursor, fresh: refresh });
      if (requestId !== requestSequence.current) return;
      setSignals((current) => {
        const next = refresh ? page.signals : [...current, ...page.signals];
        return [...new Map(next.map((signal) => [signal.id, signal])).values()];
      });
      setMarketSummaries(page.marketSummaries || []);
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
  }, [api, cursor, handleError, hasMore, view]);

  const selectView = useCallback((next: FeedView) => {
    if (next === view) return;
    requestSequence.current += 1;
    requestInFlightRef.current = null;
    setView(next);
    setSignals([]);
    setMarketSummaries([]);
    setCursor(null);
    setHasMore(true);
    setAccess(null);
    setError("");
    setLoaded(false);
    setLoading(false);
  }, [view]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);
  useEffect(() => { if (!loaded && !loading && !error) void load(true); }, [error, load, loaded, loading]);

  const marketLocked = view === "market" && Boolean(access?.marketDetailsLocked);
  const paidAccessMismatch = Boolean(profile?.membership.paid && marketLocked);
  const hasSummaryCards = marketLocked && marketSummaries.length > 0;

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
          <Text style={[styles.segmentLabel, view === "market" && styles.segmentLabelSelected]}>Market</Text>
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

      <Text style={styles.contextText}>{view === "community"
        ? "Member-reported bottle sightings."
        : marketLocked
          ? "Weekly market activity."
          : "Exact locations and reported availability."}</Text>

      {profileError ? (
        <Pressable accessibilityRole="button" onPress={() => loadProfile(true)} style={styles.inlineError}>
          <Text accessibilityRole="alert" style={styles.inlineErrorText}>Membership check unavailable. Tap to retry.</Text>
        </Pressable>
      ) : null}

      {paidAccessMismatch ? (
        <View style={styles.inlineError}>
          <Text accessibilityRole="alert" style={styles.inlineErrorText}>Paid access was not recognized. Refresh or sign in again.</Text>
        </View>
      ) : null}

      {hasSummaryCards ? (
        <View style={styles.summaryList}>
          {marketSummaries.map((summary) => <MarketSummaryCard key={summary.state} summary={summary} />)}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/(tabs)/hq")} style={({ pressed }) => [styles.unlockCard, pressed && styles.segmentPressed]}>
            <View style={styles.unlockIcon}>
              <MaterialCommunityIcons color={colors.accent} name="lock-open-outline" size={20} />
            </View>
            <View style={styles.unlockCopy}>
              <Text style={styles.unlockTitle}>Unlock the exact locations</Text>
              <Text style={styles.unlockText}>Paid membership includes exact stores, boards, shipment details, and alerts.</Text>
            </View>
            <MaterialCommunityIcons color={colors.muted} name="chevron-right" size={22} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={signals}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SignalCard signal={item} onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: item.id } })} />}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => load(true)} tintColor={colors.accent} colors={[colors.accent]} />}
      onEndReached={() => { if (loaded && signals.length) void load(false); }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={header}
      ListEmptyComponent={!loaded && loading
        ? <FeedSkeleton />
        : error
          ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(true)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View>
          : hasSummaryCards
            ? null
            : <Text style={styles.empty}>{view === "community" ? "No member sightings yet." : "No fresh Market Signals are available right now."}</Text>}
      ListFooterComponent={loaded && loading
        ? <View style={styles.footer}><Text style={styles.loadingText}>Loading…</Text></View>
        : error && signals.length
          ? <View style={styles.footer}><Text accessibilityRole="alert" style={styles.footerError}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(false)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View>
          : loaded && !hasMore && signals.length
            ? <Text style={styles.end}>You’re caught up.</Text>
            : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 64 },
  gap: { height: 10 },
  header: { gap: 10, marginBottom: 12 },
  segmentedControl: { flexDirection: "row", padding: 3, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, borderColor: "transparent", borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segmentSelected: { backgroundColor: "#211910", borderColor: colors.accentPressed },
  segmentPressed: { opacity: 0.78 },
  segmentLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  segmentLabelSelected: { color: colors.text },
  contextText: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
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
});

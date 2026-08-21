import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { createMobileApi, MobileApiError } from "../../../src/api/client";
import type { Signal } from "../../../src/api/types";
import { SignalCard } from "../../../src/components/SignalCard";
import { colors } from "../../../src/theme";

export default function SignalFeedScreen() {
  const { getToken, signOut } = useAuth();
  const api = useMemo(() => createMobileApi({ getToken }), [getToken]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);

  const load = useCallback(async (refresh = false) => {
    if (requestInFlight.current || (!refresh && !hasMore)) return;
    requestInFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const page = await api.listSignals({ limit: 30, cursor: refresh ? null : cursor });
      setSignals((current) => {
        const next = refresh ? page.signals : [...current, ...page.signals];
        return [...new Map(next.map((signal) => [signal.id, signal])).values()];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setLoaded(true);
    } catch (caught) {
      const apiError = caught instanceof MobileApiError ? caught : null;
      if (apiError?.status === 401) await signOut();
      else if (apiError?.resetCursor && !refresh) {
        setCursor(null); setHasMore(true); setSignals([]); setLoaded(false);
        setError("The feed changed while you were reading. Pull to refresh.");
      } else setError(apiError?.message || "Signals are temporarily unavailable.");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [api, cursor, hasMore, signOut]);

  useEffect(() => {
    if (!loaded && !error) void load(true);
  }, [error, load, loaded]);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={signals}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SignalCard signal={item} onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: item.id } })} />}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => load(true)} tintColor={colors.accent} />}
      onEndReached={() => void load(false)} onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}><Text style={styles.heading}>Latest Signals</Text><Text style={styles.subheading}>Observed availability from trusted sources and members.</Text></View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.accent} /> : error ? <View style={styles.message}><Text style={styles.error}>{error}</Text><Pressable onPress={() => load(true)}><Text style={styles.retry}>Try again</Text></Pressable></View> : <Text style={styles.empty}>No Signals are available right now.</Text>}
      ListFooterComponent={loaded && loading ? <ActivityIndicator style={styles.footer} color={colors.accent} /> : error && signals.length ? <Text style={styles.footerError}>{error}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 36 }, gap: { height: 12 }, header: { paddingVertical: 10, gap: 5, marginBottom: 16 },
  heading: { color: colors.text, fontSize: 28, fontWeight: "800" }, subheading: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  message: { alignItems: "center", gap: 12, padding: 28 }, error: { color: colors.danger, textAlign: "center" }, retry: { color: colors.accent, fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center", padding: 28 }, footer: { padding: 20 }, footerError: { color: colors.danger, textAlign: "center", padding: 16 },
});

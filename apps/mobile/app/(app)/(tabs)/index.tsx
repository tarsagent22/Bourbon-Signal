import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, Signal, SignalFeedPage } from "../../../src/api/types";
import { SignalCard } from "../../../src/components/SignalCard";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

export default function SignalFeedScreen() {
  const { signOut } = useAuth();
  const api = useMobileApi();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [access, setAccess] = useState<SignalFeedPage["access"] | null>(null);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const requestInFlight = useRef(false);

  const handleError = useCallback(async (caught: unknown) => {
    const apiError = caught instanceof MobileApiError ? caught : null;
    if (apiError?.status === 401) await signOut();
    else setError(apiError?.message || "Signals are temporarily unavailable.");
  }, [signOut]);

  const loadProfile = useCallback(async () => {
    setProfileError("");
    try {
      setProfile((await api.getMemberProfile()).profile);
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 401) await signOut();
      else setProfileError(caught instanceof Error ? caught.message : "Membership details are temporarily unavailable.");
    }
  }, [api, signOut]);

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
      setAccess(page.access);
      setLoaded(true);
    } catch (caught) {
      const apiError = caught instanceof MobileApiError ? caught : null;
      if (apiError?.resetCursor && !refresh) {
        setCursor(null); setHasMore(true); setSignals([]); setLoaded(false);
        setError("The feed changed while you were reading. Pull to refresh.");
      } else await handleError(caught);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [api, cursor, handleError, hasMore]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  useEffect(() => { if (!loaded && !error) void load(true); }, [error, load, loaded]);

  const paidAccessMismatch = Boolean(profile?.membership.paid && access?.previewLocked);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={signals}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SignalCard signal={item} onPress={() => router.push({ pathname: "/(app)/signal/[id]", params: { id: item.id } })} />}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => load(true)} tintColor={colors.accent} />}
      onEndReached={() => void load(false)}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}>
        <Text style={styles.eyebrow}>LIVE MEMBER INTELLIGENCE</Text>
        <Text accessibilityRole="header" style={styles.heading}>Latest Signals</Text>
        <Text style={styles.subheading}>Newest observed availability from trusted sources and members. Pull to refresh at any time.</Text>
        {profileError ? <View style={[styles.accessNotice, styles.accessError]}><Text accessibilityRole="alert" style={styles.accessTitle}>Membership check unavailable</Text><Text style={styles.accessText}>{profileError}</Text><Pressable accessibilityRole="button" onPress={loadProfile} style={styles.profileRetry}><Text style={styles.retry}>Retry membership check</Text></Pressable></View> : null}
        {access?.previewLocked ? <View style={[styles.accessNotice, paidAccessMismatch && styles.accessError]}>
          <Text style={styles.accessTitle}>{paidAccessMismatch ? "Member access mismatch" : "Preview feed"}</Text>
          <Text style={styles.accessText}>{paidAccessMismatch
            ? "This signed-in account is paid, but the Signal API returned preview access. Refresh or sign out and back in; contact support if it remains limited."
            : "This account currently has preview access. HQ shows the membership recognized by the app."}</Text>
        </View> : null}
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.accent} /> : error ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(true)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View> : <Text style={styles.empty}>No fresh Signals are available right now.</Text>}
      ListFooterComponent={loaded && loading ? <ActivityIndicator style={styles.footer} color={colors.accent} /> : error && signals.length ? <View style={styles.footer}><Text accessibilityRole="alert" style={styles.footerError}>{error}</Text><Pressable accessibilityRole="button" onPress={() => load(false)} style={styles.retryTarget}><Text style={styles.retry}>Try again</Text></Pressable></View> : loaded && !hasMore && signals.length ? <Text style={styles.end}>You are caught up.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 36 },
  gap: { height: 12 },
  header: { paddingVertical: 10, gap: 6, marginBottom: 16 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heading: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: "800" },
  subheading: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  accessNotice: { marginTop: 10, borderColor: colors.border, borderWidth: 1, borderRadius: 13, backgroundColor: colors.surface, padding: 13, gap: 5 },
  accessError: { borderColor: colors.danger },
  accessTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  accessText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  profileRetry: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
  message: { alignItems: "center", gap: 12, padding: 28 },
  error: { color: colors.danger, textAlign: "center" },
  retry: { color: colors.accent, fontWeight: "700" },
  retryTarget: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center", padding: 28 },
  footer: { padding: 20, alignItems: "center", gap: 8 },
  footerError: { color: colors.danger, textAlign: "center" },
  end: { color: colors.muted, textAlign: "center", padding: 24, fontSize: 12 },
});

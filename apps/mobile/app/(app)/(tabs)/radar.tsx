import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberAlertsResponse, MemberPreferences } from "../../../src/api/types";
import { DataRow, EmptyState, ErrorState, LoadingState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { canonicalBottleKey, filterWatchedBottles } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const RADAR_SETTINGS_URL = "https://www.bourbonsignal.com/dashboard?section=alerts";

export default function RadarScreen() {
  const api = useMobileApi();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [alerts, setAlerts] = useState<MemberAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError("");
    try {
      const [nextPreferences, nextAlerts] = await Promise.all([api.getMemberPreferences({ fresh }), api.getMemberAlerts({ fresh })]);
      setPreferences(nextPreferences); setAlerts(nextAlerts);
    } catch (caught) {
      setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Radar is temporarily unavailable.");
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(false); }, [load]);
  const watchedBottles = preferences?.bottleAlertPreferences.bottleNames || [];
  const visibleBottles = useMemo(() => filterWatchedBottles(watchedBottles, query), [query, watchedBottles]);
  const markets = preferences?.areaPreferences.states || [];
  const inbox = (alerts?.alerts || []).filter((alert) => !alert.archivedAt).slice(0, 5);

  async function manageRadar() {
    setLinkError("");
    try { await Linking.openURL(RADAR_SETTINGS_URL); }
    catch { setLinkError("Radar settings could not be opened. Visit bourbonsignal.com from your browser."); }
  }

  return <FlatList
    contentContainerStyle={memberScreenStyles.content}
    data={visibleBottles}
    keyExtractor={(item) => canonicalBottleKey(item)}
    keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    renderItem={({ item }) => <View style={styles.watchRow}><View style={styles.watchCopy}><Text style={styles.watchName}>{item}</Text><Text style={styles.watchStatus}>Active monitoring</Text></View></View>}
    ItemSeparatorComponent={() => <View style={styles.separator} />}
    ListHeaderComponent={<View style={styles.header}>
      <ScreenIntro eyebrow="Watch list" title="Radar" description="Recent matches, watched bottles, saved markets, and alert delivery." />
      {loading && !preferences ? <LoadingState label="Loading your Radar…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
      {preferences ? <>
        <View style={memberScreenStyles.section}>
          <SectionTitle detail={alerts?.unreadCount ? `${alerts.unreadCount} unread` : "Up to date"}>Recent matches</SectionTitle>
          {inbox.length ? inbox.map((item) => <MemberCard accent={!item.readAt} key={item.id}><View style={styles.alertHeading}><Text numberOfLines={2} style={styles.bottle}>{item.bottleName}</Text><Text style={styles.priority}>{item.priorityClass === "major" ? "MAJOR" : "STANDARD"}</Text></View><Text numberOfLines={2} style={styles.location}>{[item.storeLabel, item.matchedArea || item.state].filter(Boolean).join(" · ")}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text></MemberCard>) : <EmptyState title="No recent alerts" detail="Fresh matches for your Radar will appear here." />}
        </View>
        <View style={memberScreenStyles.section}>
          <SectionTitle detail={`${markets.length} ${markets.length === 1 ? "market" : "markets"}`}>Saved markets</SectionTitle>
          {markets.length ? <MemberCard>{markets.map((state, index) => <DataRow key={state} label={state} value="Active" last={index === markets.length - 1} />)}</MemberCard> : <EmptyState title="No saved markets" detail="Your alert markets appear here once configured." />}
        </View>
        <View style={memberScreenStyles.section}>
          <SectionTitle>Alert delivery</SectionTitle>
          <MemberCard><DataRow label="In-app" value={preferences.notificationPreferences.onSite.enabled ? "On" : "Off"} /><DataRow label="Email" value={preferences.notificationPreferences.email.enabled ? "On" : "Off"} /><DataRow label="SMS" value={preferences.notificationPreferences.sms.enabled ? "On" : "Off"} last /></MemberCard>
        </View>
        <View style={styles.watchHeader}>
          <SectionTitle detail={`${visibleBottles.length} of ${watchedBottles.length}`}>Watched bottles</SectionTitle>
          <TextInput accessibilityLabel="Search watched bottles" autoCapitalize="none" clearButtonMode="while-editing" onChangeText={setQuery} placeholder="Search watched bottles" placeholderTextColor={colors.muted} style={styles.search} value={query} />
          <Pressable accessibilityHint="Opens the canonical Radar settings on Bourbon Signal" accessibilityRole="link" onPress={() => void manageRadar()} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}><Text style={styles.manageText}>Manage watched bottles and alerts ›</Text></Pressable>
          {linkError ? <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text> : null}
        </View>
      </> : null}
    </View>}
    ListEmptyComponent={preferences && !loading ? <EmptyState title={watchedBottles.length ? "No watched bottles match" : "No watched bottles"} detail={watchedBottles.length ? "Try another bottle name." : "Use Manage Radar to choose bottles and markets."} /> : null}
    style={memberScreenStyles.screen}
  />;
}

const styles = StyleSheet.create({
  header: { gap: 18, marginBottom: 2 }, watchHeader: { gap: 10, marginTop: 2 },
  search: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 15 }, manage: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, manageText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  watchRow: { minHeight: 60, flexDirection: "row", alignItems: "center", borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10 }, watchCopy: { flex: 1, gap: 3 }, watchName: { color: colors.text, fontSize: 15, fontWeight: "700" }, watchStatus: { color: colors.success, fontSize: 11, fontWeight: "700" }, separator: { height: 8 }, pressed: { opacity: 0.65 },
  alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, bottle: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 }, priority: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 }, location: { color: colors.text, fontSize: 14 }, time: { color: colors.muted, fontSize: 12 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});

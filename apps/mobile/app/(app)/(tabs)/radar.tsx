import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberAlertsResponse, MemberPreferences } from "../../../src/api/types";
import { DataRow, EmptyState, ErrorState, LoadingState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

export default function RadarScreen() {
  const api = useMobileApi();
  const { signOut } = useAuth();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [alerts, setAlerts] = useState<MemberAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextPreferences, nextAlerts] = await Promise.all([api.getMemberPreferences(), api.getMemberAlerts()]);
      setPreferences(nextPreferences);
      setAlerts(nextAlerts);
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 401) await signOut();
      else setError(caught instanceof Error ? caught.message : "Radar is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [api, signOut]);

  useEffect(() => { void load(); }, [load]);

  const watchedBottles = preferences?.bottleAlertPreferences.bottleNames || [];
  const markets = preferences?.areaPreferences.states || [];
  const inbox = (alerts?.alerts || []).filter((alert) => !alert.archivedAt).slice(0, 8);

  return (
    <ScrollView
      contentContainerStyle={memberScreenStyles.content}
      refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={load} tintColor={colors.accent} />}
      style={memberScreenStyles.screen}
    >
      <ScreenIntro eyebrow="Watch list" title="Radar" description="The bottles, markets, and alert channels you have deliberately chosen to monitor." />
      {loading && !preferences ? <LoadingState label="Loading your Radar…" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {preferences ? <>
        <View style={memberScreenStyles.section}>
          <SectionTitle detail={`${watchedBottles.length} watched`}>Watched bottles</SectionTitle>
          {watchedBottles.length ? <MemberCard>{watchedBottles.map((name, index) => <DataRow key={`${name}-${index}`} label={name} value="Watching" last={index === watchedBottles.length - 1} />)}</MemberCard>
            : <EmptyState title="No watched bottles" detail="Save a bottle to Radar from a Signal to begin monitoring it." />}
        </View>
        <View style={memberScreenStyles.section}>
          <SectionTitle detail={`${markets.length} markets`}>Saved markets</SectionTitle>
          {markets.length ? <MemberCard>{markets.map((state, index) => <DataRow key={state} label={state} value="Active" last={index === markets.length - 1} />)}</MemberCard>
            : <EmptyState title="No saved markets" detail="Your alert markets will appear here once they are configured." />}
        </View>
        <View style={memberScreenStyles.section}>
          <SectionTitle>Alert channels</SectionTitle>
          <MemberCard>
            <DataRow label="In-app" value={preferences.notificationPreferences.onSite.enabled ? "On" : "Off"} />
            <DataRow label="Email" value={preferences.notificationPreferences.email.enabled ? "On" : "Off"} />
            <DataRow label="SMS" value={preferences.notificationPreferences.sms.enabled ? "On" : "Off"} last />
          </MemberCard>
        </View>
        <View style={memberScreenStyles.section}>
          <SectionTitle detail={alerts?.unreadCount ? `${alerts.unreadCount} unread` : "Up to date"}>Recent alerts</SectionTitle>
          {inbox.length ? inbox.map((alert) => (
            <MemberCard key={alert.id} accent={!alert.readAt}>
              <View style={styles.alertHeading}><Text style={styles.bottle}>{alert.bottleName}</Text><Text style={styles.priority}>{alert.priorityClass === "major" ? "MAJOR" : "STANDARD"}</Text></View>
              <Text style={styles.location}>{[alert.storeLabel, alert.matchedArea || alert.state].filter(Boolean).join(" · ")}</Text>
              <Text style={styles.time}>{new Date(alert.createdAt).toLocaleString()}</Text>
            </MemberCard>
          )) : <EmptyState title="No recent alerts" detail="Fresh matches for your Radar will appear here." />}
        </View>
      </> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  bottle: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 },
  priority: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  location: { color: colors.text, fontSize: 14 },
  time: { color: colors.muted, fontSize: 12 },
});

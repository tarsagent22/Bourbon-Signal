import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { MemberAlert, MemberPreferences, MemberPreferencesPatch, MemberProfile, PushDeviceStatus, RadarBottleOption } from "../../../src/api/types";
import { relativeSignalTime } from "../../../src/api/presentation";
import { ErrorState, LoadingState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { canonicalBottleKey } from "../../../src/interactions/member-interactions";
import { alertIsStale, radarAreaCount, radarAreasForState, setBottleWatched, setRadarState, toggleRadarArea, watchedBottleCount } from "../../../src/radar/radar-preferences";
import { disableRadarPush, enableRadarPush, radarPushDeviceId, radarPushPermission } from "../../../src/push/push-registration";
import { colors } from "../../../src/theme";

type RadarView = "matches" | "watches" | "settings";
const VIEWS: Array<{ key: RadarView; label: string }> = [{ key: "matches", label: "Matches" }, { key: "watches", label: "Watches" }, { key: "settings", label: "Areas & delivery" }];

export default function RadarScreen() {
  const api = useMobileApi();
  const [view, setView] = useState<RadarView>("matches");
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [alerts, setAlerts] = useState<{ alerts: MemberAlert[]; unreadCount: number }>({ alerts: [], unreadCount: 0 });
  const [catalog, setCatalog] = useState<RadarBottleOption[]>([]);
  const [pushStatus, setPushStatus] = useState<PushDeviceStatus | null>(null);
  const [pushPermission, setPushPermission] = useState<string>("undetermined");
  const [query, setQuery] = useState("");
  const [focusedState, setFocusedState] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError("");
    try {
      const [nextPreferences, nextAlerts, nextProfile, nextCatalog] = await Promise.all([
        api.getMemberPreferences({ fresh }), api.getMemberAlerts({ fresh }), api.getMemberProfile({ fresh }), api.listRadarBottles({ fresh }),
      ]);
      setPreferences(nextPreferences); setAlerts(nextAlerts); setProfile(nextProfile); setCatalog(nextCatalog);
      setPhone(nextPreferences.notificationPreferences.sms.phone || "");
      const [deviceId, permission] = await Promise.all([radarPushDeviceId(), radarPushPermission().catch(() => "undetermined")]);
      const nextPush = await api.getPushDeviceStatus(deviceId, { fresh }).catch(() => null);
      setPushStatus(nextPush); setPushPermission(permission);
      setFocusedState((current) => current || nextPreferences.areaPreferences.states[0] || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Radar is temporarily unavailable.");
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(false); }, [load]);
  const watchedKeys = useMemo(() => new Set((preferences?.bottleAlertPreferences.bottleKeys || []).map(canonicalBottleKey)), [preferences]);
  const watchedNames = preferences?.bottleAlertPreferences.bottleNames || [];
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return catalog.filter((bottle) => bottle.name.toLowerCase().includes(needle)).slice(0, 30);
  }, [catalog, query]);
  const activeAlerts = alerts.alerts.filter((alert) => !alert.archivedAt);

  async function savePreferences(patch: MemberPreferencesPatch) {
    if (!preferences || saving) return null;
    setSaving(true); setActionError("");
    try {
      const saved = await api.updateMemberPreferences(patch);
      setPreferences(saved);
      return saved;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Radar settings could not be saved.");
      return null;
    } finally { setSaving(false); }
  }

  async function setWatching(name: string, watched: boolean) {
    if (!preferences) return;
    try {
      const bottleAlertPreferences = setBottleWatched(preferences, name, watched);
      await savePreferences({ bottleAlertPreferences, alertMode: watched ? "specific_bottles" : preferences.alertMode });
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "This watch could not be changed."); }
  }

  async function mutateAlert(action: "mark_read" | "mark_all_read" | "archive", alertId?: string) {
    setSaving(true); setActionError("");
    try { setAlerts(await api.updateMemberAlert(action, alertId)); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "The alert could not be updated."); }
    finally { setSaving(false); }
  }

  async function togglePush(enabled: boolean) {
    setSaving(true); setActionError("");
    try {
      const next = enabled ? await enableRadarPush(api) : await disableRadarPush(api);
      setPushStatus(next);
      setPushPermission(await radarPushPermission());
      setPreferences((current) => current ? { ...current, notificationPreferences: { ...current.notificationPreferences, push: { enabled: next.enabled } } } : current);
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Push notifications could not be changed."); }
    finally { setSaving(false); }
  }

  if (loading && !preferences) return <View style={memberScreenStyles.screen}><LoadingState label="Loading your Radar…" /></View>;
  if (error && !preferences) return <View style={[memberScreenStyles.screen, memberScreenStyles.content]}><ErrorState message={error} onRetry={() => void load(true)} /></View>;
  if (!preferences) return null;

  return <ScrollView
    contentContainerStyle={memberScreenStyles.content}
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    <ScreenIntro eyebrow="Personal monitoring" title="Radar" description={`${watchedBottleCount(preferences)} watched bottles · ${radarAreaCount(preferences.areaPreferences)} monitoring areas · ${alerts.unreadCount} unread`} />
    <View accessibilityRole="tablist" style={styles.tabs}>{VIEWS.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === item.key }} key={item.key} onPress={() => { Keyboard.dismiss(); setView(item.key); }} style={[styles.tab, view === item.key && styles.tabSelected]}><Text style={[styles.tabText, view === item.key && styles.tabTextSelected]}>{item.label}</Text></Pressable>)}</View>
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}

    {view === "matches" ? <MatchesView alerts={activeAlerts} unreadCount={alerts.unreadCount} saving={saving} onMutate={mutateAlert} /> : null}
    {view === "watches" ? <WatchesView catalog={searchResults} preferences={preferences} query={query} saving={saving} watchedKeys={watchedKeys} watchedNames={watchedNames} onQuery={setQuery} onSetWatching={setWatching} /> : null}
    {view === "settings" ? <SettingsView
      focusedState={focusedState}
      phone={phone}
      preferences={preferences}
      profile={profile}
      pushPermission={pushPermission}
      pushStatus={pushStatus}
      saving={saving}
      onFocusState={setFocusedState}
      onPhone={setPhone}
      onSave={savePreferences}
      onTogglePush={togglePush}
    /> : null}
  </ScrollView>;
}

function MatchesView({ alerts, unreadCount, saving, onMutate }: { alerts: MemberAlert[]; unreadCount: number; saving: boolean; onMutate: (action: "mark_read" | "mark_all_read" | "archive", alertId?: string) => Promise<void> }) {
  return <View style={styles.section}>
    <View style={styles.headingRow}><SectionTitle detail={`${alerts.length} active`}>Alert inbox</SectionTitle>{unreadCount ? <Pressable disabled={saving} onPress={() => void onMutate("mark_all_read")}><Text style={styles.textAction}>MARK ALL READ</Text></Pressable> : null}</View>
    {!alerts.length ? <MemberCard><Text style={styles.cardTitle}>No active matches</Text><Text style={styles.muted}>Fresh matches for your watched bottles and monitoring areas will appear here.</Text></MemberCard> : alerts.map((alert) => {
      const stale = alertIsStale(alert);
      const observedAt = alert.signalAt || alert.createdAt;
      return <MemberCard accent={!alert.readAt} key={alert.id}>
        <View style={styles.alertHeading}><Text style={styles.cardTitle}>{alert.bottleName}</Text><Text style={styles.priority}>{alert.priorityClass === "major" ? "MAJOR" : "MATCH"}</Text></View>
        <Text style={styles.location}>{[alert.storeLabel, alert.matchedArea || alert.state].filter(Boolean).join(" · ")}</Text>
        <Text style={styles.muted}>{relativeSignalTime(observedAt)}{alert.rarityTier ? ` · ${alert.rarityTier[0]?.toUpperCase()}${alert.rarityTier.slice(1)}` : ""}</Text>
        {stale ? <Text style={styles.stale}>Availability unconfirmed</Text> : <Text style={styles.fresh}>Fresh match</Text>}
        <View style={styles.rowActions}>{!alert.readAt ? <SmallButton label="Mark read" disabled={saving} onPress={() => void onMutate("mark_read", alert.id)} /> : null}<SmallButton label="Archive" disabled={saving} onPress={() => void onMutate("archive", alert.id)} /></View>
      </MemberCard>;
    })}
  </View>;
}

function WatchesView({ catalog, preferences, query, saving, watchedKeys, watchedNames, onQuery, onSetWatching }: { catalog: RadarBottleOption[]; preferences: MemberPreferences; query: string; saving: boolean; watchedKeys: Set<string>; watchedNames: string[]; onQuery: (value: string) => void; onSetWatching: (name: string, watched: boolean) => Promise<void> }) {
  const count = watchedBottleCount(preferences); const limit = preferences.entitlements?.trackedBottleLimit;
  return <View style={styles.section}>
    <SectionTitle detail={typeof limit === "number" ? `${count} / ${limit}` : `${count} watched`}>Watched bottles</SectionTitle>
    <TextInput autoCapitalize="words" autoCorrect={false} clearButtonMode="while-editing" onChangeText={onQuery} onSubmitEditing={Keyboard.dismiss} placeholder="Search the bottle catalog" placeholderTextColor={colors.muted} returnKeyType="search" style={styles.input} value={query} />
    {query.trim() ? <View style={styles.stack}>{catalog.length ? catalog.map((bottle) => {
      const watched = watchedKeys.has(canonicalBottleKey(bottle.name));
      return <View key={bottle.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.listTitle}>{bottle.name}</Text>{bottle.rarity ? <Text style={styles.muted}>{bottle.rarity}</Text> : null}</View><SmallButton disabled={saving} label={watched ? "Remove" : "Watch"} onPress={() => void onSetWatching(bottle.name, !watched)} /></View>;
    }) : <Text style={styles.muted}>No catalog bottles match that search.</Text>}</View> : <View style={styles.stack}>{watchedNames.length ? watchedNames.map((name) => <View key={canonicalBottleKey(name)} style={styles.listRow}><View style={styles.flex}><Text style={styles.listTitle}>{name}</Text><Text style={styles.fresh}>Active monitoring</Text></View><SmallButton disabled={saving} label="Remove" onPress={() => void onSetWatching(name, false)} /></View>) : <MemberCard><Text style={styles.cardTitle}>No watched bottles</Text><Text style={styles.muted}>Search the catalog above to start monitoring a bottle.</Text></MemberCard>}</View>}
  </View>;
}

function SettingsView({ focusedState, phone, preferences, profile, pushPermission, pushStatus, saving, onFocusState, onPhone, onSave, onTogglePush }: { focusedState: string; phone: string; preferences: MemberPreferences; profile: MemberProfile | null; pushPermission: string; pushStatus: PushDeviceStatus | null; saving: boolean; onFocusState: (state: string) => void; onPhone: (phone: string) => void; onSave: (patch: MemberPreferencesPatch) => Promise<MemberPreferences | null>; onTogglePush: (enabled: boolean) => Promise<void> }) {
  const states = profile?.profile.feedAreas.states || [];
  const selectedState = states.find((state) => state.code === focusedState);
  const selectedAreas = radarAreasForState(preferences.areaPreferences, focusedState);
  async function addState(code: string) { onFocusState(code); if (!preferences.areaPreferences.states.includes(code)) await onSave({ areaPreferences: setRadarState(preferences.areaPreferences, code, true) }); }
  return <View style={styles.section}>
    <SectionTitle detail={`${radarAreaCount(preferences.areaPreferences)} active`}>Monitoring areas</SectionTitle>
    <Text style={styles.muted}>Choose states, then narrow them to a City or ABC Board when available. No selected sub-area means statewide monitoring.</Text>
    <View style={styles.chips}>{states.map((state) => { const selected = preferences.areaPreferences.states.includes(state.code); return <Pressable key={state.code} onPress={() => void addState(state.code)} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{state.code}</Text></Pressable>; })}</View>
    {selectedState && preferences.areaPreferences.states.includes(selectedState.code) ? <MemberCard>
      <View style={styles.headingRow}><Text style={styles.cardTitle}>{selectedState.label}</Text><Pressable onPress={() => void onSave({ areaPreferences: setRadarState(preferences.areaPreferences, selectedState.code, false) })}><Text style={styles.dangerAction}>REMOVE</Text></Pressable></View>
      <Text style={styles.muted}>{selectedState.areaLabel}: {selectedAreas.length ? selectedAreas.join(", ") : "Statewide"}</Text>
      {selectedState.options.length ? <View style={styles.chips}>{selectedState.options.map((option) => { const selected = selectedAreas.includes(option.value); return <Pressable key={option.value} onPress={() => void onSave({ areaPreferences: toggleRadarArea(preferences.areaPreferences, selectedState.code, option.value) })} style={[styles.areaChip, selected && styles.chipSelected]}><Text style={[styles.areaChipText, selected && styles.chipTextSelected]}>{option.label}</Text></Pressable>; })}</View> : null}
    </MemberCard> : null}

    <SectionTitle>Alert criteria</SectionTitle>
    <View style={styles.choiceRow}><Choice selected={preferences.alertMode === "specific_bottles"} label="Watched bottles" onPress={() => void onSave({ alertMode: "specific_bottles" })} /><Choice selected={preferences.alertMode === "anything_notable"} label="Anything notable" onPress={() => void onSave({ alertMode: "anything_notable" })} /></View>

    <SectionTitle>Immediate delivery</SectionTitle>
    <MemberCard>
      <ToggleRow label="Push notifications" detail={pushStatus?.enabled ? `${pushStatus.registeredDeviceCount} device${pushStatus.registeredDeviceCount === 1 ? "" : "s"} registered` : pushPermission === "denied" ? "Permission disabled in device settings" : "Fastest way to receive a match"} disabled={saving} value={Boolean(pushStatus?.enabled)} onValueChange={(value) => void onTogglePush(value)} />
      {pushPermission === "denied" ? <Pressable onPress={() => void Linking.openSettings()}><Text style={styles.textAction}>OPEN DEVICE SETTINGS</Text></Pressable> : null}
      <ToggleRow label="Radar inbox" detail="Keep matches inside the app" disabled={saving} value={preferences.notificationPreferences.onSite.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { onSite: { enabled } } })} />
      <ToggleRow label="Email" detail="Send qualified matches immediately" disabled={saving} value={preferences.notificationPreferences.email.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { email: { enabled } } })} />
      <ToggleRow label="SMS" detail={!preferences.notificationPreferences.sms.available ? "Unavailable for this membership" : preferences.notificationPreferences.sms.verified ? "Phone verified" : "Enter a phone number to enable"} disabled={saving || !preferences.notificationPreferences.sms.available} value={preferences.notificationPreferences.sms.enabled} onValueChange={(enabled) => {
        if (enabled && !phone.trim()) return;
        void onSave({ notificationPreferences: { sms: { enabled, ...(phone.trim() ? { phone: phone.trim() } : {}) } } });
      }} />
      {preferences.notificationPreferences.sms.available ? <TextInput keyboardType="phone-pad" onChangeText={onPhone} placeholder="Mobile number" placeholderTextColor={colors.muted} style={styles.input} value={phone} onEndEditing={() => { if (preferences.notificationPreferences.sms.enabled && phone.trim()) void onSave({ notificationPreferences: { sms: { phone: phone.trim(), enabled: true } } }); }} /> : null}
    </MemberCard>
  </View>;
}

function ToggleRow({ label, detail, value, disabled, onValueChange }: { label: string; detail: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.listTitle}>{label}</Text><Text style={styles.muted}>{detail}</Text></View><Switch disabled={disabled} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accentPressed }} thumbColor={value ? colors.accent : colors.muted} value={value} /></View>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function SmallButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.smallButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={styles.smallButtonText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", padding: 3, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, gap: 3 },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingHorizontal: 5 }, tabSelected: { backgroundColor: colors.surfaceRaised }, tabText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, tabTextSelected: { color: colors.text },
  section: { gap: 12 }, stack: { gap: 8 }, headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, flex: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700", flex: 1 }, listTitle: { color: colors.text, fontSize: 14, fontWeight: "700" }, location: { color: colors.text, fontSize: 14, lineHeight: 19 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 17 }, fresh: { color: colors.success, fontSize: 11, fontWeight: "700" }, stale: { color: colors.muted, fontSize: 11, fontWeight: "700" }, priority: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }, smallButton: { minHeight: 38, minWidth: 74, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, smallButtonText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  listRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 9 }, input: { minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minWidth: 48, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }, areaChip: { minHeight: 38, justifyContent: "center", paddingHorizontal: 11, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, chipSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, chipText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, areaChipText: { color: colors.muted, fontSize: 12, fontWeight: "600" }, chipTextSelected: { color: colors.accent },
  choiceRow: { flexDirection: "row", gap: 8 }, choice: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10 }, choiceSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, choiceTextSelected: { color: colors.accent },
  toggleRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, textAction: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }, dangerAction: { color: colors.danger, fontSize: 10, fontWeight: "800" }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.65 },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { MemberAlert, MemberPreferences, MemberPreferencesPatch, MemberProfile, PushDeviceStatus, RadarBottleOption } from "../../../src/api/types";
import { relativeSignalTime } from "../../../src/api/presentation";
import { ErrorState, LoadingState, MemberCard, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { canonicalBottleKey } from "../../../src/interactions/member-interactions";
import { alertIsStale, clearRadarAreas, formatPhoneNumber, maskedPhoneNumber, memberAlertBottleNames, radarAreaCount, radarAreaSummary, radarAreasForState, radarStateDisplayCode, setBottleWatched, setRadarState, toggleRadarArea, watchedBottleCount } from "../../../src/radar/radar-preferences";
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
  const [pushPermission, setPushPermission] = useState("undetermined");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushRetryEnabled, setPushRetryEnabled] = useState<boolean | null>(null);
  const [pushStage, setPushStage] = useState("");
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
      setFocusedState((current) => current || nextPreferences.areaPreferences.states[0] || nextProfile.profile.feedAreas.states[0]?.code || "");
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
    if (!preferences || saving || pushBusy) return null;
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
    if (pushBusy || saving) return;
    setPushBusy(true); setPushError(""); setPushRetryEnabled(null); setActionError("");
    setPushStage(enabled ? "Registering this iPhone…" : "Turning off on this iPhone…");
    try {
      const next = enabled ? await enableRadarPush(api) : await disableRadarPush(api);
      if (enabled && !next.enabled) throw new Error("Notification permission is allowed, but this iPhone was not registered. Try again.");
      setPushStatus(next);
      setPushRetryEnabled(null);
      setPushPermission(await radarPushPermission());
      setPreferences((current) => current ? { ...current, notificationPreferences: { ...current.notificationPreferences, push: { enabled: next.enabled } } } : current);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Push notifications could not be changed.";
      setPushError(message);
      setPushRetryEnabled(enabled);
      setPushPermission(await radarPushPermission().catch(() => "undetermined"));
      Alert.alert(enabled ? "Push could not be enabled" : "Push could not be disabled", message);
    } finally { setPushBusy(false); setPushStage(""); }
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
    <Text style={styles.overview}>{watchedBottleCount(preferences)} watched · {radarAreaCount(preferences.areaPreferences)} areas · {alerts.unreadCount} unread</Text>
    <View accessibilityRole="tablist" style={styles.tabs}>{VIEWS.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === item.key }} key={item.key} onPress={() => { Keyboard.dismiss(); setView(item.key); }} style={[styles.tab, view === item.key && styles.tabSelected]}><Text style={[styles.tabText, view === item.key && styles.tabTextSelected]}>{item.label}</Text></Pressable>)}</View>
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}

    {view === "matches" ? <MatchesView alerts={activeAlerts} unreadCount={alerts.unreadCount} saving={saving} watchedNames={watchedNames} onMutate={mutateAlert} /> : null}
    {view === "watches" ? <WatchesView catalog={searchResults} preferences={preferences} query={query} saving={saving || pushBusy} watchedKeys={watchedKeys} watchedNames={watchedNames} onQuery={setQuery} onSetWatching={setWatching} /> : null}
    {view === "settings" ? <SettingsView
      focusedState={focusedState}
      phone={phone}
      preferences={preferences}
      profile={profile}
      pushBusy={pushBusy}
      pushError={pushError}
      pushRetryEnabled={pushRetryEnabled}
      pushPermission={pushPermission}
      pushStage={pushStage}
      pushStatus={pushStatus}
      saving={saving || pushBusy}
      onFocusState={setFocusedState}
      onPhone={setPhone}
      onSave={savePreferences}
      onTogglePush={togglePush}
    /> : null}
  </ScrollView>;
}

function MatchesView({ alerts, unreadCount, saving, watchedNames, onMutate }: { alerts: MemberAlert[]; unreadCount: number; saving: boolean; watchedNames: string[]; onMutate: (action: "mark_read" | "mark_all_read" | "archive", alertId?: string) => Promise<void> }) {
  const [showPast, setShowPast] = useState(false);
  const current = alerts.filter((alert) => !alertIsStale(alert));
  const past = alerts.filter((alert) => alertIsStale(alert));
  const visible = showPast ? [...current, ...past] : current;
  return <View style={styles.section}>
    <View style={styles.headingRow}><SectionTitle detail={`${current.length} current`}>Alert inbox</SectionTitle>{unreadCount ? <TextAction label="MARK ALL READ" disabled={saving} onPress={() => void onMutate("mark_all_read")} /> : null}</View>
    {!current.length && !showPast ? <MemberCard><Text style={styles.cardTitle}>No current matches</Text><Text style={styles.muted}>New freshness-qualified matches will appear here.</Text></MemberCard> : null}
    {visible.map((alert) => <AlertCard alert={alert} key={alert.id} saving={saving} watchedNames={watchedNames} onMutate={onMutate} />)}
    {past.length ? <TextAction label={showPast ? "HIDE PAST MATCHES" : `SHOW ${past.length} PAST MATCH${past.length === 1 ? "" : "ES"}`} onPress={() => setShowPast((value) => !value)} /> : null}
  </View>;
}

function AlertCard({ alert, saving, watchedNames, onMutate }: { alert: MemberAlert; saving: boolean; watchedNames: string[]; onMutate: (action: "mark_read" | "archive", alertId: string) => Promise<void> }) {
  const stale = alertIsStale(alert);
  const observedAt = alert.signalAt || alert.createdAt;
  const bottles = memberAlertBottleNames(alert, watchedNames);
  const grouped = bottles.length > 1;
  return <MemberCard accent={!alert.readAt && !stale}>
    <View style={styles.alertHeading}><Text numberOfLines={2} style={styles.cardTitle}>{grouped ? `${bottles.length} watched bottles matched` : bottles[0]}</Text><Text style={styles.priority}>{alert.priorityClass === "major" ? "MAJOR" : "MATCH"}</Text></View>
    {grouped ? <Text numberOfLines={2} style={styles.bottleSummary}>{bottles.slice(0, 3).join(" · ")}{bottles.length > 3 ? ` +${bottles.length - 3} more` : ""}</Text> : null}
    <Text style={styles.location}>{[alert.storeLabel, alert.matchedArea || alert.state].filter(Boolean).join(" · ")}</Text>
    <Text style={styles.muted}>{relativeSignalTime(observedAt)}{alert.rarityTier ? ` · ${alert.rarityTier[0]?.toUpperCase()}${alert.rarityTier.slice(1)}` : ""}</Text>
    {stale ? <Text style={styles.stale}>Past match · availability unconfirmed</Text> : <Text style={styles.fresh}>Fresh match</Text>}
    <View style={styles.rowActions}>{!alert.readAt ? <SmallButton label="Mark read" disabled={saving} onPress={() => void onMutate("mark_read", alert.id)} /> : null}<SmallButton label="Archive" disabled={saving} onPress={() => void onMutate("archive", alert.id)} /></View>
  </MemberCard>;
}

function WatchesView({ catalog, preferences, query, saving, watchedKeys, watchedNames, onQuery, onSetWatching }: { catalog: RadarBottleOption[]; preferences: MemberPreferences; query: string; saving: boolean; watchedKeys: Set<string>; watchedNames: string[]; onQuery: (value: string) => void; onSetWatching: (name: string, watched: boolean) => Promise<void> }) {
  const [showAll, setShowAll] = useState(false);
  const count = watchedBottleCount(preferences); const limit = preferences.entitlements?.trackedBottleLimit;
  const sortedWatches = [...watchedNames].sort((left, right) => left.localeCompare(right));
  const visibleWatches = showAll ? sortedWatches : sortedWatches.slice(0, 12);
  return <View style={styles.section}>
    <SectionTitle detail={typeof limit === "number" ? `${count} / ${limit}` : `${count} watched`}>Watched bottles</SectionTitle>
    <TextInput autoCapitalize="words" autoCorrect={false} clearButtonMode="while-editing" onChangeText={onQuery} onSubmitEditing={Keyboard.dismiss} placeholder="Search to add or remove" placeholderTextColor={colors.muted} returnKeyType="search" style={styles.input} value={query} />
    {query.trim() ? <View style={styles.stack}>{catalog.length ? catalog.map((bottle) => {
      const watched = watchedKeys.has(canonicalBottleKey(bottle.name));
      return <View key={bottle.id} style={styles.compactRow}><View style={styles.flex}><Text style={styles.listTitle}>{bottle.name}</Text>{bottle.rarity ? <Text style={styles.muted}>{bottle.rarity}</Text> : null}</View><TextAction disabled={saving} label={watched ? "REMOVE" : "WATCH"} onPress={() => void onSetWatching(bottle.name, !watched)} /></View>;
    }) : <Text style={styles.muted}>No catalog bottles match that search.</Text>}</View> : <View style={styles.stack}>{visibleWatches.length ? visibleWatches.map((name) => <View key={canonicalBottleKey(name)} style={styles.compactRow}><Text numberOfLines={2} style={[styles.listTitle, styles.flex]}>{name}</Text><TextAction disabled={saving} label="REMOVE" onPress={() => void onSetWatching(name, false)} /></View>) : <MemberCard><Text style={styles.cardTitle}>No watched bottles</Text><Text style={styles.muted}>Search above to start monitoring a bottle.</Text></MemberCard>}{sortedWatches.length > 12 ? <TextAction label={showAll ? "SHOW LESS" : `SHOW ALL ${sortedWatches.length}`} onPress={() => setShowAll((value) => !value)} /> : null}</View>}
  </View>;
}

function SettingsView({ focusedState, phone, preferences, profile, pushBusy, pushError, pushPermission, pushRetryEnabled, pushStage, pushStatus, saving, onFocusState, onPhone, onSave, onTogglePush }: { focusedState: string; phone: string; preferences: MemberPreferences; profile: MemberProfile | null; pushBusy: boolean; pushError: string; pushPermission: string; pushRetryEnabled: boolean | null; pushStage: string; pushStatus: PushDeviceStatus | null; saving: boolean; onFocusState: (state: string) => void; onPhone: (phone: string) => void; onSave: (patch: MemberPreferencesPatch) => Promise<MemberPreferences | null>; onTogglePush: (enabled: boolean) => Promise<void> }) {
  const [editingAreas, setEditingAreas] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");
  const [areaLimit, setAreaLimit] = useState(12);
  const states = profile?.profile.feedAreas.states || [];
  const selectedState = states.find((state) => state.code === focusedState);
  const syntheticMaryland = focusedState === "MD-MONTGOMERY";
  const selectedAreas = syntheticMaryland ? ["Montgomery County"] : radarAreasForState(preferences.areaPreferences, focusedState);
  const orderedOptions = selectedState ? [...selectedState.options].sort((left, right) => {
    const selectedDelta = Number(selectedAreas.includes(right.value)) - Number(selectedAreas.includes(left.value));
    return selectedDelta || left.label.localeCompare(right.label);
  }) : [];
  const needle = areaQuery.trim().toLowerCase();
  const matchingOptions = orderedOptions.filter((option) => !needle || option.label.toLowerCase().includes(needle));
  const visibleOptions = matchingOptions.slice(0, areaLimit);

  async function addState(code: string) {
    if (saving) return;
    onFocusState(code); setEditingAreas(false); setAreaQuery(""); setAreaLimit(12);
    if (!preferences.areaPreferences.states.includes(code)) await onSave({ areaPreferences: setRadarState(preferences.areaPreferences, code, true) });
  }

  const pushDetail = pushStatus?.enabled
    ? `${pushStatus.registeredDeviceCount} device${pushStatus.registeredDeviceCount === 1 ? "" : "s"} registered`
    : pushBusy ? pushStage
      : pushPermission === "granted" ? "Permission allowed · device registration incomplete"
        : pushPermission === "denied" ? "Permission disabled in device settings"
          : "Fastest way to receive a match";

  return <View style={styles.section}>
    <SectionTitle>Immediate delivery</SectionTitle>
    <MemberCard>
      <ToggleRow label="Push notifications" detail={pushDetail} disabled={saving} value={Boolean(pushStatus?.enabled)} onValueChange={(value) => void onTogglePush(value)} />
      {pushError ? <View style={styles.inlineError}><Text accessibilityRole="alert" style={styles.error}>{pushError}</Text>{pushRetryEnabled !== null ? <TextAction label="TRY AGAIN" disabled={saving} onPress={() => void onTogglePush(pushRetryEnabled)} /> : null}</View> : null}
      {pushPermission === "denied" ? <TextAction label="OPEN DEVICE SETTINGS" onPress={() => void Linking.openSettings()} /> : null}
      <ToggleRow label="Radar inbox" detail="Keep matches inside the app" disabled={saving} value={preferences.notificationPreferences.onSite.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { onSite: { enabled } } })} />
      <ToggleRow label="Email" detail="Send qualified matches immediately" disabled={saving} value={preferences.notificationPreferences.email.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { email: { enabled } } })} />
      <ToggleRow label="SMS" detail={!preferences.notificationPreferences.sms.available ? "Unavailable for this membership" : preferences.notificationPreferences.sms.verified ? "Phone verified" : "Enter a phone number to enable"} disabled={saving || !preferences.notificationPreferences.sms.available} value={preferences.notificationPreferences.sms.enabled} onValueChange={(enabled) => {
        if (enabled && !phone.trim()) return;
        void onSave({ notificationPreferences: { sms: { enabled, ...(phone.trim() ? { phone: phone.trim() } : {}) } } });
      }} />
      {preferences.notificationPreferences.sms.available && preferences.notificationPreferences.sms.verified && !editingPhone ? <View style={styles.phoneSummary}><View><Text style={styles.muted}>Verified mobile</Text><Text style={styles.listTitle}>{maskedPhoneNumber(preferences.notificationPreferences.sms.phone)}</Text></View><TextAction label="CHANGE" disabled={saving} onPress={() => setEditingPhone(true)} /></View> : null}
      {preferences.notificationPreferences.sms.available && (!preferences.notificationPreferences.sms.verified || editingPhone) ? <View style={styles.areaEditor}><TextInput editable={!saving} keyboardType="phone-pad" onChangeText={onPhone} placeholder="Mobile number" placeholderTextColor={colors.muted} style={styles.input} value={formatPhoneNumber(phone)} />{editingPhone ? <View style={styles.rowActions}><TextAction label="CANCEL" disabled={saving} onPress={() => { onPhone(preferences.notificationPreferences.sms.phone || ""); setEditingPhone(false); }} /><TextAction label="SAVE & ENABLE SMS" disabled={saving || phone.replace(/\D/g, "").length !== 10} onPress={() => void (async () => { const saved = await onSave({ notificationPreferences: { sms: { phone: phone.trim(), enabled: true } } }); if (saved) setEditingPhone(false); })()} /></View> : null}</View> : null}
    </MemberCard>

    <SectionTitle>Alert criteria</SectionTitle>
    <View style={styles.choiceRow}><Choice disabled={saving} selected={preferences.alertMode === "specific_bottles"} label="Watched bottles" onPress={() => void onSave({ alertMode: "specific_bottles" })} /><Choice disabled={saving} selected={preferences.alertMode === "anything_notable"} label="Anything notable" onPress={() => void onSave({ alertMode: "anything_notable" })} /></View>

    <SectionTitle detail={`${radarAreaCount(preferences.areaPreferences)} active`}>Monitoring areas</SectionTitle>
    <Text style={styles.muted}>Select a state for statewide monitoring, then optionally narrow it to covered local areas.</Text>
    <View style={styles.chips}>{states.map((state) => { const selected = preferences.areaPreferences.states.includes(state.code); return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: saving }} disabled={saving} key={state.code} onPress={() => void addState(state.code)} style={[styles.chip, selected && styles.chipSelected, saving && styles.disabled]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{radarStateDisplayCode(state.code)}</Text></Pressable>; })}</View>
    {selectedState && preferences.areaPreferences.states.includes(selectedState.code) ? <MemberCard>
      <View style={styles.headingRow}><View style={styles.flex}><Text style={styles.cardTitle}>{selectedState.label}</Text><Text numberOfLines={2} style={styles.muted}>{radarAreaSummary(selectedAreas, "Statewide monitoring")}</Text></View><TextAction danger disabled={saving} label="REMOVE" onPress={() => { setEditingAreas(false); void onSave({ areaPreferences: setRadarState(preferences.areaPreferences, selectedState.code, false) }); }} /></View>
      {selectedState.options.length && !syntheticMaryland ? <View style={styles.manageRow}><Text style={styles.muted}>{selectedAreas.length ? `${selectedAreas.length} local area${selectedAreas.length === 1 ? "" : "s"}` : "No local narrowing"}</Text><TextAction label={editingAreas ? "DONE" : "MANAGE"} onPress={() => { setEditingAreas((value) => !value); setAreaQuery(""); setAreaLimit(12); }} /></View> : null}
      {editingAreas && selectedState.options.length ? <View style={styles.areaEditor}>
        <TextInput autoCorrect={false} clearButtonMode="while-editing" onChangeText={(value) => { setAreaQuery(value); setAreaLimit(12); }} placeholder={`Search ${selectedState.areaLabel.toLowerCase()}s`} placeholderTextColor={colors.muted} style={styles.input} value={areaQuery} />
        {selectedAreas.length ? <TextAction disabled={saving} label="CLEAR LOCAL AREAS" onPress={() => void onSave({ areaPreferences: clearRadarAreas(preferences.areaPreferences, selectedState.code) })} /> : null}
        {visibleOptions.map((option) => { const selected = selectedAreas.includes(option.value); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: saving }} disabled={saving} key={option.value} onPress={() => void onSave({ areaPreferences: toggleRadarArea(preferences.areaPreferences, selectedState.code, option.value) })} style={[styles.areaRow, selected && styles.areaRowSelected, saving && styles.disabled]}><Text style={[styles.areaRowText, selected && styles.chipTextSelected]}>{option.label}</Text><Text style={[styles.areaState, selected && styles.chipTextSelected]}>{selected ? "SELECTED" : "ADD"}</Text></Pressable>; })}
        {!visibleOptions.length ? <Text style={styles.muted}>No covered areas match that search.</Text> : null}
        {matchingOptions.length > areaLimit ? <TextAction label={`SHOW ${Math.min(12, matchingOptions.length - areaLimit)} MORE`} onPress={() => setAreaLimit((value) => value + 12)} /> : null}
      </View> : null}
    </MemberCard> : null}
  </View>;
}

function ToggleRow({ label, detail, value, disabled, onValueChange }: { label: string; detail: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.listTitle}>{label}</Text><Text style={styles.muted}>{detail}</Text></View><Switch disabled={disabled} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accentPressed }} thumbColor={value ? colors.accent : colors.muted} value={value} /></View>; }
function Choice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function SmallButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.smallButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={styles.smallButtonText}>{label}</Text></Pressable>; }
function TextAction({ label, onPress, disabled = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.textActionButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.textAction, danger && styles.dangerAction]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  overview: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.15 },
  tabs: { flexDirection: "row", padding: 3, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, gap: 3 },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingHorizontal: 5 }, tabSelected: { backgroundColor: colors.surfaceRaised }, tabText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, tabTextSelected: { color: colors.text },
  section: { gap: 12 }, stack: { gap: 6 }, headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, flex: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700", flex: 1 }, listTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" }, location: { color: colors.text, fontSize: 14, lineHeight: 19 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 17 }, bottleSummary: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "600" }, fresh: { color: colors.success, fontSize: 11, fontWeight: "700" }, stale: { color: colors.muted, fontSize: 11, fontWeight: "700" }, priority: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }, smallButton: { minHeight: 36, minWidth: 72, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, smallButtonText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  compactRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 2, paddingVertical: 7 }, input: { minHeight: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minWidth: 46, minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }, chipSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, chipText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, chipTextSelected: { color: colors.accent },
  choiceRow: { flexDirection: "row", gap: 8 }, choice: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10 }, choiceSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, choiceTextSelected: { color: colors.accent },
  toggleRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, textActionButton: { minHeight: 36, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 2 }, textAction: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }, dangerAction: { color: colors.danger }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, inlineError: { gap: 2, paddingVertical: 8 }, phoneSummary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, manageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 }, areaEditor: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }, areaRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }, areaRowSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, areaRowText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" }, areaState: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.65 },
});

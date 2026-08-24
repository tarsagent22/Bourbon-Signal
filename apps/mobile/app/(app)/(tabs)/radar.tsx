import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GeographySearchResponse, MemberAlert, MemberPreferences, MemberPreferencesPatch, MemberProfile, MonitoringScope, MonitoringScopeType, PushDeviceStatus, RadarBottleOption } from "../../../src/api/types";
import { MobileApiError } from "../../../src/api/client";
import { relativeSignalTime } from "../../../src/api/presentation";
import { ErrorState, LoadingState, MemberCard, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { canonicalBottleKey } from "../../../src/interactions/member-interactions";
import { alertIsStale, compactMonitoringScopes, formatPhoneNumber, maskedPhoneNumber, memberAlertBottleNames, presentPushIssue, radarMonitoringSummary, radarStateDisplayCode, scopesForState, setBottleWatched, setStatewideScope, stopMonitoringState, toggleMonitoringScope, watchedBottleCount } from "../../../src/radar/radar-preferences";
import { disableRadarPush, enableRadarPush, radarPushDeviceId, radarPushPermission } from "../../../src/push/push-registration";
import { colors } from "../../../src/theme";

type RadarView = "matches" | "watches" | "settings";
const VIEWS: Array<{ key: RadarView; label: string }> = [{ key: "matches", label: "Matches" }, { key: "watches", label: "Watches" }, { key: "settings", label: "Areas" }];

function pushIssue(caught: unknown, fallback: string) {
  if (caught instanceof MobileApiError) return presentPushIssue(caught, fallback);
  const safeNativeMessages = new Set([
    "Push notifications require a physical device.",
    "Notification permission was not granted. Enable it in device settings to receive Radar alerts.",
    "Push project configuration is unavailable.",
  ]);
  return { message: caught instanceof Error && safeNativeMessages.has(caught.message) ? caught.message : fallback, diagnostic: "" };
}

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
  const [pushDiagnostic, setPushDiagnostic] = useState("");
  const [pushRetryEnabled, setPushRetryEnabled] = useState<boolean | null>(null);
  const [pushStage, setPushStage] = useState("");
  const [pushStatusLoadFailed, setPushStatusLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
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
      setPushError(""); setPushDiagnostic(""); setPushRetryEnabled(null);
      try {
        const [deviceId, permission] = await Promise.all([radarPushDeviceId(), radarPushPermission().catch(() => "undetermined")]);
        const nextPush = await api.getPushDeviceStatus(deviceId, { fresh });
        setPushStatus(nextPush); setPushPermission(permission); setPushStatusLoadFailed(false);
        if (nextPush?.warning) {
          const issue = presentPushIssue(nextPush.warning, "This iPhone is registered, but Push is still finishing setup.");
          setPushError(issue.message); setPushDiagnostic(issue.diagnostic); setPushRetryEnabled(true);
        }
      } catch (caught) {
        const issue = pushIssue(caught, "Push status is temporarily unavailable.");
        setPushError(issue.message); setPushDiagnostic(issue.diagnostic); setPushStatusLoadFailed(true); setPushStatus(null);
        setPushPermission(await radarPushPermission().catch(() => "undetermined"));
      }
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
    setPushBusy(true); setPushError(""); setPushDiagnostic(""); setPushRetryEnabled(null); setActionError("");
    setPushStatusLoadFailed(false);
    setPushStage(enabled ? "Registering this iPhone…" : "Turning off on this iPhone…");
    try {
      const next = enabled ? await enableRadarPush(api) : await disableRadarPush(api);
      setPushStatus(next);
      if (next.warning) {
        const issue = presentPushIssue(next.warning, "This iPhone is registered, but Push is still finishing setup.");
        setPushError(issue.message); setPushDiagnostic(issue.diagnostic);
        setPushRetryEnabled(enabled);
      } else if (enabled && !next.enabled) {
        const issue = presentPushIssue({ retryable: true }, "This iPhone could not finish Push setup.");
        setPushError(issue.message); setPushDiagnostic(issue.diagnostic); setPushRetryEnabled(true);
      } else {
        setPushRetryEnabled(null);
      }
      setPushPermission(await radarPushPermission());
      setPreferences((current) => current ? { ...current, notificationPreferences: { ...current.notificationPreferences, push: { enabled: next.enabled } } } : current);
    } catch (caught) {
      const issue = pushIssue(caught, enabled ? "Push couldn’t be turned on for this iPhone." : "Push couldn’t be turned off for this iPhone.");
      setPushError(issue.message); setPushDiagnostic(issue.diagnostic);
      setPushRetryEnabled(enabled);
      setPushPermission(await radarPushPermission().catch(() => "undetermined"));
    } finally { setPushBusy(false); setPushStage(""); }
  }

  if (loading && !preferences) return <View style={memberScreenStyles.screen}><LoadingState label="Loading your Radar…" /></View>;
  if (error && !preferences) return <View style={[memberScreenStyles.screen, memberScreenStyles.content]}><ErrorState message={error} onRetry={() => void load(true)} /></View>;
  if (!preferences) return null;

  return <ScrollView
    automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    contentContainerStyle={memberScreenStyles.content}
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(true)} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    <Text style={styles.overview}>{watchedBottleCount(preferences)} watched · {radarMonitoringSummary(preferences.monitoringScopes)} · {alerts.unreadCount} unread</Text>
    <View accessibilityRole="tablist" style={styles.tabs}>{VIEWS.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === item.key }} key={item.key} onPress={() => { Keyboard.dismiss(); setView(item.key); }} style={[styles.tab, view === item.key && styles.tabSelected]}><Text style={[styles.tabText, view === item.key && styles.tabTextSelected]}>{item.label}</Text></Pressable>)}</View>
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}

    {view === "matches" ? <MatchesView alerts={activeAlerts} unreadCount={alerts.unreadCount} saving={saving} watchedNames={watchedNames} onMutate={mutateAlert} /> : null}
    {view === "watches" ? <WatchesView catalog={searchResults} preferences={preferences} query={query} saving={saving || pushBusy} watchedKeys={watchedKeys} watchedNames={watchedNames} onQuery={setQuery} onSetWatching={setWatching} /> : null}
    {view === "settings" ? <SettingsView
      phone={phone}
      preferences={preferences}
      profile={profile}
      pushBusy={pushBusy}
      pushDiagnostic={pushDiagnostic}
      pushError={pushError}
      pushRetryEnabled={pushRetryEnabled}
      pushPermission={pushPermission}
      pushStage={pushStage}
      pushStatus={pushStatus}
      pushStatusLoadFailed={pushStatusLoadFailed}
      saving={saving || pushBusy}
      onPhone={setPhone}
      onSave={savePreferences}
      onRetryPushStatus={() => load(true)}
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
    <Text style={styles.muted}>{alert.sourceLabel || (alert.sourceType === "community" ? "Community sighting" : "Bourbon Signal")} · {relativeSignalTime(observedAt)}{alert.rarityTier ? ` · ${alert.rarityTier[0]?.toUpperCase()}${alert.rarityTier.slice(1)}` : ""}</Text>
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

function SettingsView({ phone, preferences, profile, pushBusy, pushDiagnostic, pushError, pushPermission, pushRetryEnabled, pushStage, pushStatus, pushStatusLoadFailed, saving, onPhone, onRetryPushStatus, onSave, onTogglePush }: { phone: string; preferences: MemberPreferences; profile: MemberProfile | null; pushBusy: boolean; pushDiagnostic: string; pushError: string; pushPermission: string; pushRetryEnabled: boolean | null; pushStage: string; pushStatus: PushDeviceStatus | null; pushStatusLoadFailed: boolean; saving: boolean; onPhone: (phone: string) => void; onRetryPushStatus: () => Promise<void>; onSave: (patch: MemberPreferencesPatch) => Promise<MemberPreferences | null>; onTogglePush: (enabled: boolean) => Promise<void> }) {
  const api = useMobileApi();
  const [editingPhone, setEditingPhone] = useState(false);
  const [showPushDetails, setShowPushDetails] = useState(false);
  useEffect(() => { setShowPushDetails(false); }, [pushDiagnostic]);
  const [editorState, setEditorState] = useState<{ code: string; name: string } | null>(null);
  const [editorTab, setEditorTab] = useState<"selected" | "browse">("browse");
  const [editorLevel, setEditorLevel] = useState<MonitoringScopeType>("county");
  const [draftScopes, setDraftScopes] = useState<MonitoringScope[]>([]);
  const [areaQuery, setAreaQuery] = useState("");
  const [areaPage, setAreaPage] = useState<GeographySearchResponse["results"]>([]);
  const [areaHasMore, setAreaHasMore] = useState(false);
  const [areaOffset, setAreaOffset] = useState(0);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const states = profile?.profile.feedAreas.states || [];

  useEffect(() => {
    if (!editorState || editorTab !== "browse" || editorLevel === "state") return;
    let active = true;
    const timer = setTimeout(() => {
      setAreaBusy(true); setAreaError("");
      void api.searchMonitoringGeography({ state: editorState.code, levels: [editorLevel], query: areaQuery, limit: 25, offset: areaOffset, fresh: true })
        .then((page) => { if (active) { setAreaPage((current) => areaOffset ? [...current, ...page.results] : page.results); setAreaHasMore(page.hasMore); } })
        .catch((caught) => { if (active) setAreaError(caught instanceof Error ? caught.message : "Local geography is temporarily unavailable."); })
        .finally(() => { if (active) setAreaBusy(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [api, areaOffset, areaQuery, editorLevel, editorState, editorTab]);

  function openEditor(state: { code: string; label: string }) {
    const current = scopesForState(preferences.monitoringScopes, state.code);
    setEditorState({ code: state.code, name: state.label });
    setDraftScopes(current.length ? current : setStatewideScope([], { code: state.code, name: state.label }));
    setEditorTab(current.length ? "selected" : "browse");
    setEditorLevel(state.code === "NC" ? "board" : "county");
    setAreaQuery(""); setAreaOffset(0); setAreaPage([]); setAreaError("");
  }

  async function shareInvite() {
    let link = referralLink;
    if (!link) {
      const referral = await api.getReferralSummary({ fresh: true });
      link = referral.referralLink; setReferralLink(link);
    }
    await Share.share({ message: `Bourbon Signal sources are still expanding in this area. Invite friends to boost community activity. ${link}` });
  }

  const pushDetail = pushStatus?.enabled
    ? `${pushStatus.registeredDeviceCount} device${pushStatus.registeredDeviceCount === 1 ? "" : "s"} registered`
    : pushBusy ? pushStage
      : pushPermission === "granted" ? "Permission allowed · device registration incomplete"
        : pushPermission === "denied" ? "Permission disabled in device settings"
          : "Fastest way to receive a match";
  const selectedInEditor = editorState ? scopesForState(draftScopes, editorState.code) : [];
  const compactSelected = compactMonitoringScopes(selectedInEditor.filter((scope) => scope.type !== "state"), 6);
  const visibleRows = editorTab === "selected"
    ? compactSelected.visible.map((scope) => ({ id: scope.id, level: scope.type, state: scope.state, name: scope.label }))
    : areaPage;
  const levels: MonitoringScopeType[] = editorState?.code === "NC" ? ["county", "board", "city", "store"] : ["county", "city", "store"];
  const lowCoverage = Boolean(editorState && states.find((state) => state.code === editorState.code)?.engineCoverage !== "active");

  return <View style={styles.section}>
    <SectionTitle>Immediate delivery</SectionTitle>
    <MemberCard>
      <ToggleRow label="Push notifications" detail={pushDetail} disabled={saving} value={Boolean(pushStatus?.enabled)} onValueChange={(value) => void onTogglePush(value)} />
      {pushError ? <View style={styles.inlineError}><Text accessibilityRole="alert" style={styles.error}>{pushError}</Text><View style={styles.errorActions}>{pushStatusLoadFailed || pushRetryEnabled !== null ? <TextAction label="TRY AGAIN" disabled={saving} onPress={() => void (pushStatusLoadFailed ? onRetryPushStatus() : onTogglePush(Boolean(pushRetryEnabled)))} /> : null}{pushDiagnostic ? <TextAction label={showPushDetails ? "HIDE DETAILS" : "DETAILS"} onPress={() => setShowPushDetails((value) => !value)} /> : null}</View>{showPushDetails && pushDiagnostic ? <Text selectable style={styles.supportDiagnostic}>Support code: {pushDiagnostic}</Text> : null}</View> : null}
      {pushPermission === "denied" ? <TextAction label="OPEN DEVICE SETTINGS" onPress={() => void Linking.openSettings()} /> : null}
      <ToggleRow label="Radar inbox" detail="Keep matches inside the app" disabled={saving} value={preferences.notificationPreferences.onSite.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { onSite: { enabled } } })} />
      <ToggleRow label="Email" detail="Send qualified matches immediately" disabled={saving} value={preferences.notificationPreferences.email.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { email: { enabled } } })} />
      <ToggleRow label="Community sightings" detail="Include qualified recent exact-store member reports" disabled={saving} value={preferences.notificationPreferences.sightings.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { sightings: { enabled } } })} />
      <ToggleRow label="SMS" detail={!preferences.notificationPreferences.sms.available ? "Unavailable for this membership" : preferences.notificationPreferences.sms.verified ? "Phone verified" : "Enter a phone number to enable"} disabled={saving || !preferences.notificationPreferences.sms.available} value={preferences.notificationPreferences.sms.enabled} onValueChange={(enabled) => { if (!enabled || phone.trim()) void onSave({ notificationPreferences: { sms: { enabled, ...(phone.trim() ? { phone: phone.trim() } : {}) } } }); }} />
      {preferences.notificationPreferences.sms.available && preferences.notificationPreferences.sms.verified && !editingPhone ? <View style={styles.phoneSummary}><View><Text style={styles.muted}>Verified mobile</Text><Text style={styles.listTitle}>{maskedPhoneNumber(preferences.notificationPreferences.sms.phone)}</Text></View><TextAction label="CHANGE" disabled={saving} onPress={() => setEditingPhone(true)} /></View> : null}
      {preferences.notificationPreferences.sms.available && (!preferences.notificationPreferences.sms.verified || editingPhone) ? <View style={styles.areaEditor}><TextInput editable={!saving} keyboardType="phone-pad" onChangeText={onPhone} placeholder="Mobile number" placeholderTextColor={colors.muted} style={styles.input} value={formatPhoneNumber(phone)} />{editingPhone ? <View style={styles.rowActions}><TextAction label="CANCEL" disabled={saving} onPress={() => { onPhone(preferences.notificationPreferences.sms.phone || ""); setEditingPhone(false); }} /><TextAction label="SAVE & ENABLE SMS" disabled={saving || phone.replace(/\D/g, "").length !== 10} onPress={() => void (async () => { const saved = await onSave({ notificationPreferences: { sms: { phone: phone.trim(), enabled: true } } }); if (saved) setEditingPhone(false); })()} /></View> : null}</View> : null}
    </MemberCard>

    <SectionTitle>Alert criteria</SectionTitle>
    <View style={styles.choiceRow}><Choice disabled={saving} selected={preferences.alertMode === "specific_bottles"} label="Watched bottles" onPress={() => void onSave({ alertMode: "specific_bottles" })} /><Choice disabled={saving} selected={preferences.alertMode === "anything_notable"} label="Anything notable" onPress={() => void onSave({ alertMode: "anything_notable" })} /></View>

    <SectionTitle detail={radarMonitoringSummary(preferences.monitoringScopes)}>Monitoring areas</SectionTitle>
    <Text style={styles.muted}>Tap any state to choose statewide monitoring or precise local filters.</Text>
    <View style={styles.chips}>{states.map((state) => { const selected = scopesForState(preferences.monitoringScopes, state.code).length > 0; return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: saving }} disabled={saving} key={state.code} onPress={() => openEditor(state)} style={[styles.chip, selected && styles.chipSelected, saving && styles.disabled]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{radarStateDisplayCode(state.code)}</Text></Pressable>; })}</View>

    <Modal animationType="slide" onRequestClose={() => setEditorState(null)} presentationStyle="fullScreen" visible={Boolean(editorState)}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboard}>
          <View style={styles.modalHeader}><View style={styles.flex}><Text numberOfLines={1} style={styles.modalTitle}>{editorState?.name}</Text><Text style={styles.muted}>Choose statewide or precise local monitoring</Text></View><TextAction label="CANCEL" onPress={() => setEditorState(null)} /></View>
          <View style={styles.modalBody}>
            <View style={styles.choiceRow}><Choice label={`Selected (${selectedInEditor.length})`} selected={editorTab === "selected"} onPress={() => setEditorTab("selected")} /><Choice label="Browse" selected={editorTab === "browse"} onPress={() => setEditorTab("browse")} /></View>
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedInEditor.some((scope) => scope.type === "state") }} onPress={() => editorState && setDraftScopes(setStatewideScope(draftScopes, editorState))} style={[styles.areaRow, selectedInEditor.some((scope) => scope.type === "state") && styles.areaRowSelected]}><Text style={styles.areaRowText}>Statewide</Text><Text style={styles.areaState}>{selectedInEditor.some((scope) => scope.type === "state") ? "SELECTED" : "CHOOSE"}</Text></Pressable>
            {editorTab === "browse" ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.levelScroller} contentContainerStyle={styles.levelRow}>{levels.map((level) => <Pressable key={level} onPress={() => { setEditorLevel(level); setAreaOffset(0); setAreaPage([]); }} style={[styles.levelChip, editorLevel === level && styles.chipSelected]}><Text style={[styles.chipText, editorLevel === level && styles.chipTextSelected]}>{level[0]?.toUpperCase()}{level.slice(1)}</Text></Pressable>)}</ScrollView><TextInput autoCorrect={false} clearButtonMode="while-editing" onChangeText={(value) => { setAreaQuery(value); setAreaOffset(0); setAreaPage([]); }} placeholder={`Search ${editorLevel}`} placeholderTextColor={colors.muted} style={styles.input} value={areaQuery} /></> : null}
            <ScrollView contentContainerStyle={styles.resultsContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.resultsList}>
              {editorTab === "selected" && selectedInEditor.some((scope) => scope.type === "state") ? <Text style={styles.muted}>Statewide monitoring is on. Choose Browse to replace it with local filters.</Text> : null}
              {visibleRows.map((row) => { const scope: MonitoringScope = { type: row.level, id: row.id, state: row.state, label: row.name }; const selected = draftScopes.some((item) => item.id === row.id); const message = "message" in row && typeof row.message === "string" ? row.message : ""; return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={row.id} onPress={() => setDraftScopes(toggleMonitoringScope(draftScopes, scope))} style={[styles.areaRow, selected && styles.areaRowSelected]}><View style={styles.flex}><Text numberOfLines={2} style={styles.areaRowText}>{row.name}</Text>{message ? <Text numberOfLines={2} style={styles.muted}>{message}</Text> : null}</View><Text style={[styles.areaState, selected && styles.areaStateSelected]}>{editorTab === "selected" ? "REMOVE" : selected ? "ADDED" : "ADD"}</Text></Pressable>; })}
              {areaBusy ? <Text style={styles.muted}>Loading geography…</Text> : null}
              {areaError ? <Text accessibilityRole="alert" style={styles.error}>{areaError}</Text> : null}
              {!areaBusy && !visibleRows.length && editorTab === "selected" && !selectedInEditor.some((scope) => scope.type === "state") ? <Text style={styles.muted}>No local filters selected. Choose Browse to add one.</Text> : null}
              {editorTab === "browse" && areaHasMore ? <TextAction label="LOAD MORE" onPress={() => setAreaOffset((value) => value + 25)} /> : null}
              {editorTab === "selected" && compactSelected.hidden ? <Text style={styles.selectedOverflow}>+{compactSelected.hidden} more selected · use Browse and search to manage all</Text> : null}
              {lowCoverage ? <MemberCard><Text style={styles.listTitle}>Help build activity here</Text><Text style={styles.muted}>Bourbon Signal sources are still expanding in this area. Invite friends to boost community activity.</Text><TextAction label="INVITE FRIENDS" onPress={() => void shareInvite().catch((caught) => setAreaError(caught instanceof Error ? caught.message : "Invite is temporarily unavailable."))} /></MemberCard> : null}
            </ScrollView>
          </View>
          <View style={styles.pinnedActions}><TextAction danger label="STOP MONITORING" disabled={saving || !editorState || !scopesForState(preferences.monitoringScopes, editorState.code).length} onPress={() => void (async () => { if (!editorState) return; const saved = await onSave({ monitoringScopes: stopMonitoringState(preferences.monitoringScopes, editorState.code) }); if (saved) setEditorState(null); else setAreaError("Monitoring could not be stopped. Try again."); })()} /><SmallButton primary label={saving ? "Saving…" : "Save changes"} disabled={saving || !editorState || !selectedInEditor.length} onPress={() => void (async () => { if (!editorState) return; const next = [...preferences.monitoringScopes.filter((scope) => scope.state !== editorState.code), ...selectedInEditor]; const saved = await onSave({ monitoringScopes: next }); if (saved) setEditorState(null); else setAreaError("Monitoring areas could not be saved. Try again."); })()} /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>;
}

function ToggleRow({ label, detail, value, disabled, onValueChange }: { label: string; detail: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.listTitle}>{label}</Text><Text style={styles.muted}>{detail}</Text></View><Switch disabled={disabled} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accentPressed }} thumbColor={value ? colors.accent : colors.muted} value={value} /></View>; }
function Choice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function SmallButton({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.smallButton, primary && styles.smallButtonPrimary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.smallButtonText, primary && styles.smallButtonTextPrimary]}>{label}</Text></Pressable>; }
function TextAction({ label, onPress, disabled = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.textActionButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.textAction, danger && styles.dangerAction]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  overview: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.15 },
  tabs: { flexDirection: "row", padding: 3, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, gap: 3 },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingHorizontal: 5 }, tabSelected: { backgroundColor: colors.surfaceRaised }, tabText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, tabTextSelected: { color: colors.text },
  section: { gap: 12 }, stack: { gap: 6 }, headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, flex: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700", flex: 1 }, listTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" }, location: { color: colors.text, fontSize: 14, lineHeight: 19 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 17 }, bottleSummary: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "600" }, fresh: { color: colors.success, fontSize: 11, fontWeight: "700" }, stale: { color: colors.muted, fontSize: 11, fontWeight: "700" }, priority: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }, smallButton: { minHeight: 40, minWidth: 84, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, smallButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent }, smallButtonText: { color: colors.accent, fontSize: 12, fontWeight: "800" }, smallButtonTextPrimary: { color: colors.background },
  compactRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 2, paddingVertical: 7 }, input: { minHeight: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minWidth: 46, minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }, chipSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, chipText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, chipTextSelected: { color: colors.accent },
  choiceRow: { flexDirection: "row", gap: 8 }, choice: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10 }, choiceSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, choiceTextSelected: { color: colors.accent },
  modalScreen: { flex: 1, backgroundColor: colors.background }, modalKeyboard: { flex: 1 }, modalHeader: { minHeight: 70, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, modalTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800", flexShrink: 1 }, modalBody: { flex: 1, paddingHorizontal: 18, paddingTop: 12, gap: 10 }, resultsList: { flex: 1 }, resultsContent: { gap: 8, paddingBottom: 14 }, levelScroller: { flexGrow: 0, maxHeight: 40, flexShrink: 0 }, levelRow: { gap: 8, paddingVertical: 1 }, levelChip: { minHeight: 38, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pinnedActions: { minHeight: 62, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  toggleRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, textActionButton: { minHeight: 36, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 2 }, textAction: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }, dangerAction: { color: colors.danger }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, inlineError: { gap: 5, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 10, backgroundColor: "#241513" }, errorActions: { flexDirection: "row", alignItems: "center", gap: 16 }, supportDiagnostic: { color: colors.muted, fontSize: 10, lineHeight: 15 }, phoneSummary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, manageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 }, areaEditor: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }, areaRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7 }, areaRowSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, areaRowText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" }, areaState: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 }, areaStateSelected: { color: colors.accent }, selectedOverflow: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", paddingVertical: 4 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.65 },
});

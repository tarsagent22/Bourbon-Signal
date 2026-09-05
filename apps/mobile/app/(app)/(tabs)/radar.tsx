import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { GeographySearchResponse, MemberAlert, MemberPreferences, MemberPreferencesPatch, MemberProfile, MonitoringScope, MonitoringScopeType, PushDeviceStatus, RadarBottleOption } from "../../../src/api/types";
import { MobileApiError } from "../../../src/api/client";
import { relativeSignalTime } from "../../../src/api/presentation";
import { ErrorState, LoadingState, MemberCard, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { useAccessibleStatus } from '../../../src/hooks/useAccessibleStatus';
import { canonicalBottleKey } from "../../../src/interactions/member-interactions";
import { ALERT_RARITY_TIERS, alertIsStale, compactMonitoringScopes, compactWatchedBottles, formatPhoneNumber, maskedPhoneNumber, memberAlertBottleNames, monitoringScopesChanged, presentPushIssue, radarLocalityDisplayName, radarMonitoringSummary, radarStateDisplayCode, radarWatchlistSummary, scopesForState, bottleWatchMutation, setStatewideScope, stopMonitoringState, toggleAlertRarity, toggleMonitoringScope, watchedBottleCount } from "../../../src/radar/radar-preferences";
import { radarPushState, type PushRecoveryAction } from "../../../src/radar/radar-push-state";
import { disableRadarPush, enableRadarPush, radarPushDeviceId, radarPushPermission, refreshRadarPushIfEnabled, rememberRadarPushEnabled, watchRadarPushToken } from "../../../src/push/push-registration";
import { colors } from "../../../src/theme";

type RadarView = "matches" | "watchlist";
const VIEWS: Array<{ key: RadarView; label: string }> = [{ key: "watchlist", label: "Watchlist" }, { key: "matches", label: "Matches" }];

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
  const { section: requestedSection, request } = useLocalSearchParams<{ section?: string; request?: string }>();
  const [view, setView] = useState<RadarView>("watchlist");
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [alerts, setAlerts] = useState<{ alerts: MemberAlert[]; unreadCount: number }>({ alerts: [], unreadCount: 0 });
  const [catalog, setCatalog] = useState<RadarBottleOption[]>([]);
  const [pushStatus, setPushStatus] = useState<PushDeviceStatus | null>(null);
  const [pushPermission, setPushPermission] = useState("undetermined");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushStage, setPushStage] = useState("");
  const [pushStatusLoadFailed, setPushStatusLoadFailed] = useState(false);
  const [pushFailedAction, setPushFailedAction] = useState<"enable" | "disable" | null>(null);
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const loadSequence = useRef(0);
  const writeSequence = useRef(0);
  const preferenceMutationEpoch = useRef(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  useAccessibleStatus(actionError || error || saveNotice);

  const load = useCallback(async (fresh = false) => {
    const sequence = ++loadSequence.current;
    const preferenceMutationAtStart = preferenceMutationEpoch.current;
    setLoading(true); setError("");
    try {
      const [nextPreferences, nextAlerts, nextProfile, nextCatalog] = await Promise.all([
        api.getMemberPreferences({ fresh }), api.getMemberAlerts({ fresh }), api.getMemberProfile({ fresh }), api.listRadarBottles({ fresh }),
      ]);
      if (sequence !== loadSequence.current) return;
      if (preferenceMutationAtStart === preferenceMutationEpoch.current) {
        setPreferences(nextPreferences);
        setPhone(nextPreferences.notificationPreferences.sms.phone || "");
      }
      setAlerts(nextAlerts); setProfile(nextProfile); setCatalog(nextCatalog);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setPushError(""); setPushFailedAction(null);
      try {
        const [deviceId, permission] = await Promise.all([radarPushDeviceId(), radarPushPermission().catch(() => "undetermined")]);
        const nextPush = await api.getPushDeviceStatus(deviceId, { fresh });
        if (sequence !== loadSequence.current) return;
        await rememberRadarPushEnabled(nextPush.enabled);
        const refreshedPush = nextPush.enabled ? await refreshRadarPushIfEnabled(api).catch(() => null) : null;
        if (sequence !== loadSequence.current) return;
        const resolvedPush = refreshedPush || nextPush;
        setPushStatus(resolvedPush); setPushPermission(permission); setPushStatusLoadFailed(false);
        if (resolvedPush.warning) {
          const issue = presentPushIssue(resolvedPush.warning, "Push setup on this phone still needs attention.");
          setPushError(issue.message);
        }
      } catch (caught) {
        if (sequence !== loadSequence.current) return;
        const issue = pushIssue(caught, "Push status is temporarily unavailable.");
        setPushError(issue.message); setPushStatusLoadFailed(true); setPushStatus(null);
        setPushPermission(await radarPushPermission().catch(() => "undetermined"));
      }
    } catch {
      if (sequence !== loadSequence.current) return;
      setError("Radar is temporarily unavailable. Pull to retry.");
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [api]);

  useEffect(() => () => { loadSequence.current += 1; }, [api]);
  useScreenRevalidation(() => load(true));
  useEffect(() => { if (requestedSection === "matches" && request) { setView("matches"); void load(true); } }, [load, requestedSection, request]);
  useEffect(() => {
    let active = true;
    const subscription = watchRadarPushToken(api, (status) => { if (active && status) setPushStatus(status); });
    return () => { active = false; subscription.remove(); };
  }, [api]);
  const watchedKeys = useMemo(() => new Set((preferences?.bottleAlertPreferences.bottleKeys || []).map(canonicalBottleKey)), [preferences]);
  const watchedNames = preferences?.bottleAlertPreferences.bottleNames || [];
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return catalog.filter((bottle) => bottle.name.toLowerCase().includes(needle)).slice(0, 30);
  }, [catalog, query]);
  const activeAlerts = alerts.alerts.filter((alert) => !alert.archivedAt);
  const pushPresentation = radarPushState({ status: pushStatus, permission: pushPermission, preferenceEnabled: Boolean(preferences?.notificationPreferences.push.enabled), error: pushError, statusLoadFailed: pushStatusLoadFailed, failedAction: pushFailedAction });
  const pushReadiness = pushPresentation.readiness;
  const pushRecoveryAction: PushRecoveryAction = pushPresentation.action;

  async function savePreferences(patch: MemberPreferencesPatch) {
    if (!preferences || saving || pushBusy) return null;
    const sequence = ++writeSequence.current;
    preferenceMutationEpoch.current += 1;
    setSaving(true); setActionError(""); setSaveNotice("");
    try {
      const saved = await api.updateMemberPreferences(patch);
      if (sequence === writeSequence.current) {
        setPreferences(saved);
        setSaveNotice("Radar settings saved.");
      }
      return saved;
    } catch {
      if (sequence === writeSequence.current) setActionError("Radar settings could not be saved. Try again.");
      return null;
    } finally {
      preferenceMutationEpoch.current += 1;
      if (sequence === writeSequence.current) setSaving(false);
    }
  }

  async function setWatching(name: string, watched: boolean, preserveAlertMode = false) {
    if (!preferences) return null;
    try {
      return await savePreferences({ watchlistMutation: bottleWatchMutation(name, watched), ...(watched && !preserveAlertMode ? { alertMode: "specific_bottles" as const } : {}) });
    } catch { setActionError("This watch could not be changed. Try again."); return null; }
  }

  async function mutateAlert(action: "mark_read" | "mark_all_read" | "archive", alertId?: string) {
    setSaving(true); setActionError("");
    try { setAlerts(await api.updateMemberAlert(action, alertId)); }
    catch { setActionError("This match could not be updated. Try again."); }
    finally { setSaving(false); }
  }

  async function togglePush(enabled: boolean) {
    if (pushBusy || saving) return;
    setPushBusy(true); setPushError(""); setPushFailedAction(null); setActionError("");
    setPushStatusLoadFailed(false);
    setPushStage(enabled ? "Registering this phone…" : "Turning off on this phone…");
    try {
      const next = enabled ? await enableRadarPush(api) : await disableRadarPush(api);
      setPushStatus(next);
      if (next.warning) {
        const issue = presentPushIssue(next.warning, "Push setup on this phone still needs attention.");
        setPushError(issue.message);
        setPushFailedAction(enabled ? "enable" : "disable");
      } else if (enabled && !next.enabled) {
        const issue = presentPushIssue({ retryable: true }, "This phone could not finish Push setup.");
        setPushError(issue.message);
      }
      setPushPermission(await radarPushPermission());
      setPreferences((current) => current ? { ...current, notificationPreferences: { ...current.notificationPreferences, push: { enabled: next.enabled } } } : current);
    } catch (caught) {
      const issue = pushIssue(caught, enabled ? "Push couldn’t be turned on for this phone." : "Push couldn’t be turned off for this phone.");
      setPushError(issue.message);
      setPushFailedAction(enabled ? "enable" : "disable");
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
    <Text style={styles.overview}>{radarWatchlistSummary(preferences)}</Text>
    {lastUpdated ? <Text style={styles.muted}>Updated {lastUpdated}{error ? ' · Showing last loaded data' : ''}</Text> : null}
    <View style={styles.pushReadinessRow}><Text style={[styles.pushReadinessLabel, pushReadiness === "Setup needed" && styles.pushNeedsSetup, pushReadiness === "On" && styles.pushOn]}>Push to this phone: {pushReadiness}</Text></View>
    {pushReadiness === "Setup needed" ? <MemberCard accent>
      <Text style={styles.cardTitle}>Finish setting up push alerts</Text>
      <Text style={styles.muted}>{pushError || "This phone has notification permission, but Radar registration is not complete."}</Text>
      <SmallButton primary label={pushBusy ? "Working…" : pushRecoveryAction === "settings" ? "Open device settings" : pushRecoveryAction === "retry-status" ? "Retry status" : pushRecoveryAction === "retry-disable" ? "Retry turning off" : "Finish setup"} disabled={pushBusy || saving} onPress={() => { if (pushRecoveryAction === "settings") void Linking.openSettings(); else if (pushRecoveryAction === "retry-status") void load(true); else if (pushRecoveryAction === "retry-disable") void togglePush(false); else void togglePush(true); }} />
    </MemberCard> : null}
    {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
    <View accessibilityRole="tablist" style={styles.tabs}>{VIEWS.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === item.key }} key={item.key} onPress={() => { Keyboard.dismiss(); setView(item.key); }} style={[styles.tab, view === item.key && styles.tabSelected]}><Text style={[styles.tabText, view === item.key && styles.tabTextSelected]}>{item.label}</Text>{item.key === "matches" && alerts.unreadCount ? <View accessibilityLabel={`${alerts.unreadCount} unread matches`} style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{alerts.unreadCount > 99 ? "99+" : alerts.unreadCount}</Text></View> : null}</Pressable>)}</View>
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}

    {view === "matches" ? <MatchesView alerts={activeAlerts} unreadCount={alerts.unreadCount} saving={saving} watchedNames={watchedNames} onMutate={mutateAlert} onOpenWatchlist={() => setView("watchlist")} /> : null}
    {view === "watchlist" ? <WatchlistView
      catalog={searchResults}
      phone={phone}
      preferences={preferences}
      profile={profile}
      pushBusy={pushBusy}
      pushError={pushError}
      pushPermission={pushPermission}
      pushStage={pushStage}
      pushStatus={pushStatus}
      query={query}
      saving={saving || pushBusy}
      watchedKeys={watchedKeys}
      watchedNames={watchedNames}
      onPhone={setPhone}
      onQuery={setQuery}
      onSave={savePreferences}
      onSetWatching={setWatching}
      onTogglePush={togglePush}
    /> : null}
  </ScrollView>;
}

function MatchesView({ alerts, unreadCount, saving, watchedNames, onMutate, onOpenWatchlist }: { alerts: MemberAlert[]; unreadCount: number; saving: boolean; watchedNames: string[]; onMutate: (action: "mark_read" | "mark_all_read" | "archive", alertId?: string) => Promise<void>; onOpenWatchlist: () => void }) {
  const [showPast, setShowPast] = useState(false);
  const current = alerts.filter((alert) => !alertIsStale(alert));
  const past = alerts.filter((alert) => alertIsStale(alert));
  const visible = showPast ? [...current, ...past] : current;
  return <View style={styles.section}>
    <View style={styles.headingRow}><SectionTitle detail={`${current.length} current`}>Alert inbox</SectionTitle>{unreadCount ? <TextAction label="MARK ALL READ" disabled={saving} onPress={() => void onMutate("mark_all_read")} /> : null}</View>
    {!current.length && !showPast ? <MemberCard>
      <Text style={styles.cardTitle}>No current matches</Text>
      <Text style={styles.muted}>Nothing is freshness-qualified right now. New matches will appear here as Radar finds them.</Text>
      {past.length ? <Text style={styles.muted}>{past.length} past match{past.length === 1 ? " is" : "es are"} still available to review.</Text> : null}
      <View style={styles.rowActions}>
        {past.length ? <TextAction label={`VIEW ${past.length} PAST MATCH${past.length === 1 ? "" : "ES"}`} onPress={() => setShowPast(true)} /> : null}
        <TextAction label="REVIEW WATCHLIST" onPress={onOpenWatchlist} />
      </View>
    </MemberCard> : null}
    {visible.map((alert) => <AlertCard alert={alert} key={alert.id} saving={saving} watchedNames={watchedNames} onMutate={onMutate} />)}
    {past.length && (current.length || showPast) ? <TextAction label={showPast ? "HIDE PAST MATCHES" : `SHOW ${past.length} PAST MATCH${past.length === 1 ? "" : "ES"}`} onPress={() => setShowPast((value) => !value)} /> : null}
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

function BottleWatchlist({ catalog, preferences, query, saving, watchedKeys, watchedNames, onQuery, onSetWatching }: { catalog: RadarBottleOption[]; preferences: MemberPreferences; query: string; saving: boolean; watchedKeys: Set<string>; watchedNames: string[]; onQuery: (value: string) => void; onSetWatching: (name: string, watched: boolean, preserveAlertMode?: boolean) => Promise<MemberPreferences | null> }) {
  const [showAll, setShowAll] = useState(false);
  const [undoBottle, setUndoBottle] = useState<{ name: string } | null>(null);
  const mutationSequence = useRef(0);
  const count = watchedBottleCount(preferences); const limit = preferences.entitlements?.trackedBottleLimit;
  const watchlist = compactWatchedBottles(watchedNames, showAll);
  useEffect(() => { if (showAll && watchlist.totalCount <= 3) setShowAll(false); }, [showAll, watchlist.totalCount]);
  async function updateWatch(name: string, watched: boolean) {
    const mutation = ++mutationSequence.current;
    const saved = await onSetWatching(name, watched);
    if (mutation !== mutationSequence.current || !saved) return;
    if (!watched) setUndoBottle({ name });
    else if (undoBottle && canonicalBottleKey(undoBottle.name) === canonicalBottleKey(name)) setUndoBottle(null);
  }
  async function undoRemoval() {
    if (!undoBottle) return;
    if (watchedKeys.has(canonicalBottleKey(undoBottle.name))) { setUndoBottle(null); return; }
    const mutation = ++mutationSequence.current;
    const saved = await onSetWatching(undoBottle.name, true, true);
    if (saved && mutation === mutationSequence.current) setUndoBottle(null);
  }
  return <View style={styles.section}>
    <SectionTitle detail={typeof limit === "number" ? `${count} / ${limit}` : `${count} watched`}>Your bottles</SectionTitle>
    <TextInput accessibilityLabel="Search watched bottles" accessibilityHint="Search the bottle catalog to add or remove a watch." autoCapitalize="words" autoCorrect={false} clearButtonMode="while-editing" onChangeText={onQuery} onSubmitEditing={Keyboard.dismiss} placeholder="Search to add or remove" placeholderTextColor={colors.muted} returnKeyType="search" style={styles.input} value={query} />
    {query.trim() ? <View style={styles.stack}>{catalog.length ? catalog.map((bottle) => {
      const watched = watchedKeys.has(canonicalBottleKey(bottle.name));
      return <View key={bottle.id} style={styles.compactRow}><View style={styles.flex}><Text style={styles.listTitle}>{bottle.name}</Text>{bottle.rarity ? <Text style={styles.muted}>{bottle.rarity}</Text> : null}</View><TextAction disabled={saving} quiet={watched} label={watched ? "REMOVE" : "WATCH"} onPress={() => void updateWatch(bottle.name, !watched)} /></View>;
    }) : <Text style={styles.muted}>No catalog bottles match that search.</Text>}</View> : <View style={styles.stack}>{watchlist.visible.length ? watchlist.visible.map((name) => <View key={canonicalBottleKey(name)} style={styles.compactRow}><Text numberOfLines={2} style={[styles.listTitle, styles.flex]}>{name}</Text><TextAction disabled={saving} quiet label="REMOVE" onPress={() => void updateWatch(name, false)} /></View>) : <MemberCard><Text style={styles.cardTitle}>No watched bottles</Text><Text style={styles.muted}>Search above to start monitoring a bottle.</Text></MemberCard>}{watchlist.totalCount > 3 ? <TextAction expanded={showAll} label={showAll ? "SHOW LESS" : `VIEW ALL ${watchlist.totalCount} BOTTLES`} onPress={() => setShowAll((value) => !value)} /> : null}</View>}
    {undoBottle ? <View accessibilityLiveRegion="polite" style={styles.undoRow}><Text style={styles.muted}>Removed {undoBottle.name}</Text><TextAction label="UNDO" disabled={saving} onPress={() => void undoRemoval()} /></View> : null}
  </View>;
}

function WatchlistView({ catalog, phone, preferences, profile, pushBusy, pushError, pushPermission, pushStage, pushStatus, query, saving, watchedKeys, watchedNames, onPhone, onQuery, onSave, onSetWatching, onTogglePush }: { catalog: RadarBottleOption[]; phone: string; preferences: MemberPreferences; profile: MemberProfile | null; pushBusy: boolean; pushError: string; pushPermission: string; pushStage: string; pushStatus: PushDeviceStatus | null; query: string; saving: boolean; watchedKeys: Set<string>; watchedNames: string[]; onPhone: (phone: string) => void; onQuery: (value: string) => void; onSave: (patch: MemberPreferencesPatch) => Promise<MemberPreferences | null>; onSetWatching: (name: string, watched: boolean, preserveAlertMode?: boolean) => Promise<MemberPreferences | null>; onTogglePush: (enabled: boolean) => Promise<void> }) {
  const api = useMobileApi();
  const insets = useSafeAreaInsets();
  const [editingPhone, setEditingPhone] = useState(false);
  const [locationsExpanded, setLocationsExpanded] = useState(false);
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
        .catch(() => { if (active) setAreaError("Local geography is temporarily unavailable. Try again."); })
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

  const pushDetail = pushError || pushStatus?.warning ? "Setup needed"
    : pushPermission === "denied" ? "Off · permission disabled in device settings"
    : pushStatus?.enabled && pushStatus.currentDeviceRegistered !== false && pushPermission === "granted"
    ? `On · ${pushStatus.registeredDeviceCount} registered device${pushStatus.registeredDeviceCount === 1 ? "" : "s"}`
    : pushBusy ? pushStage
      : preferences.notificationPreferences.push.enabled ? "Setup needed · registration incomplete"
        : "Off · enable for alerts on this phone";
  const locationSummary = preferences.monitoringScopes.length
    ? `${preferences.monitoringScopes.slice(0, 3).map((scope) => scope.type === "state" ? `${scope.state} statewide` : `${scope.state}: ${scope.label}`).join(" · ")}${preferences.monitoringScopes.length > 3 ? ` +${preferences.monitoringScopes.length - 3} more` : ""}`
    : "No saved locations";
  const selectedInEditor = editorState ? scopesForState(draftScopes, editorState.code) : [];
  const editorHasChanges = Boolean(editorState && monitoringScopesChanged(preferences.monitoringScopes, selectedInEditor, editorState.code));
  const compactSelected = compactMonitoringScopes(selectedInEditor.filter((scope) => scope.type !== "state"), 6);
  const visibleRows = editorTab === "selected"
    ? compactSelected.visible.map((scope) => ({ id: scope.id, level: scope.type, state: scope.state, name: scope.label, displayName: scope.type === "city" ? radarLocalityDisplayName(scope.label) : scope.label, subtitle: null }))
    : areaPage;
  const levels: MonitoringScopeType[] = editorState?.code === "NC" ? ["county", "board", "city", "store"] : ["county", "city", "store"];
  const lowCoverage = Boolean(editorState && states.find((state) => state.code === editorState.code)?.engineCoverage !== "active");

  return <View style={styles.section}>
    <SectionTitle>Bottles</SectionTitle>
    <View style={styles.choiceRow}><Choice disabled={saving} selected={preferences.alertMode === "specific_bottles"} label="Specific bottles" onPress={() => void onSave({ alertMode: "specific_bottles" })} /><Choice disabled={saving} selected={preferences.alertMode === "anything_notable"} label="Anything notable" onPress={() => void onSave({ alertMode: "anything_notable" })} /></View>
    <Text style={styles.muted}>{preferences.alertMode === "anything_notable" ? "Anything notable includes qualifying bottles in your chosen rarity tiers, even when they are not on a bottle list." : "Only watched bottles can create bottle-specific matches."}</Text>
    {preferences.alertMode === "specific_bottles" ? <BottleWatchlist catalog={catalog} preferences={preferences} query={query} saving={saving} watchedKeys={watchedKeys} watchedNames={watchedNames} onQuery={onQuery} onSetWatching={onSetWatching} /> : null}
    <SectionTitle detail="Applies to inbox, phone push, email, and SMS">Rarity</SectionTitle>
    <Text style={styles.muted}>Choose which bottle tiers can trigger a match.</Text>
    <View style={styles.choiceRow}>{ALERT_RARITY_TIERS.map((tier) => <RarityChoice disabled={saving} key={tier} label={tier[0].toUpperCase() + tier.slice(1)} selected={preferences.notificationPreferences.rarityTiers.includes(tier)} onPress={() => void onSave({ notificationPreferences: { rarityTiers: toggleAlertRarity(preferences.notificationPreferences.rarityTiers, tier) } })} />)}</View>

    <SectionTitle detail={radarMonitoringSummary(preferences.monitoringScopes)}>Locations</SectionTitle>
    <MemberCard>
      <Text style={styles.listTitle}>{locationSummary}</Text>
      <Text style={styles.muted}>Radar uses only these saved selections. Home browsing filters stay separate.</Text>
      <TextAction expanded={locationsExpanded} label={locationsExpanded ? "DONE" : "EDIT LOCATIONS"} onPress={() => setLocationsExpanded((value) => !value)} />
      {locationsExpanded ? <View style={styles.locationChoices}><Text style={styles.muted}>Choose a state to edit statewide or precise local filters.</Text><View style={styles.chips}>{states.map((state) => { const selected = scopesForState(preferences.monitoringScopes, state.code).length > 0; return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: saving }} disabled={saving} key={state.code} onPress={() => openEditor(state)} style={[styles.chip, selected && styles.chipSelected, saving && styles.disabled]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{radarStateDisplayCode(state.code)}</Text></Pressable>; })}</View></View> : null}
    </MemberCard>

    <SectionTitle>Delivery</SectionTitle>
    <MemberCard>
      <ToggleRow label="Push to this phone" detail={pushBusy ? pushStage : pushDetail} disabled={saving} value={Boolean(pushStatus?.enabled)} onValueChange={(value) => void onTogglePush(value)} />
      <ToggleRow label="Radar inbox" detail="Keep matches inside the app even when phone push is off" disabled={saving} value={preferences.notificationPreferences.onSite.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { onSite: { enabled } } })} />
      <ToggleRow label="Email" detail="Send qualified matches immediately" disabled={saving} value={preferences.notificationPreferences.email.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { email: { enabled } } })} />
      <ToggleRow label="Community sightings" detail="Include qualified recent exact-store member reports" disabled={saving} value={preferences.notificationPreferences.sightings.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { sightings: { enabled } } })} />
      <ToggleRow label="SMS" detail={!preferences.notificationPreferences.sms.available ? "Unavailable for this membership" : preferences.notificationPreferences.sms.verified ? "Phone verified" : "Enter a phone number to enable"} disabled={saving || !preferences.notificationPreferences.sms.available} value={preferences.notificationPreferences.sms.enabled} onValueChange={(enabled) => { if (!enabled || phone.trim()) void onSave({ notificationPreferences: { sms: { enabled, ...(phone.trim() ? { phone: phone.trim() } : {}) } } }); }} />
      {preferences.notificationPreferences.sms.available && preferences.notificationPreferences.sms.verified && !editingPhone ? <View style={styles.phoneSummary}><View><Text style={styles.muted}>Verified mobile</Text><Text style={styles.listTitle}>{maskedPhoneNumber(preferences.notificationPreferences.sms.phone)}</Text></View><TextAction label="CHANGE" disabled={saving} onPress={() => setEditingPhone(true)} /></View> : null}
      {preferences.notificationPreferences.sms.available && (!preferences.notificationPreferences.sms.verified || editingPhone) ? <View style={styles.areaEditor}><TextInput accessibilityLabel="Mobile number for SMS alerts" accessibilityHint="Enter your mobile number. Enabling SMS gives consent to receive alert messages." editable={!saving} keyboardType="phone-pad" onChangeText={onPhone} placeholder="Mobile number" placeholderTextColor={colors.muted} style={styles.input} value={formatPhoneNumber(phone)} />{editingPhone ? <View style={styles.rowActions}><TextAction label="CANCEL" disabled={saving} onPress={() => { onPhone(preferences.notificationPreferences.sms.phone || ""); setEditingPhone(false); }} /><TextAction label="SAVE & ENABLE SMS" disabled={saving || phone.replace(/\D/g, "").length !== 10} onPress={() => void (async () => { const saved = await onSave({ notificationPreferences: { sms: { phone: phone.trim(), enabled: true } } }); if (saved) setEditingPhone(false); })()} /></View> : null}</View> : null}
    </MemberCard>

    <Modal animationType="slide" onRequestClose={() => setEditorState(null)} presentationStyle="fullScreen" visible={Boolean(editorState)}>
      <SafeAreaView edges={["bottom"]} style={[styles.modalScreen, { paddingTop: Math.max(insets.top, 12) }]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboard}>
          <View style={styles.modalHeader}><View style={styles.flex}><Text numberOfLines={1} style={styles.modalTitle}>{editorState?.name}</Text><Text style={styles.muted}>Choose statewide or precise local monitoring</Text></View><TextAction label="CANCEL" onPress={() => setEditorState(null)} /></View>
          <View style={styles.modalBody}>
            <View style={styles.choiceRow}><Choice label={`Selected (${selectedInEditor.length})`} selected={editorTab === "selected"} onPress={() => setEditorTab("selected")} /><Choice label="Browse" selected={editorTab === "browse"} onPress={() => setEditorTab("browse")} /></View>
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedInEditor.some((scope) => scope.type === "state") }} onPress={() => editorState && setDraftScopes(setStatewideScope(draftScopes, editorState))} style={[styles.areaRow, selectedInEditor.some((scope) => scope.type === "state") && styles.areaRowSelected]}><Text style={styles.areaRowText}>Statewide</Text><Text style={styles.areaState}>{selectedInEditor.some((scope) => scope.type === "state") ? "SELECTED" : "CHOOSE"}</Text></Pressable>
            {editorTab === "browse" ? <Text style={styles.scopeGuidance}>{selectedInEditor.some((scope) => scope.type === "state") ? "Adding a local filter replaces statewide monitoring." : "Choosing Statewide replaces your local filters."}</Text> : null}
            {editorTab === "browse" ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.levelScroller} contentContainerStyle={styles.levelRow}>{levels.map((level) => <Pressable key={level} onPress={() => { setEditorLevel(level); setAreaOffset(0); setAreaPage([]); }} style={[styles.levelChip, editorLevel === level && styles.chipSelected]}><Text style={[styles.chipText, editorLevel === level && styles.chipTextSelected]}>{level[0]?.toUpperCase()}{level.slice(1)}</Text></Pressable>)}</ScrollView><TextInput autoCorrect={false} clearButtonMode="while-editing" onChangeText={(value) => { setAreaQuery(value); setAreaOffset(0); setAreaPage([]); }} accessibilityLabel={`Search ${editorLevel}`} accessibilityHint="Search available monitoring areas." placeholder={`Search ${editorLevel}`} placeholderTextColor={colors.muted} style={styles.input} value={areaQuery} /></> : null}
            <ScrollView contentContainerStyle={styles.resultsContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.resultsList}>
              {editorTab === "selected" && selectedInEditor.some((scope) => scope.type === "state") ? <Text style={styles.muted}>Statewide monitoring is on. Choose Browse to replace it with local filters.</Text> : null}
              {visibleRows.map((row) => { const displayName = "displayName" in row && typeof row.displayName === "string" ? row.displayName : row.level === "city" ? radarLocalityDisplayName(row.name) : row.name; const scope: MonitoringScope = { type: row.level, id: row.id, state: row.state, label: row.name }; const selected = draftScopes.some((item) => item.id === row.id); const subtitle = "subtitle" in row && typeof row.subtitle === "string" ? row.subtitle : ""; const message = "message" in row && typeof row.message === "string" ? row.message : ""; return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={row.id} onPress={() => setDraftScopes(toggleMonitoringScope(draftScopes, scope))} style={[styles.areaRow, selected && styles.areaRowSelected]}><View style={styles.flex}><Text numberOfLines={2} style={styles.areaRowText}>{displayName}</Text>{subtitle ? <Text numberOfLines={1} style={styles.areaSubtitle}>{subtitle}</Text> : null}{message ? <Text numberOfLines={2} style={styles.muted}>{message}</Text> : null}</View><Text style={[styles.areaState, selected && styles.areaStateSelected]}>{editorTab === "selected" ? "REMOVE" : selected ? "ADDED" : "ADD"}</Text></Pressable>; })}
              {areaBusy ? <Text style={styles.muted}>Loading geography…</Text> : null}
              {areaError ? <Text accessibilityRole="alert" style={styles.error}>{areaError}</Text> : null}
              {!areaBusy && !visibleRows.length && editorTab === "selected" && !selectedInEditor.some((scope) => scope.type === "state") ? <Text style={styles.muted}>No local filters selected. Choose Browse to add one.</Text> : null}
              {editorTab === "browse" && areaHasMore ? <TextAction label="LOAD MORE" onPress={() => setAreaOffset((value) => value + 25)} /> : null}
              {editorTab === "selected" && compactSelected.hidden ? <Text style={styles.selectedOverflow}>+{compactSelected.hidden} more selected · use Browse and search to manage all</Text> : null}
              {lowCoverage ? <MemberCard><Text style={styles.listTitle}>Help build activity here</Text><Text style={styles.muted}>Bourbon Signal sources are still expanding in this area. Invite friends to boost community activity.</Text><TextAction label="INVITE FRIENDS" onPress={() => void shareInvite().catch(() => setAreaError("Invite is temporarily unavailable. Try again."))} /></MemberCard> : null}
            </ScrollView>
          </View>
          <View style={styles.pinnedActions}><TextAction danger label="STOP MONITORING" disabled={saving || !editorState || !scopesForState(preferences.monitoringScopes, editorState.code).length} onPress={() => void (async () => { if (!editorState) return; const saved = await onSave({ monitoringScopes: stopMonitoringState(preferences.monitoringScopes, editorState.code) }); if (saved) setEditorState(null); else setAreaError("Monitoring could not be stopped. Try again."); })()} /><SmallButton primary label={saving ? "Saving…" : "Save changes"} disabled={saving || !editorState || !selectedInEditor.length || !editorHasChanges} onPress={() => void (async () => { if (!editorState) return; const next = [...preferences.monitoringScopes.filter((scope) => scope.state !== editorState.code), ...selectedInEditor]; const saved = await onSave({ monitoringScopes: next }); if (saved) setEditorState(null); else setAreaError("Monitoring areas could not be saved. Try again."); })()} /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>;
}

function ToggleRow({ label, detail, value, disabled, onValueChange }: { label: string; detail: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.listTitle}>{label}</Text><Text style={styles.muted}>{detail}</Text></View><Switch disabled={disabled} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accentPressed }} thumbColor={value ? colors.accent : colors.muted} value={value} /></View>; }
function Choice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function RarityChoice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function SmallButton({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.smallButton, primary && styles.smallButtonPrimary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.smallButtonText, primary && styles.smallButtonTextPrimary]}>{label}</Text></Pressable>; }
function TextAction({ label, onPress, disabled = false, danger = false, quiet = false, expanded }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; quiet?: boolean; expanded?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={disabled} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.textActionButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.textAction, danger && styles.dangerAction, quiet && styles.quietAction]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  overview: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.15 },
  pushReadinessRow: { minHeight: 28, flexDirection: "row", alignItems: "center" }, pushReadinessLabel: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "700" }, pushNeedsSetup: { color: colors.accent }, pushOn: { color: colors.success },
  tabs: { flexDirection: "row", padding: 3, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, gap: 3 },
  tab: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, paddingHorizontal: 5 }, tabSelected: { backgroundColor: colors.surfaceRaised }, tabText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, tabTextSelected: { color: colors.text }, unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent }, unreadBadgeText: { color: colors.background, fontSize: 10, fontWeight: "900" },
  section: { gap: 12 }, stack: { gap: 6 }, headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, flex: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700", flex: 1 }, listTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" }, location: { color: colors.text, fontSize: 14, lineHeight: 19 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 17 }, bottleSummary: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "600" }, fresh: { color: colors.success, fontSize: 11, fontWeight: "700" }, stale: { color: colors.muted, fontSize: 11, fontWeight: "700" }, priority: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }, smallButton: { minHeight: 44, minWidth: 84, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, smallButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent }, smallButtonText: { color: colors.accent, fontSize: 12, fontWeight: "800" }, smallButtonTextPrimary: { color: colors.background },
  compactRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 2, paddingVertical: 7 }, input: { minHeight: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minWidth: 46, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }, chipSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, chipText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, chipTextSelected: { color: colors.accent },
  choiceRow: { flexDirection: "row", gap: 8 }, choice: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10 }, choiceSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }, choiceTextSelected: { color: colors.accent },
  modalScreen: { flex: 1, backgroundColor: colors.background }, modalKeyboard: { flex: 1 }, modalHeader: { minHeight: 70, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, modalTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800", flexShrink: 1 }, modalBody: { flex: 1, paddingHorizontal: 18, paddingTop: 12, gap: 10 }, resultsList: { flex: 1 }, resultsContent: { gap: 8, paddingBottom: 14 }, levelScroller: { flexGrow: 0, maxHeight: 46, flexShrink: 0 }, levelRow: { gap: 8, paddingVertical: 1 }, levelChip: { minHeight: 44, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pinnedActions: { minHeight: 62, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  toggleRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, textActionButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 2 }, textAction: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }, dangerAction: { color: colors.danger }, quietAction: { color: colors.muted }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, phoneSummary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, locationChoices: { gap: 9, paddingTop: 4 }, undoRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 }, manageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 }, areaEditor: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }, areaRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7 }, areaRowSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, areaRowText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" }, areaSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 15 }, scopeGuidance: { color: colors.muted, fontSize: 11, lineHeight: 15, paddingHorizontal: 2 }, areaState: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 }, areaStateSelected: { color: colors.accent }, selectedOverflow: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", paddingVertical: 4 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.65 },
});

import { useBottleCatalog } from "../../../src/hooks/useBottleCatalog";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { GeographySearchResponse, MemberAlert, MemberPreferences, MemberPreferencesPatch, MemberProfile, MonitoringScope, MonitoringScopeType, PushDeviceStatus, RadarBottleOption } from "../../../src/api/types";
import { MobileApiError } from "../../../src/api/client";
import { ErrorState, LoadingState, MemberCard, OpenSection, PageHeading, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { useAccessibleStatus } from '../../../src/hooks/useAccessibleStatus';
import { canonicalBottleKey } from "../../../src/interactions/member-interactions";
import { ALERT_RARITY_TIERS, compactWatchedBottles, monitoringScopesChanged, presentPushIssue, radarLocalityDisplayName, scopesForState, bottleWatchMutation, setStatewideScope, stopMonitoringState, toggleAlertRarity, toggleMonitoringScope, watchedBottleCount } from "../../../src/radar/radar-preferences";
import { radarPushState, type PushRecoveryAction } from "../../../src/radar/radar-push-state";
import { disableRadarPush, enableRadarPush, radarPushDeviceId, radarPushPermission, refreshRadarPushIfEnabled, watchRadarPushToken } from "../../../src/push/push-registration";
import { signalRouteForRequestedAlert } from "../../../src/push/push-navigation";
import { colors, typeScale, fonts, layout, typography } from "../../../src/theme";

import { partitionRadarAlerts, radarLocationSummary, radarSetupNeeded, radarSetupStatus } from "../../../src/radar/radar-presentation";
import { RadarAlertRow } from "../../../src/radar/RadarAlertRow";
import { MutedBottles, type MuteBottle } from "../../../src/radar/MutedBottles";

type RadarView = "matches" | "settings";
const VIEWS: Array<{ key: RadarView; label: string }> = [{ key: "matches", label: "Alerts" }, { key: "settings", label: "Alert preferences" }];

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
  const screenInsets = useSafeAreaInsets();
  const screenScroll = useRef<ScrollView>(null);
  const api = useMobileApi();
  const router = useRouter();
  const { section: requestedSection, alert: requestedAlert, request } = useLocalSearchParams<{ section?: string; alert?: string; request?: string }>();
  const [view, setView] = useState<RadarView>("matches");
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [alerts, setAlerts] = useState<{ alerts: MemberAlert[]; unreadCount: number }>({ alerts: [], unreadCount: 0 });
  const bottleCatalog = useBottleCatalog();
  const [sectionError, setSectionError] = useState("");
  const [alertsLoadFailed, setAlertsLoadFailed] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushDeviceStatus | null>(null);
  const [pushPermission, setPushPermission] = useState("undetermined");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushStage, setPushStage] = useState("");
  const [pushStatusLoadFailed, setPushStatusLoadFailed] = useState(false);
  const [pushFailedAction, setPushFailedAction] = useState<"enable" | "disable" | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [undoMute, setUndoMute] = useState<{ bottle: MuteBottle; muted: boolean } | null>(null);
  useEffect(() => { if (!undoMute) return; const timer = setTimeout(() => setUndoMute(null), 8000); return () => clearTimeout(timer); }, [undoMute]);
  const loadSequence = useRef(0);
  const writeSequence = useRef(0);
  const mutationBusy = useRef(false);
  const preferenceMutationEpoch = useRef(0);
  const handledPushRequests = useRef(new Set<string>());
  const [pushLookupRetry, setPushLookupRetry] = useState(0);
  const [openedNotificationAlert, setOpenedNotificationAlert] = useState<MemberAlert | null>(null);
  const initialDestinationChosen = useRef(false);
  const [focusNotifications, setFocusNotifications] = useState(false);
  const preferencesY = useRef(0);
  useAccessibleStatus(actionError || error || saveNotice);
  useEffect(() => { if (!saveNotice) return; const timer = setTimeout(() => setSaveNotice(""), 3000); return () => clearTimeout(timer); }, [saveNotice]);

  const load = useCallback(async (fresh = false) => {
    const sequence = ++loadSequence.current;
    const preferenceMutationAtStart = preferenceMutationEpoch.current;
    setLoading(true); setError("");
    try {
      const results = await Promise.allSettled([
        api.getMemberPreferences({ fresh }).then(value => { if (sequence === loadSequence.current && preferenceMutationAtStart === preferenceMutationEpoch.current) setPreferences(value); return value; }),
        api.getMemberAlerts({ fresh }).then(value => { if (sequence === loadSequence.current) setAlerts(value); return value; }),
        api.getMemberProfile({ fresh }).then(value => { if (sequence === loadSequence.current) setProfile(value); return value; }),
      ]);
      if (sequence !== loadSequence.current) return;
      setAlertsLoadFailed(results[1].status === "rejected");
      setSectionError([results[1].status === "rejected" ? "Alerts couldn’t refresh." : "", results[2].status === "rejected" ? "Membership details couldn’t refresh." : ""].filter(Boolean).join(" "));
      let nextPreferences = results[0].status === "fulfilled" ? results[0].value : null;
      if (!nextPreferences) setError("Alert preferences couldn’t refresh. Try again.");
      if (sequence !== loadSequence.current) return;
      if (nextPreferences && preferenceMutationAtStart === preferenceMutationEpoch.current) {
        if (!nextPreferences.notificationPreferences.onSite.enabled) {
          nextPreferences = await api.updateMemberPreferences({ notificationPreferences: { onSite: { enabled: true } } });
          if (sequence !== loadSequence.current || preferenceMutationAtStart !== preferenceMutationEpoch.current) return;
        }
        setPreferences(nextPreferences);
      }
      if (nextPreferences && !initialDestinationChosen.current) {
        initialDestinationChosen.current = true;
        if (requestedSection !== "matches" && radarSetupNeeded(nextPreferences)) setView("settings");
      }
      setLoading(false);
      setPushError(""); setPushFailedAction(null);
      try {
        const [deviceId, permission] = await Promise.all([radarPushDeviceId(), radarPushPermission().catch(() => "undetermined")]);
        const nextPush = await api.getPushDeviceStatus(deviceId, { fresh });
        if (sequence !== loadSequence.current) return;
        const refreshedPush = await refreshRadarPushIfEnabled(api, nextPush).catch(() => null);
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
  }, [api, requestedSection]);

  useEffect(() => () => { loadSequence.current += 1; }, [api]);
  useScreenRevalidation(() => load());
  useEffect(() => { if (requestedSection === "settings") setView("settings"); }, [requestedSection, request]);
  useEffect(() => { if (requestedSection === "matches" && request) { setView("matches"); void load(true); } }, [load, requestedSection, request]);
  useEffect(() => {
    if (!request || !requestedAlert || handledPushRequests.current.has(request)) return;
    let active = true;
    setActionError("");
    setOpenedNotificationAlert(null);
    void api.getMemberAlerts({ fresh: true, alertId: requestedAlert }).then(value => {
      if (!active) return;
      setAlerts(value);
      const route = signalRouteForRequestedAlert(value.alerts, requestedAlert);
      const opened = value.alerts.find(alert => alert.id === requestedAlert);
      if (route) router.push(route);
      else if (opened) { setOpenedNotificationAlert(opened); screenScroll.current?.scrollTo({ y: 0, animated: false }); }
      else { setActionError("This alert is no longer available. Your latest alerts are below."); return; }
      handledPushRequests.current.add(request);
    }).catch(() => { if (active) setActionError("This alert couldn’t open. Pull down to try again."); });
    return () => { active = false; };
  }, [api, request, requestedAlert, router, pushLookupRetry]);
  useEffect(() => {
    let active = true;
    const subscription = watchRadarPushToken(api, (status) => { if (active && status) { setPushStatus(status); setPushStatusLoadFailed(false); setPushError(status.warning ? presentPushIssue(status.warning, "Push settings are syncing.").message : ""); if (!status.warning) setPushFailedAction(null); } });
    return () => { active = false; subscription.remove(); };
  }, [api]);
  const watchedKeys = useMemo(() => new Set((preferences?.bottleAlertPreferences.bottleKeys || []).map(canonicalBottleKey)), [preferences]);
  const watchedNames = preferences?.bottleAlertPreferences.bottleNames || [];
  const searchResults = useMemo(() => bottleCatalog.search(query, 30), [bottleCatalog.search, query]);
  const activeAlerts = alerts.alerts.filter((alert) => !alert.archivedAt && alert.id !== openedNotificationAlert?.id);
  const pushPresentation = radarPushState({ status: pushStatus, permission: pushPermission, preferenceEnabled: Boolean(preferences?.notificationPreferences.push.enabled), error: pushError, statusLoadFailed: pushStatusLoadFailed, failedAction: pushFailedAction });
  const pushReadiness = pushPresentation.readiness;
  const pushRecoveryAction: PushRecoveryAction = pushPresentation.action;

  async function savePreferences(patch: MemberPreferencesPatch) {
    if (!preferences || saving || pushBusy || mutationBusy.current) return null;
    mutationBusy.current = true;
    const sequence = ++writeSequence.current;
    preferenceMutationEpoch.current += 1;
    setSaving(true); setActionError(""); setSaveNotice("");
    try {
      const saved = await api.updateMemberPreferences(patch);
      if (sequence === writeSequence.current) {
        setPreferences(saved);
        setSaveNotice("Saved");
      }
      return saved;
    } catch (caught) {
      if (sequence === writeSequence.current) setActionError(caught instanceof MobileApiError && caught.status === 400 ? caught.message : "Radar settings could not be saved. Try again.");
      return null;
    } finally {
      mutationBusy.current = false;
      preferenceMutationEpoch.current += 1;
      if (sequence === writeSequence.current) setSaving(false);
    }
  }

  async function setWatching(name: string, watched: boolean, preserveAlertMode = false) {
    if (!preferences) return null;
    const muted = mutedBottleForName(name);
    if (watched && muted) {
      const allow = await new Promise<boolean>(resolve => Alert.alert("This bottle is muted", "Allow alerts before watching this bottle?", [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Allow and watch", onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
      if (!allow || !await changeMute(muted, false)) return null;
    }
    try {
      return await savePreferences({ watchlistMutation: bottleWatchMutation(name, watched), ...(watched && !preserveAlertMode ? { alertMode: "specific_bottles" as const } : {}) });
    } catch { setActionError("This watch could not be changed. Try again."); return null; }
  }

  function mutedBottleForName(name: string) {
    const key = canonicalBottleKey(name);
    const catalogBottle = bottleCatalog.catalog.find(b => [b.name, ...(b.aliases || [])].some(n => canonicalBottleKey(n) === key));
    return preferences?.mutedBottles?.bottles.find(b => b.bottleId && catalogBottle ? b.bottleId === catalogBottle.id : canonicalBottleKey(b.bottleName) === key);
  }
  async function changeMute(bottle: MuteBottle, muted: boolean, offerUndo = true) {
    const saved = await savePreferences({ bottleMuteMutation: { ...bottle, muted } });
    if (!saved) return false;
    setSaveNotice(muted ? `Alerts stopped for ${bottle.bottleName}` : `Alerts allowed for ${bottle.bottleName}`);
    if (offerUndo) setUndoMute({ bottle, muted }); else setUndoMute(null);
    return true;
  }
  async function muteAlertBottle(name: string, muted: boolean) {
    const bottle = bottleCatalog.catalog.find(b => canonicalBottleKey(b.name) === canonicalBottleKey(name) || b.aliases?.some(n => canonicalBottleKey(n) === canonicalBottleKey(name)));
    return changeMute(mutedBottleForName(name) || { bottleName: name, ...(bottle ? { bottleId: bottle.id } : {}) }, muted);
  }

  async function mutateAlert(action: "mark_read" | "mark_all_read" | "archive", alertId?: string | string[]) {
    if (saving || pushBusy || mutationBusy.current) return;
    mutationBusy.current = true;
    setSaving(true); setActionError("");
    try { for (const id of Array.isArray(alertId) ? alertId : [alertId]) setAlerts(await api.updateMemberAlert(action, id)); }
    catch { setActionError("This match could not be updated. Try again."); }
    finally { mutationBusy.current = false; setSaving(false); }
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

  if (loading && !preferences) return <View style={[memberScreenStyles.screen, { paddingTop: screenInsets.top }]}><LoadingState label="Loading your Radar…" /></View>;
  if (error && !preferences) return <View style={[memberScreenStyles.screen, memberScreenStyles.content, { paddingTop: screenInsets.top + 16 }]}><ErrorState message={error} onRetry={() => void load(true)} /></View>;
  if (!preferences) return null;

  const setupStatus=radarSetupStatus(preferences,pushReadiness);
  return <ScrollView
    ref={screenScroll}
    automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    contentContainerStyle={[memberScreenStyles.content, { paddingTop: screenInsets.top + 16 }]}
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setPushLookupRetry(value => value + 1); void load(true); }} tintColor={colors.accent} />}
    style={memberScreenStyles.screen}
  >
    <PageHeading title="Radar" eyebrow="Your bottle intelligence" />
    <View accessibilityRole="tablist" style={styles.tabs}>{VIEWS.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === item.key }} key={item.key} onPress={() => { Keyboard.dismiss(); setView(item.key); setFocusNotifications(false); screenScroll.current?.scrollTo({ y: 0, animated: false }); }} style={[styles.tab, view === item.key && styles.tabSelected]}><Text style={[styles.tabText, view === item.key && styles.tabTextSelected]}>{item.label}</Text></Pressable>)}</View>
    {view === "settings" ? <View style={styles.setupSummary}><View style={styles.signalMarker} /><View style={styles.flex}><Text style={styles.cardTitle}>{setupStatus.title}</Text><Text style={styles.muted}>{setupStatus.detail}</Text></View></View> : null}
    {view === "matches" && pushReadiness === "Setup needed" ? <View style={styles.compactNotice}>
      <Text style={[styles.noticeText, styles.flex]}>Phone notifications need attention</Text>
      <TextAction label="FIX" onPress={() => { setFocusNotifications(true); setView("settings"); screenScroll.current?.scrollTo({ y: 0, animated: false }); }} />
    </View> : null}
    {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
    {sectionError ? <ErrorState message={sectionError} onRetry={() => void load(true)} /> : null}
    {view === "settings" && bottleCatalog.error ? <ErrorState message={bottleCatalog.error} onRetry={bottleCatalog.retry} /> : null}
    {saveNotice ? <Text accessibilityLiveRegion="polite" style={styles.fresh}>{saveNotice}</Text> : null}
    {undoMute ? <View style={styles.undoRow}><Text style={[styles.muted, styles.flex]}>{undoMute.muted ? "Bottle muted" : "Bottle unmuted"}</Text><TextAction label="UNDO" disabled={saving || pushBusy} onPress={() => void changeMute(undoMute.bottle, !undoMute.muted, false)} /></View> : null}
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
    {view === "matches" && openedNotificationAlert ? <View>
      <SectionTitle>Opened alert</SectionTitle>
      <Text style={styles.muted}>This is the report from your notification. Its original Signal detail is no longer available.</Text>
      <AlertCard alert={openedNotificationAlert} saving={saving} watchedNames={watchedNames} onMute={muteAlertBottle} isMuted={name => Boolean(mutedBottleForName(name))} />
    </View> : null}

    {view === "matches" && (!alertsLoadFailed || activeAlerts.length > 0) ? <MatchesView alerts={activeAlerts} saving={saving} watchedNames={watchedNames} onMutate={mutateAlert} onMute={muteAlertBottle} isMuted={name => Boolean(mutedBottleForName(name))} setupNeeded={radarSetupNeeded(preferences)} onOpenWatchlist={() => setView("settings")} /> : null}
    {view === "settings" ? <WatchlistView
      onNotificationsLayout={(y) => { if (focusNotifications) { screenScroll.current?.scrollTo({ y: preferencesY.current + y, animated: true }); setFocusNotifications(false); } }}
      pushRecoveryAction={pushRecoveryAction}
      pushNeedsAttention={pushReadiness === "Setup needed"}
      onRecoverPush={() => { if (pushRecoveryAction === "settings") void Linking.openSettings().catch(() => setActionError("Open your phone Settings to allow notifications for Bourbon Signal.")); else if (pushRecoveryAction === "retry-status") void load(true); else if (pushRecoveryAction === "retry-disable") void togglePush(false); else void togglePush(true); }}
      onLayout={(y) => { preferencesY.current = y; }}
      catalog={searchResults}
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
      onQuery={setQuery}
      onSave={savePreferences}
      onSetWatching={setWatching}
      onTogglePush={togglePush}
    /> : null}
    {view === "settings" ? <MutedBottles state={preferences.mutedBottles} saving={saving || pushBusy} search={bottleCatalog.search} onChange={changeMute} /> : null}
  </ScrollView>;
}

function MatchesView({ alerts, saving, watchedNames, setupNeeded, onMutate, onOpenWatchlist, onMute, isMuted }: { alerts: MemberAlert[]; saving: boolean; watchedNames: string[]; setupNeeded: boolean; onMutate: (action: "mark_read" | "mark_all_read" | "archive", alertId?: string | string[]) => Promise<void>; onOpenWatchlist: () => void; onMute: (name: string, muted: boolean) => Promise<boolean>; isMuted: (name: string) => boolean }) {
  const [showPast, setShowPast] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const { current, history: past } = partitionRadarAlerts(alerts, now);
  return <View style={styles.section}>
    {current.some(alert => !alert.readAt) ? <TextAction label="MARK READ" disabled={saving} onPress={() => void onMutate("mark_read", current.filter(item => !item.readAt).map(item => item.id))} /> : null}
    {!current.length ? <View style={styles.emptyAlerts}>
      <Text style={styles.emptyTitle}>{setupNeeded ? "Set up your alerts" : "No recent alerts"}</Text>
      {setupNeeded ? <SmallButton primary label="Choose preferences" onPress={onOpenWatchlist} /> : null}
    </View> : null}
    {current.map((alert) => <AlertCard alert={alert} key={alert.id} saving={saving} watchedNames={watchedNames} onMutate={onMutate} onMute={onMute} isMuted={isMuted} />)}
    {past.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPast }} onPress={() => setShowPast(value => !value)} style={styles.historyRow}>
      <Text style={styles.listTitle}>Past alerts ({past.length})</Text><Text style={styles.chevron}>{showPast ? "−" : "+"}</Text>
    </Pressable> : null}
    {showPast ? past.map((alert) => <AlertCard alert={alert} key={alert.id} saving={saving} watchedNames={watchedNames} onMutate={onMutate} onMute={onMute} isMuted={isMuted} />) : null}
  </View>;
}

function AlertCard(props: React.ComponentProps<typeof RadarAlertRow>) {
  return <RadarAlertRow {...props} />;
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

function WatchlistView({ pushNeedsAttention, pushRecoveryAction, onRecoverPush, onLayout, onNotificationsLayout, catalog, preferences, profile, pushBusy, pushError, pushPermission, pushStage, pushStatus, query, saving, watchedKeys, watchedNames, onQuery, onSave, onSetWatching, onTogglePush }: { pushNeedsAttention: boolean; pushRecoveryAction: PushRecoveryAction; onRecoverPush: () => void; onLayout: (y: number) => void; onNotificationsLayout: (y: number) => void; catalog: RadarBottleOption[]; preferences: MemberPreferences; profile: MemberProfile | null; pushBusy: boolean; pushError: string; pushPermission: string; pushStage: string; pushStatus: PushDeviceStatus | null; query: string; saving: boolean; watchedKeys: Set<string>; watchedNames: string[]; onQuery: (value: string) => void; onSave: (patch: MemberPreferencesPatch) => Promise<MemberPreferences | null>; onSetWatching: (name: string, watched: boolean, preserveAlertMode?: boolean) => Promise<MemberPreferences | null>; onTogglePush: (enabled: boolean) => Promise<void> }) {
  const router = useRouter();
  const api = useMobileApi();
  const insets = useSafeAreaInsets();
  const [showTierHelp, setShowTierHelp] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [editorState, setEditorState] = useState<{ code: string; name: string } | null>(null);
  const [scopeMode, setScopeMode] = useState<"state" | "local" | null>(null);
  const [addingState, setAddingState] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
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
    if (!editorState || scopeMode !== "local" || editorLevel === "state") return;
    let active = true;
    const timer = setTimeout(() => {
      setAreaBusy(true); setAreaError("");
      void api.searchMonitoringGeography({ state: editorState.code, levels: [editorLevel], query: areaQuery, limit: 25, offset: areaOffset, fresh: true })
        .then((page) => { if (active) { setAreaPage((current) => areaOffset ? [...current, ...page.results] : page.results); setAreaHasMore(page.hasMore); } })
        .catch(() => { if (active) setAreaError("Local geography is temporarily unavailable. Try again."); })
        .finally(() => { if (active) setAreaBusy(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [api, areaOffset, areaQuery, editorLevel, editorState, scopeMode]);

  function openEditor(state: { code: string; label: string }) {
    const current = scopesForState(preferences.monitoringScopes, state.code);
    setEditorState({ code: state.code, name: state.label });
    setDraftScopes(current);
    setScopeMode(current.some(scope => scope.type === "state") ? "state" : current.length ? "local" : null);
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

  const pushDetail = pushBusy ? pushStage : pushNeedsAttention
    ? pushRecoveryAction === "settings" ? "Permission blocked"
      : pushRecoveryAction === "retry-status" ? "Status unavailable"
        : pushStatus?.warning?.code === "PUSH_PREFERENCE_WRITE_FAILED" ? "Settings sync incomplete"
          : pushRecoveryAction === "retry-disable" ? "Could not turn off" : "Connection failed"
    : pushStatus?.enabled && pushPermission === "granted" ? "On" : "Off";
  const selectedInEditor = editorState ? scopesForState(draftScopes, editorState.code) : [];
  const editorHasChanges = Boolean(editorState && monitoringScopesChanged(preferences.monitoringScopes, selectedInEditor, editorState.code));
  const selectedRows = selectedInEditor.filter(scope => scope.type !== "state" && (!areaQuery.trim() || scope.label.toLowerCase().includes(areaQuery.trim().toLowerCase()))).map(scope => ({ id: scope.id, level: scope.type, state: scope.state, name: scope.label }));
  const visibleRows = [...selectedRows, ...areaPage.filter(row => !selectedRows.some(scope => scope.id === row.id))];
  const savedStates = [...new Set(preferences.monitoringScopes.map(scope => scope.state))].map(code => ({ code, label: states.find(state => state.code === code)?.label || code }));
  const stateSummary = (code: string) => { const scopes = scopesForState(preferences.monitoringScopes, code); return scopes.some(scope => scope.type === "state") ? "Entire state" : `${scopes.length} area${scopes.length === 1 ? "" : "s"}`; };
  const locationLabel = savedStates.length === 1 ? `${savedStates[0].label} · ${stateSummary(savedStates[0].code)}` : radarLocationSummary(preferences);
  const availableStates = states.filter(state => !savedStates.some(saved => saved.code === state.code) && `${state.label} ${state.code}`.toLowerCase().includes(stateQuery.trim().toLowerCase()));
  const levels: MonitoringScopeType[] = editorState?.code === "NC" ? ["county", "board", "city", "store"] : ["county", "city", "store"];
  const compactStateChoice = Boolean(editorState && scopeMode !== "local");
  const lowCoverage = Boolean(editorState && states.find((state) => state.code === editorState.code)?.engineCoverage !== "active");

  if (preferences.entitlements?.alertAreaLimit === 0) return <MemberCard>
    <Text style={styles.listTitle}>Want alerts when bottles are found in your area?</Text>
    <TextAction label="Upgrade your membership →" onPress={() => router.push("/(app)/account/membership")} />
  </MemberCard>;

  return <View onLayout={(event) => onLayout(event.nativeEvent.layout.y)} style={styles.preferences}>
    <View style={styles.section}>
    <SectionTitle>Bottles</SectionTitle>
    <View style={styles.choiceRow}><Choice disabled={saving} selected={preferences.alertMode === "specific_bottles"} label="Specific bottles" onPress={() => void onSave({ alertMode: "specific_bottles" })} /><Choice disabled={saving} selected={preferences.alertMode === "anything_notable"} label="Discover rare bottles" onPress={() => void onSave({ alertMode: "anything_notable" })} /></View>
    <Text style={styles.muted}>{preferences.alertMode === "anything_notable" ? "Any bottle in your selected tiers." : "Your bottle list and selected tiers must both match."}</Text>
    {preferences.alertMode === "specific_bottles" ? <BottleWatchlist catalog={catalog} preferences={preferences} query={query} saving={saving} watchedKeys={watchedKeys} watchedNames={watchedNames} onQuery={onQuery} onSetWatching={onSetWatching} /> : null}
    <View style={styles.headingRow}><SectionTitle>Bottle tiers</SectionTitle><Pressable accessibilityRole="button" accessibilityLabel="About bottle tiers" accessibilityState={{ expanded: showTierHelp }} onPress={() => setShowTierHelp(value => !value)} style={styles.infoButton}><Text style={styles.chipText}>ⓘ</Text></Pressable></View>
    <View style={styles.choiceRow}>{ALERT_RARITY_TIERS.map((tier) => <RarityChoice disabled={saving} key={tier} label={tier[0].toUpperCase() + tier.slice(1)} selected={preferences.notificationPreferences.rarityTiers.includes(tier)} onPress={() => void onSave({ notificationPreferences: { rarityTiers: toggleAlertRarity(preferences.notificationPreferences.rarityTiers, tier) } })} />)}</View>

    {showTierHelp ? <Text style={styles.muted}>Unicorn · exceptionally hard to find{"\n"}Allocated · distributed in restricted quantities{"\n"}Limited · limited releases</Text> : null}
    </View>
    <View style={styles.section}>
      <SectionTitle>Locations</SectionTitle>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit locations, ${locationLabel}`} disabled={saving} onPress={() => { Keyboard.dismiss(); setAddingState(false); setStateQuery(""); setLocationsOpen(true); }} style={styles.locationSummary}>
        <Text style={[styles.listTitle, styles.flex]}>{locationLabel}</Text><Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
    <View onLayout={(event) => onNotificationsLayout(event.nativeEvent.layout.y)} style={styles.section}>
    <SectionTitle>Notifications</SectionTitle>
    <OpenSection>
      {pushNeedsAttention ? <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.listTitle}>Phone alerts</Text><Text style={styles.muted}>{pushDetail}</Text></View><TextAction label={pushBusy ? "WORKING…" : pushRecoveryAction === "settings" ? "OPEN SETTINGS" : "RETRY"} disabled={saving || pushBusy} onPress={onRecoverPush} /></View>
        : <ToggleRow label="Phone alerts" detail={pushDetail} disabled={saving || pushBusy} value={Boolean(pushStatus?.enabled && pushStatus.currentDeviceRegistered !== false && pushPermission === "granted" && !pushError)} onValueChange={(value) => void onTogglePush(value)} />}
      <ToggleRow label="Community sightings" detail="Member sightings in your watched areas" disabled={saving} value={preferences.notificationPreferences.sightings.enabled} onValueChange={(enabled) => void onSave({ notificationPreferences: { sightings: { enabled } } })} />
    </OpenSection>

    </View>

    <Modal key={compactStateChoice ? "state-choice" : "locations"} animationType="slide" onRequestClose={() => { setEditorState(null); setLocationsOpen(false); }} transparent={compactStateChoice} presentationStyle={compactStateChoice ? "overFullScreen" : "fullScreen"} visible={locationsOpen || Boolean(editorState)}>
      <View style={compactStateChoice ? styles.sheetBackdrop : styles.modalScreen}>
      <SafeAreaView edges={["bottom"]} style={compactStateChoice ? styles.choiceSheet : [styles.modalScreen, { paddingTop: Math.max(insets.top, 12) }]}>
        {!editorState ? <View style={styles.modalKeyboard}>
          <View style={styles.modalHeader}><Text style={[styles.modalTitle, styles.flex]}>Locations</Text><TextAction label="CLOSE" onPress={() => setLocationsOpen(false)} /></View>
          <ScrollView contentContainerStyle={styles.stateList} keyboardShouldPersistTaps="handled">
            {savedStates.map(state => <Pressable accessibilityRole="button" accessibilityLabel={`${state.label}, ${stateSummary(state.code)}`} key={state.code} onPress={() => openEditor(state)} style={styles.locationSummary}><View style={styles.flex}><Text style={styles.listTitle}>{state.label}</Text><Text style={styles.muted}>{stateSummary(state.code)}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
            {!addingState ? <TextAction label="ADD A STATE" onPress={() => setAddingState(true)} /> : <>
              <TextInput accessibilityLabel="Search states" placeholder="Search states" placeholderTextColor={colors.muted} style={styles.input} value={stateQuery} onChangeText={setStateQuery} autoCorrect={false} />
              {availableStates.map(state => <Pressable accessibilityRole="button" key={state.code} onPress={() => openEditor(state)} style={styles.areaRow}><Text style={styles.areaRowText}>{state.label}</Text><Text style={styles.chevron}>›</Text></Pressable>)}
              {!availableStates.length ? <Text style={styles.muted}>No states found</Text> : null}
            </>}
          </ScrollView>
        </View> : <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={compactStateChoice ? undefined : styles.modalKeyboard}>
          <View style={styles.modalHeader}><View style={styles.flex}><Text style={styles.modalTitle}>{editorState?.name}</Text></View><TextAction label="CANCEL" onPress={() => setEditorState(null)} /></View>
          <View style={compactStateChoice ? styles.choiceSheetBody : styles.modalBody}>
            <View style={styles.choiceRow}><Choice label="Entire state" selected={scopeMode === "state"} onPress={() => { setScopeMode("state"); if (editorState) setDraftScopes(setStatewideScope(draftScopes, editorState)); }} /><Choice label="Specific areas" selected={scopeMode === "local"} onPress={() => { setScopeMode("local"); setDraftScopes(scopes => scopes.filter(scope => scope.type !== "state")); }} /></View>
            {scopeMode === "local" ? <Text style={styles.muted}>{selectedInEditor.length} selected{editorState?.code === "NC" && editorLevel === "board" ? " · Choose your local ABC board by county or town." : ""}</Text> : null}
            {scopeMode === "local" ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.levelScroller} contentContainerStyle={styles.levelRow}>{levels.map((level) => <Pressable key={level} onPress={() => { setEditorLevel(level); setAreaOffset(0); setAreaPage([]); }} style={[styles.levelChip, editorLevel === level && styles.chipSelected]}><Text style={[styles.chipText, editorLevel === level && styles.chipTextSelected]}>{level === "board" ? "ABC area" : `${level[0]?.toUpperCase()}${level.slice(1)}`}</Text></Pressable>)}</ScrollView><TextInput autoCorrect={false} clearButtonMode="while-editing" onChangeText={(value) => { setAreaQuery(value); setAreaOffset(0); setAreaPage([]); }} accessibilityLabel={editorLevel === "board" ? "Search by county, town or ABC board" : `Search ${editorLevel}`} accessibilityHint="Search available monitoring areas." placeholder={editorLevel === "board" ? "County, town or ABC board" : `Search ${editorLevel}`} placeholderTextColor={colors.muted} style={styles.input} value={areaQuery} /></> : null}
            {scopeMode === "local" ? <ScrollView contentContainerStyle={styles.resultsContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.resultsList}>
              {visibleRows.map((row) => { const locality = row.level === "board" ? states.find(state => state.code === row.state)?.options.find(option => option.value === row.name) : undefined; const displayName = "displayName" in row && typeof row.displayName === "string" ? row.displayName : locality?.displayName || locality?.label || (row.level === "city" ? radarLocalityDisplayName(row.name) : row.name); const scope: MonitoringScope = { type: row.level, id: row.id, state: row.state, label: row.name }; const selected = draftScopes.some((item) => item.id === row.id); const subtitle = "subtitle" in row && typeof row.subtitle === "string" ? row.subtitle : locality?.subtitle || ""; const message = "message" in row && typeof row.message === "string" ? row.message : ""; return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={row.id} onPress={() => setDraftScopes(toggleMonitoringScope(draftScopes, scope))} style={[styles.areaRow, selected && styles.areaRowSelected]}><View style={styles.flex}><Text numberOfLines={2} style={styles.areaRowText}>{displayName}</Text>{subtitle ? <Text numberOfLines={3} style={styles.areaSubtitle}>{subtitle}</Text> : null}{message ? <Text numberOfLines={2} style={styles.muted}>{message}</Text> : null}</View><Text style={[styles.areaState, selected && styles.areaStateSelected]}>{selected ? "✓" : "+"}</Text></Pressable>; })}
              {!areaBusy && !visibleRows.length ? <Text style={styles.muted}>No areas found</Text> : null}
              {areaBusy ? <Text style={styles.muted}>Loading geography…</Text> : null}
              {areaHasMore ? <TextAction label="LOAD MORE" onPress={() => setAreaOffset((value) => value + 25)} /> : null}
              {lowCoverage ? <MemberCard><Text style={styles.listTitle}>Help build activity here</Text><Text style={styles.muted}>Bourbon Signal sources are still expanding in this area. Invite friends to boost community activity.</Text><TextAction label="INVITE FRIENDS" onPress={() => void shareInvite().catch(() => setAreaError("Invite is temporarily unavailable. Try again."))} /></MemberCard> : null}
            </ScrollView> : null}
          </View>
          {areaError ? <Text accessibilityRole="alert" style={styles.error}>{areaError}</Text> : null}
          <View style={styles.pinnedActions}><TextAction danger label="STOP MONITORING" disabled={saving || !editorState || !scopesForState(preferences.monitoringScopes, editorState.code).length} onPress={() => void (async () => { if (!editorState) return; const saved = await onSave({ monitoringScopes: stopMonitoringState(preferences.monitoringScopes, editorState.code) }); if (saved) setEditorState(null); else setAreaError("Monitoring could not be stopped. Try again."); })()} /><SmallButton primary label={saving ? "Saving…" : "Save locations"} disabled={saving || !editorState || !selectedInEditor.length} onPress={() => void (async () => { if (!editorState) return; if (!editorHasChanges) { setEditorState(null); return; } const next = [...preferences.monitoringScopes.filter((scope) => scope.state !== editorState.code), ...selectedInEditor]; const saved = await onSave({ monitoringScopes: next }); if (saved) setEditorState(null); else setAreaError("Monitoring areas could not be saved. Try again."); })()} /></View>
        </KeyboardAvoidingView>}
      </SafeAreaView>
      </View>
    </Modal>
  </View>;
}

function ToggleRow({ label, detail, value, disabled, onValueChange }: { label: string; detail?: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.listTitle}>{label}</Text>{detail ? <Text style={styles.muted}>{detail}</Text> : null}</View><Switch accessibilityLabel={label} disabled={disabled} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accentPressed }} thumbColor={value ? colors.accent : colors.muted} value={value} /></View>; }
function Choice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function RarityChoice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityLabel={label} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? "✓ " : ""}{label}</Text></Pressable>; }
function SmallButton({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.smallButton, primary && styles.smallButtonPrimary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.smallButtonText, primary && styles.smallButtonTextPrimary]}>{label}</Text></Pressable>; }
function TextAction({ label, onPress, disabled = false, danger = false, quiet = false, expanded }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; quiet?: boolean; expanded?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={disabled} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.textActionButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.textAction, danger && styles.dangerAction, quiet && styles.quietAction]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  setupSummary: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  signalMarker: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  choiceSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  choiceSheetBody: { padding: 18, gap: 12 },
  infoButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  stateList: { padding: 18, gap: 12 },
  locationSummary: { minHeight: 64, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 },
  compactNotice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface },
  noticeText: { color: colors.accent, fontSize: typeScale.small, lineHeight: 18 },
  emptyAlerts: { minHeight: 60, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 16 },
  emptyTitle: { color: colors.muted, ...typography.section, fontWeight: "600", textAlign: "center" },
  historyRow: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  preferences: { gap: 28 },
  chevron: { color: colors.accent, fontSize: typeScale.title, fontFamily: fonts.heading },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 16 },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" }, tabSelected: { borderBottomColor: colors.accent }, tabText: { color: colors.muted, fontSize: typeScale.small, fontWeight: "700", textAlign: "center" }, tabTextSelected: { color: colors.text },
  section: { gap: 12 }, stack: { gap: 6 }, headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, alertHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, flex: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: typeScale.input, lineHeight: 21, fontWeight: "700", flex: 1 }, listTitle: { color: colors.text, fontSize: typeScale.body, lineHeight: 19, fontWeight: "700" }, location: { color: colors.text, fontSize: typeScale.body, lineHeight: 19 }, muted: { color: colors.muted, fontSize: typeScale.small, lineHeight: 17 }, bottleSummary: { color: colors.accent, fontSize: typeScale.small, lineHeight: 17, fontWeight: "600" }, fresh: { color: colors.success, fontSize: typeScale.caption, fontWeight: "700" }, stale: { color: colors.muted, fontSize: typeScale.caption, fontWeight: "700" }, priority: { color: colors.accent, fontSize: typeScale.caption, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexWrap: "wrap", flexDirection: "row", justifyContent: "flex-end", gap: 8 }, smallButton: { minHeight: layout.controlHeight, minWidth: 84, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: layout.controlRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, smallButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent }, smallButtonText: { color: colors.accent, fontSize: typeScale.small, fontWeight: "800" }, smallButtonTextPrimary: { color: colors.background },
  compactRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 2, paddingVertical: 7 }, input: { minHeight: layout.controlHeight, borderRadius: layout.controlRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: typeScale.input },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minWidth: 46, minHeight: layout.controlHeight, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, borderRadius: layout.controlRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 9 }, chipSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, chipText: { color: colors.muted, fontSize: typeScale.small, fontWeight: "700" }, chipTextSelected: { color: colors.accent },
  choiceRow: { flexDirection: "row", gap: 8 }, choice: { flex: 1, minHeight: layout.controlHeight, alignItems: "center", justifyContent: "center", borderRadius: layout.controlRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9 }, choiceSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, choiceText: { color: colors.muted, fontSize: typeScale.small, fontWeight: "700", textAlign: "center" }, choiceTextSelected: { color: colors.accent },
  modalScreen: { flex: 1, backgroundColor: colors.background }, modalKeyboard: { flex: 1 }, modalHeader: { minHeight: 70, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, modalTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800", flexShrink: 1 }, modalBody: { flex: 1, paddingHorizontal: 18, paddingTop: 12, gap: 10 }, resultsList: { flex: 1 }, resultsContent: { gap: 8, paddingBottom: 14 }, levelScroller: { flexGrow: 0, maxHeight: 56, flexShrink: 0 }, levelRow: { gap: 8, paddingVertical: 1 }, levelChip: { minHeight: layout.controlHeight, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: layout.controlRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pinnedActions: { minHeight: 62, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  toggleRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, textActionButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 2 }, textAction: { color: colors.accent, fontSize: typeScale.caption, fontWeight: "800", letterSpacing: 0.5 }, dangerAction: { color: colors.danger }, quietAction: { color: colors.muted }, error: { color: colors.danger, fontSize: typeScale.small, lineHeight: 18 }, phoneSummary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, locationChoices: { gap: 9, paddingTop: 4 }, undoRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 }, manageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 }, areaEditor: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }, areaRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7 }, areaRowSelected: { borderColor: colors.accentPressed, backgroundColor: "#2A1F13" }, areaRowText: { flex: 1, color: colors.text, fontSize: typeScale.small, lineHeight: 18, fontWeight: "600" }, areaSubtitle: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15 }, scopeGuidance: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15, paddingHorizontal: 2 }, areaState: { color: colors.muted, fontSize: typeScale.micro, fontWeight: "800", letterSpacing: 0.4 }, areaStateSelected: { color: colors.accent }, selectedOverflow: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16, textAlign: "center", paddingVertical: 4 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.65 },
});

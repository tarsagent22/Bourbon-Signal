import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { GeographySearchResponse, MemberPreferences, MemberProfile, MonitoringScope } from "../../src/api/types";
import { ErrorState, LoadingState, PageHeading, memberScreenStyles } from "../../src/components/MemberScreen";
import { useBottleCatalog } from "../../src/hooks/useBottleCatalog";
import { useMobileApi } from "../../src/hooks/useMobileApi";
import { useAccessibleStatus } from "../../src/hooks/useAccessibleStatus";
import { enableRadarPush, radarPushPermission } from "../../src/push/push-registration";
import { bottleWatchMutation, watchedBottleCount } from "../../src/radar/radar-preferences";
import { canonicalBottleKey } from "../../src/interactions/member-interactions";
import { colors, layout, typeScale } from "../../src/theme";

export default function SetupScreen() {
  const { userId } = useAuth();
  return userId ? <MemberSetup key={userId} /> : null;
}

function MemberSetup() {
  const api = useMobileApi();
  const router = useRouter();
  const catalog = useBottleCatalog();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [state, setState] = useState("");
  const [scope, setScope] = useState<MonitoringScope | null>(null);
  const [areaChanged, setAreaChanged] = useState(false);
  const [local, setLocal] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");
  const [areas, setAreas] = useState<GeographySearchResponse["results"]>([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [areaAttempt, setAreaAttempt] = useState(0);
  const [areaHasMore, setAreaHasMore] = useState(false);
  const [areaOffset, setAreaOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mounted = useRef(true);
  const mutation = useRef(false);
  useAccessibleStatus(error || areaError);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const [member, saved] = await Promise.all([api.getMemberProfile({ fresh: true }), api.getMemberPreferences({ fresh: true })]);
      if (!mounted.current) return;
      setProfile(member); setPreferences(saved);
      const home = member.profile.homeState || saved.monitoringScopes[0]?.state || "";
      setState(home);
      const first = saved.monitoringScopes.find(row => row.state === home);
      setScope(first || null); setLocal(Boolean(first && first.type !== "state"));
    } catch { if (mounted.current) setError("Setup couldn’t load. Try again."); }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { void load(); }, [api]);

  useEffect(() => {
    let active = true;
    if (!local || !state || step !== 0) return;
    setAreaLoading(true); setAreaError("");
    const timer = setTimeout(() => {
      void api.searchMonitoringGeography({ state, levels: state === "NC" ? ["board"] : ["city"], query: areaQuery, limit: 20, offset: areaOffset })
        .then(page => { if (active) { setAreas(current => areaOffset ? [...new Map([...current, ...page.results].map(row => [row.id, row])).values()] : page.results); setAreaHasMore(page.hasMore); } })
        .catch(() => { if (active) setAreaError("Areas couldn’t load. Try again."); })
        .finally(() => { if (active) setAreaLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [api, areaAttempt, areaOffset, areaQuery, local, state, step]);

  async function saveArea() {
    if (!preferences || !state || (local && !scope) || mutation.current) return;
    if (!areaChanged && preferences.monitoringScopes.some(row => row.state === state)) { setStep(1); return; }
    mutation.current = true; setBusy(true); setError("");
    const chosen: MonitoringScope = local && scope ? scope : { id: `state:${state}`, state, type: "state", label: profile?.profile.feedAreas.states.find(row => row.code === state)?.label || state };
    try {
      const saved = await api.updateMemberPreferences({ monitoringScopes: [...preferences.monitoringScopes.filter(row => row.state !== state), chosen] });
      if (mounted.current) { setPreferences(saved); setStep(1); }
    } catch { if (mounted.current) setError("Your area couldn’t be saved. Try again."); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function watch(name: string, watched: boolean) {
    if (!preferences || mutation.current) return;
    mutation.current = true; setBusy(true); setError("");
    try {
      const saved = await api.updateMemberPreferences({ watchlistMutation: bottleWatchMutation(name, watched), alertMode: "specific_bottles" });
      if (mounted.current) setPreferences(saved);
    } catch { if (mounted.current) setError("The bottle couldn’t be saved. Check your membership limit and try again."); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function enableAlerts() {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(""); setPermissionDenied(false);
    try {
      const status = await enableRadarPush(api);
      if (!mounted.current) return;
      if (status.enabled && status.currentDeviceRegistered && !status.warning) router.replace("/(app)/(tabs)");
      else setError("Notifications couldn’t finish setting up. Try again or set them up later in Radar.");
    } catch {
      const permission = await radarPushPermission().catch(() => "undetermined");
      if (mounted.current) {
        setPermissionDenied(permission === "denied");
        setError(permission === "denied" ? "Notifications are off in your phone settings. Allow them for Bourbon Signal to receive alerts." : "Notifications couldn’t be enabled. Try again on your phone or set them up later in Radar.");
      }
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  if (loading) return <View style={s.screen}><LoadingState label="Opening setup…" /></View>;
  if (!profile || !preferences) return <View style={s.screen}><ErrorState message={error} onRetry={() => void load()} /></View>;
  const canSetAlerts = preferences.entitlements?.alertAreaLimit !== 0 && preferences.entitlements?.trackedBottleLimit !== 0 && profile.profile.membership.paid;
  const watched = new Set([...preferences.bottleAlertPreferences.bottleKeys, ...preferences.bottleAlertPreferences.bottleNames].map(canonicalBottleKey));
  const count = watchedBottleCount(preferences);
  const limit = preferences.entitlements?.trackedBottleLimit;
  const selectedState = profile.profile.feedAreas.states.find(row => row.code === state);
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {!canSetAlerts ? <>
      <PageHeading title="Your account is ready" description="Browse member sightings or add bottles to your shelf." />
      <Action label="Browse Community" onPress={() => router.replace({ pathname: "/(app)/(tabs)", params: { view: "community" } })} />
      <Action label="Add your first bottle" onPress={() => router.replace("/(app)/cellar/add")} secondary />
      <Text style={s.detail}>Bottle alerts are included with Standard and above.</Text>
      <Action label="View memberships" onPress={() => router.replace({ pathname: "/(app)/account/membership", params: { welcome: "1" } })} secondary />
    </> : <>
      <Text style={s.detail}>Step {step + 1} of 3</Text>
      <PageHeading title={step === 0 ? "Where do you hunt?" : step === 1 ? "Which bottles do you want?" : "Get alerts on your phone"}
        description={step === 0 ? "Choose a state, then your area." : step === 1 ? "Search for bottles and tap Watch. You can change these in Radar." : "We’ll notify you when a report matches your bottles, area, and bottle tiers."} />
      {step === 0 ? <>
        <ScrollView horizontal contentContainerStyle={s.states} keyboardShouldPersistTaps="handled">
          {profile.profile.feedAreas.states.map(row => <Pressable key={row.code} accessibilityRole="radio" accessibilityLabel={row.label} accessibilityState={{ checked: state === row.code }} disabled={busy} onPress={() => { setAreaChanged(true); setState(row.code); setScope(null); setAreaOffset(0); setAreas([]); setAreaQuery(""); }} style={[s.choice, state === row.code && s.chosen]}><Text style={s.text}>{row.code}</Text></Pressable>)}
        </ScrollView>
        {selectedState?.engineCoverage === "expanding" ? <Text style={s.detail}>Reports in {selectedState.label} are limited while coverage expands.</Text> : null}
        {state ? <View style={s.states}><Action label="Entire state" secondary disabled={busy} selected={!local} onPress={() => { setAreaChanged(true); setLocal(false); setScope(null); }} /><Action label={state === "NC" ? "Choose a board" : "Choose a city"} secondary disabled={busy} selected={local} onPress={() => { setAreaChanged(true); setLocal(true); setScope(null); setAreaOffset(0); }} /></View> : null}
        {local && state ? <>
          {scope ? <Text style={s.detail}>Selected area: {scope.label}</Text> : null}
          <TextInput accessibilityLabel="Search areas" placeholder={state === "NC" ? "Search boards" : "Search cities"} placeholderTextColor={colors.muted} value={areaQuery} onChangeText={value => { setAreaQuery(value); setAreaOffset(0); setAreas([]); }} style={s.input} />
          {areas.map(row => <Pressable accessibilityRole="radio" accessibilityState={{ checked: scope?.id === row.id }} key={row.id} disabled={busy} onPress={() => { setAreaChanged(true); setScope({ id: row.id, state: row.state, type: row.level, label: row.name }); }} style={[s.row, scope?.id === row.id && s.chosen]}><Text style={s.text}>{row.name}</Text></Pressable>)}
          {areaLoading ? <ActivityIndicator color={colors.accent} /> : areaError ? <ErrorState message={areaError} onRetry={() => setAreaAttempt(value => value + 1)} /> : !areas.length ? <Text style={s.detail}>No areas match. Try another name or choose the entire state.</Text> : null}
          {areaHasMore && !areaLoading ? <Action label="More areas" secondary onPress={() => setAreaOffset(areas.length)} /> : null}
        </> : null}
      </> : step === 1 ? <>
        <TextInput accessibilityLabel="Search bottles to watch" autoCorrect={false} placeholder="Search bottles" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={s.input} />
        <Text style={s.detail}>{count} watched{typeof limit === "number" ? ` · ${limit} included` : ""}</Text>
        {catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.retry} /> : null}
        {(query.trim() ? catalog.search(query, 8) : catalog.catalog.filter(row => watched.has(canonicalBottleKey(row.name)))).map(row => {
          const isWatched = watched.has(canonicalBottleKey(row.name));
          return <View key={row.id} style={s.row}><Text style={[s.text, s.flex]}>{row.name}</Text><Action label={isWatched ? "Remove" : "Watch"} secondary disabled={busy || (!isWatched && typeof limit === "number" && count >= limit)} onPress={() => void watch(row.name, !isWatched)} /></View>;
        })}
        {query.trim() && !catalog.search(query, 8).length ? <Text style={s.detail}>No bottles match. Try another name.</Text> : !query.trim() && !count ? <Text style={s.detail}>Search above to watch your first bottle.</Text> : null}
      </> : <Text style={s.detail}>Your phone will ask for permission. You can change this in Radar.</Text>}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {permissionDenied ? <Action label="Open phone settings" secondary onPress={() => { void Linking.openSettings().catch(() => setError("Open your phone Settings and allow notifications for Bourbon Signal.")); }} /> : null}
      <Action label={busy ? "Saving…" : step === 2 ? "Enable notifications" : "Continue"} disabled={busy || (step === 0 && (!state || (local && !scope))) || (step === 1 && !count)} onPress={() => { if (step === 0) void saveArea(); else if (step === 1) setStep(2); else void enableAlerts(); }} />
      {step > 0 ? <Action label="Back" secondary disabled={busy} onPress={() => { setError(""); setStep(step === 2 ? 1 : 0); if (step === 1) setAreaOffset(0); }} /> : null}
      <Action label="Set up later" secondary disabled={busy} onPress={() => router.replace("/(app)/(tabs)")} />
    </>}
  </ScrollView>;
}
function Action({ label, onPress, disabled = false, secondary = false, selected = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, secondary && s.secondary, selected && s.chosen, disabled && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}><Text style={[s.actionText, secondary && s.text]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  screen: { ...memberScreenStyles.screen }, content: { ...memberScreenStyles.content, paddingTop: 24, gap: 16 },
  detail: { color: colors.muted, fontSize: typeScale.body, lineHeight: 21 }, text: { color: colors.text, fontSize: typeScale.body }, flex: { flex: 1 },
  states: { flexDirection: "row", gap: 8, paddingVertical: 4 }, choice: { minHeight: 48, minWidth: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: layout.controlRadius, justifyContent: "center", alignItems: "center" },
  chosen: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised }, row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: layout.controlRadius },
  input: { minHeight: 52, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.controlRadius, paddingHorizontal: 14, fontSize: typeScale.input },
  action: { minHeight: 48, padding: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, borderRadius: layout.controlRadius, borderWidth: 1, borderColor: colors.accent }, actionText: { color: colors.background, fontSize: typeScale.body, fontWeight: "700" }, secondary: { backgroundColor: "transparent", borderColor: colors.border }, error: { color: colors.danger, lineHeight: 21, fontSize: typeScale.body },
});

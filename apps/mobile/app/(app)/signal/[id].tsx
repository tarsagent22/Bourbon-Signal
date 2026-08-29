import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import { presentSignal, signalMemberTagLabel } from "../../../src/api/presentation";
import type { MemberPreferences, Signal } from "../../../src/api/types";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { addSignalBottleToCollection, canonicalBottleKey } from "../../../src/interactions/member-interactions";
import { setBottleWatched } from "../../../src/radar/radar-preferences";
import { colors } from "../../../src/theme";

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMobileApi();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [error, setError] = useState("");
  const [preferencesError, setPreferencesError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!id) return;
    Promise.allSettled([api.getSignal(id), api.getMemberPreferences()]).then(([signalResult, preferencesResult]) => {
      if (!active) return;
      if (signalResult.status === "fulfilled") setSignal(signalResult.value.signal);
      else setError(signalResult.reason instanceof MobileApiError ? signalResult.reason.message : "This Signal is temporarily unavailable.");
      if (preferencesResult.status === "fulfilled") setPreferences(preferencesResult.value);
      else setPreferencesError("Member actions are temporarily unavailable. Pull to refresh from Radar or Cellar and retry.");
    });
    return () => { active = false; };
  }, [api, id]);

  const presented = signal ? presentSignal(signal) : null;
  const memberTag = signal ? signalMemberTagLabel(signal) : "";
  const bottleKey = signal ? canonicalBottleKey(signal.bottle.name) : "";
  const inCellar = Boolean(preferences?.collectionPreferences.bottles.some((bottle) => canonicalBottleKey(bottle.canonicalKey) === bottleKey));
  const isWatched = Boolean(preferences?.bottleAlertPreferences.bottleKeys.some((key) => canonicalBottleKey(key) === bottleKey)
    || preferences?.bottleAlertPreferences.bottleNames.some((name) => canonicalBottleKey(name) === bottleKey));
  const address = signal ? [signal.location.store?.address, signal.location.store?.city, signal.location.store?.state, signal.location.store?.zip].filter(Boolean).join(", ") : "";
  const canWatch = Boolean(signal?.actions.includes("watch_bottle"));
  const collectionAccess = preferences?.collectionAccess;
  const canReadCellar = collectionAccess?.canRead === true;
  const canAddToCellar = collectionAccess?.canAdd === true;
  const actionCount = useMemo(() => Number(canWatch) + Number(canReadCellar) + Number(Boolean(address)), [address, canReadCellar, canWatch]);

  async function toggleRadarWatch() {
    if (!signal || !preferences || saving) return;
    setSaving(true); setActionError("");
    try {
      const bottleAlertPreferences = setBottleWatched(preferences, signal.bottle.name, !isWatched);
      const saved = await api.updateMemberPreferences({ bottleAlertPreferences, ...(!isWatched ? { alertMode: "specific_bottles" as const } : {}) });
      setPreferences(saved);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "This Radar watch could not be changed.");
    } finally { setSaving(false); }
  }

  async function addToCellar() {
    if (!signal || !preferences || inCellar || !collectionAccess?.canAdd || saving) return;
    setSaving(true); setActionError("");
    try {
      const bottles = addSignalBottleToCollection(preferences.collectionPreferences.bottles, signal.bottle, new Date().toISOString());
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles, version: preferences.collectionPreferences.version } });
      setPreferences(saved);
    } catch (caught) {
      setActionError(caught instanceof MobileApiError && caught.status === 409 ? "Your Cellar changed elsewhere. Open Cellar and refresh before adding this bottle." : caught instanceof Error ? caught.message : "This bottle could not be added to Cellar.");
    } finally { setSaving(false); }
  }

  async function openMaps() {
    if (!address) return;
    const url = Platform.OS === "ios" ? `maps://?q=${encodeURIComponent(address)}` : `geo:0,0?q=${encodeURIComponent(address)}`;
    try { await Linking.openURL(url); }
    catch { setActionError("Maps could not be opened for this location."); }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Stack.Screen options={{ title: "Signal" }} />
    {!signal && !error ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {signal ? <>
      {signal.source.type === "member" ? <View style={styles.authorRow}>
        {presented?.reporter ? <Text style={styles.reporter}>Reported by {presented.reporter}</Text> : null}
        {memberTag ? <View style={styles.memberTag}><Text style={styles.memberTagText}>{memberTag}</Text></View> : null}
        {!presented?.reporter && !memberTag ? <Text style={styles.source}>Community report</Text> : null}
      </View> : <Text style={styles.source}>{signal.source.label}</Text>}
      <Text style={styles.title}>{signal.bottle.name}</Text>
      <View style={styles.rule} />
      <Detail label="Location" value={presented?.address || presented?.location || signal.location.state || "Location not specified"} />
      <Detail label="Observed" value={new Date(signal.timing.displayAt).toLocaleString()} />
      {presented?.availability ? <Detail label="Availability" value={presented.availability} /> : null}
      {presented?.price ? <Detail label="Price" value={presented.price} /> : null}
      {presented?.quantity ? <Detail label="Quantity" value={presented.quantity} /> : null}
      {presented?.summary ? <Detail label="Note" value={presented.summary} /> : null}
      {presented?.caveat ? <Detail label="Caveat" value={presented.caveat} /> : null}
      {signal.source.type === "member" ? <Text style={styles.disclaimer}>Member observations report what someone saw and are not verified retailer inventory.</Text> : null}
      {actionCount ? <View style={styles.actions}>
        <Text style={styles.actionsTitle}>Quick actions</Text>
        {canWatch ? <ActionButton disabled={saving} label={saving ? "Saving…" : isWatched ? "Remove from Radar" : "Watch in Radar"} onPress={() => void toggleRadarWatch()} /> : null}
        {canReadCellar ? <ActionButton disabled={inCellar || !canAddToCellar || saving} label={inCellar ? "Already in Cellar" : !canAddToCellar ? "Free Cellar is full" : saving ? "Adding to Cellar…" : "Add to Cellar"} onPress={() => void addToCellar()} /> : null}
        {address ? <ActionButton label="Open in Maps" onPress={() => void openMaps()} /> : null}
        {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
      </View> : null}
      {preferencesError ? <Text accessibilityRole="alert" style={styles.error}>{preferencesError}</Text> : null}
    </> : null}
  </ScrollView>;
}

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && !disabled && styles.actionPressed]}><Text style={[styles.actionText, disabled && styles.actionTextDisabled]}>{label}</Text></Pressable>; }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 22, paddingBottom: 42, gap: 18, backgroundColor: colors.background }, source: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }, authorRow: { minHeight: 28, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }, reporter: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" }, memberTag: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, memberTagText: { color: colors.text, fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0.4 }, title: { color: colors.text, fontSize: 30, fontWeight: "800" }, rule: { height: 1, backgroundColor: colors.border }, detail: { gap: 5 }, label: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 }, value: { color: colors.text, fontSize: 16, lineHeight: 23 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { gap: 10, marginTop: 4 }, actionsTitle: { color: colors.text, fontSize: 18, fontWeight: "800" }, action: { minHeight: 50, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, actionPressed: { backgroundColor: colors.surfaceRaised }, actionDisabled: { borderColor: colors.border }, actionText: { color: colors.accent, fontSize: 14, fontWeight: "800" }, actionTextDisabled: { color: colors.muted },
});

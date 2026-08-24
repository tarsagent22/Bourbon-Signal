import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import { presentSignal } from "../../../src/api/presentation";
import type { MemberPreferences, Signal } from "../../../src/api/types";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { addSignalBottleToCollection, canonicalBottleKey } from "../../../src/interactions/member-interactions";
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
  const bottleKey = signal ? canonicalBottleKey(signal.bottle.name) : "";
  const inCellar = Boolean(preferences?.collectionPreferences.bottles.some((bottle) => canonicalBottleKey(bottle.canonicalKey) === bottleKey));
  const address = signal ? [signal.location.store?.address, signal.location.store?.city, signal.location.store?.state, signal.location.store?.zip].filter(Boolean).join(", ") : "";
  const canWatch = Boolean(signal?.actions.includes("watch_bottle"));
  const canUseCollection = preferences?.entitlements?.canUseCollection === true;
  const actionCount = useMemo(() => Number(canWatch) + Number(canUseCollection) + Number(Boolean(address)), [address, canUseCollection, canWatch]);

  async function openRadar() {
    try { await Linking.openURL("https://www.bourbonsignal.com/dashboard?section=alerts"); }
    catch { setActionError("Radar settings could not be opened."); }
  }

  async function addToCellar() {
    if (!signal || !preferences || inCellar || saving) return;
    setSaving(true); setActionError("");
    try {
      const bottles = addSignalBottleToCollection(preferences.collectionPreferences.bottles, signal.bottle, new Date().toISOString());
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles, version: preferences.collectionPreferences.version } });
      setPreferences((current) => current ? { ...current, collectionPreferences: saved.collectionPreferences } : current);
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
      <Text style={styles.source}>{signal.source.type === "member" && presented?.reporter ? `Reported by ${presented.reporter}` : signal.source.label}</Text>
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
        {canWatch ? <ActionButton label="Manage in Radar" onPress={() => void openRadar()} /> : null}
        {canUseCollection ? <ActionButton disabled={inCellar || saving} label={inCellar ? "Already in Cellar" : saving ? "Adding to Cellar…" : "Add to Cellar"} onPress={() => void addToCellar()} /> : null}
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
  container: { flexGrow: 1, padding: 22, paddingBottom: 42, gap: 18, backgroundColor: colors.background }, source: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }, title: { color: colors.text, fontSize: 30, fontWeight: "800" }, rule: { height: 1, backgroundColor: colors.border }, detail: { gap: 5 }, label: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 }, value: { color: colors.text, fontSize: 16, lineHeight: 23 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { gap: 10, marginTop: 4 }, actionsTitle: { color: colors.text, fontSize: 18, fontWeight: "800" }, action: { minHeight: 50, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, actionPressed: { backgroundColor: colors.surfaceRaised }, actionDisabled: { borderColor: colors.border }, actionText: { color: colors.accent, fontSize: 14, fontWeight: "800" }, actionTextDisabled: { color: colors.muted },
});

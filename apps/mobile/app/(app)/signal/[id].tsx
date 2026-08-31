import { Stack, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import { presentSignal, signalMemberTagLabel } from "../../../src/api/presentation";
import type { HuntOutcome, MemberPreferences, Signal } from "../../../src/api/types";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { addSignalBottleToCollection } from "../../../src/interactions/member-interactions";
import { setBottleWatched } from "../../../src/radar/radar-preferences";
import { bottleProfileState } from "../../../src/signals/bottle-profile";
import { colors } from "../../../src/theme";
import { huntOutcomePromptStorageKey, shouldOfferHuntOutcomePrompt } from "../../../src/signals/hunt-outcome-prompt";

const HUNT_OUTCOMES: ReadonlyArray<{ value: HuntOutcome; label: string }> = [
  { value: "found_it", label: "Found it" },
  { value: "gone_when_checked", label: "Gone when I checked" },
  { value: "didnt_go", label: "Didn’t go" },
];

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMobileApi();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [error, setError] = useState("");
  const [preferencesError, setPreferencesError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [huntOutcome, setHuntOutcomeState] = useState<HuntOutcome | null>(null);
  const [huntOutcomeVisible, setHuntOutcomeVisible] = useState(false);
  const [editingHuntOutcome, setEditingHuntOutcome] = useState(false);
  const [savingHuntOutcome, setSavingHuntOutcome] = useState(false);
  const [huntOutcomeError, setHuntOutcomeError] = useState("");

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

  useEffect(() => {
    let active = true;
    if (!id || !signal) return;
    const promptSignal = { kind: signal.kind, displayAt: signal.timing.displayAt, expiresAt: signal.timing.expiresAt };
    const now = Date.now();
    if (!shouldOfferHuntOutcomePrompt({ signal: promptSignal, now, lastPromptedAt: null })) return;
    void api.getHuntOutcome(id).then(async (response) => {
      if (!active) return;
      if (response.outcome) {
        setHuntOutcomeState(response.outcome.outcome);
        setHuntOutcomeVisible(true);
        return;
      }
      const storageKey = huntOutcomePromptStorageKey(id);
      const lastPromptedAt = Number(await SecureStore.getItemAsync(storageKey).catch(() => null));
      if (!active || !shouldOfferHuntOutcomePrompt({ signal: promptSignal, now, lastPromptedAt })) return;
      await SecureStore.setItemAsync(storageKey, String(now)).catch(() => undefined);
      if (!active) return;
      setHuntOutcomeVisible(true);
      setEditingHuntOutcome(true);
    }).catch(() => {
      // A missing session or inaccessible historical Signal stays quiet.
    });
    return () => { active = false; };
  }, [api, id, signal]);

  const presented = signal ? presentSignal(signal) : null;
  const memberTag = signal ? signalMemberTagLabel(signal) : "";
  const bottleProfile = signal && preferences ? bottleProfileState(signal.bottle, preferences) : null;
  const inCellar = bottleProfile?.inCellar === true;
  const isWatched = bottleProfile?.isWatched === true;
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

  async function chooseHuntOutcome(outcome: HuntOutcome) {
    if (!id || savingHuntOutcome) return;
    setSavingHuntOutcome(true);
    setHuntOutcomeError("");
    try {
      const response = await api.setHuntOutcome(id, outcome);
      setHuntOutcomeState(response.outcome?.outcome || outcome);
      setEditingHuntOutcome(false);
    } catch (caught) {
      setHuntOutcomeError(caught instanceof Error ? caught.message : "That outcome could not be saved.");
    } finally {
      setSavingHuntOutcome(false);
    }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Stack.Screen options={{ title: "Bottle Profile" }} />
    {!signal && !error ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {signal ? <>
      <Text style={styles.title}>{signal.bottle.name}</Text>
      <View accessibilityLabel="Bottle Profile" style={styles.profileCard}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Bottle Profile</Text>
        <View style={styles.profileGrid}>
          <ProfileDetail label="Radar" value={bottleProfile?.radarLabel || "Unavailable"} />
          <ProfileDetail label="Cellar" value={bottleProfile?.cellarLabel || "Unavailable"} />
          <ProfileDetail label="Rating" value={bottleProfile?.ratingLabel || "Unavailable"} />
          <ProfileDetail label="Inventory" value={bottleProfile?.inventoryLabel || "Unavailable"} />
        </View>
      </View>
      <View style={styles.signalSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Current Signal</Text>
        {signal.source.type === "member" ? <View style={styles.authorRow}>
          {presented?.reporter ? <Text style={styles.reporter}>Reported by {presented.reporter}</Text> : null}
          {memberTag ? <View style={styles.memberTag}><Text style={styles.memberTagText}>{memberTag}</Text></View> : null}
          {!presented?.reporter && !memberTag ? <Text style={styles.source}>Community report</Text> : null}
        </View> : <Text style={styles.source}>{signal.source.label}</Text>}
        <Detail label="Location" value={presented?.address || presented?.location || signal.location.state || "Location not specified"} />
        <Detail label="Observed" value={new Date(signal.timing.displayAt).toLocaleString()} />
        {presented?.availability ? <Detail label="Availability" value={presented.availability} /> : null}
        {presented?.price ? <Detail label="Price" value={presented.price} /> : null}
        {presented?.quantity ? <Detail label="Quantity" value={presented.quantity} /> : null}
        {presented?.summary ? <Detail label="Note" value={presented.summary} /> : null}
        {presented?.caveat ? <Detail label="Caveat" value={presented.caveat} /> : null}
        {signal.source.type === "member" ? <Text style={styles.disclaimer}>Member observations report what someone saw and are not verified retailer inventory.</Text> : null}
      </View>
      {actionCount ? <View style={styles.actions}>
        <Text style={styles.actionsTitle}>Actions</Text>
        {canWatch ? <ActionButton disabled={saving} label={saving ? "Saving…" : isWatched ? "Remove from Radar" : "Watch in Radar"} onPress={() => void toggleRadarWatch()} /> : null}
        {canReadCellar ? <ActionButton disabled={inCellar || !canAddToCellar || saving} label={inCellar ? "Already in Cellar" : !canAddToCellar ? "Free Cellar is full" : saving ? "Adding to Cellar…" : "Add to Cellar"} onPress={() => void addToCellar()} /> : null}
        {address ? <ActionButton label="Open in Maps" onPress={() => void openMaps()} /> : null}
        {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
      </View> : null}
      {huntOutcomeVisible ? <View accessibilityLabel="Hunt Outcome" style={styles.huntOutcome}>
        {huntOutcome && !editingHuntOutcome ? <View style={styles.huntOutcomeSaved}>
          <Text style={styles.huntOutcomeSavedText}>Hunt Outcome: <Text style={styles.huntOutcomeSavedValue}>{HUNT_OUTCOMES.find((item) => item.value === huntOutcome)?.label}</Text></Text>
          <Pressable accessibilityRole="button" onPress={() => setEditingHuntOutcome(true)} style={styles.huntOutcomeEdit}><Text style={styles.huntOutcomeEditText}>Edit</Text></Pressable>
        </View> : <>
          <Text accessibilityRole="header" style={styles.huntOutcomeTitle}>How did this hunt go?</Text>
          <Text style={styles.huntOutcomeDetail}>Optional and private. Choose once, then this row gets out of the way.</Text>
          <View style={styles.huntOutcomeChoices}>{HUNT_OUTCOMES.map((item) => <Pressable accessibilityRole="button" disabled={savingHuntOutcome} key={item.value} onPress={() => void chooseHuntOutcome(item.value)} style={[styles.huntOutcomeChoice, huntOutcome === item.value && styles.huntOutcomeChoiceActive, savingHuntOutcome && styles.actionDisabled]}><Text style={styles.huntOutcomeChoiceText}>{item.label}</Text></Pressable>)}</View>
          {huntOutcomeError ? <Text accessibilityRole="alert" style={styles.error}>{huntOutcomeError}</Text> : null}
        </>}
      </View> : null}
      {preferencesError ? <Text accessibilityRole="alert" style={styles.error}>{preferencesError}</Text> : null}
    </> : null}
  </ScrollView>;
}

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && !disabled && styles.actionPressed]}><Text style={[styles.actionText, disabled && styles.actionTextDisabled]}>{label}</Text></Pressable>; }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
function ProfileDetail({ label, value }: { label: string; value: string }) { return <View style={styles.profileDetail}><Text style={styles.profileLabel}>{label}</Text><Text numberOfLines={2} style={styles.profileValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 22, paddingBottom: 42, gap: 18, backgroundColor: colors.background }, source: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }, authorRow: { minHeight: 28, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }, reporter: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" }, memberTag: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, memberTagText: { color: colors.text, fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0.4 }, title: { color: colors.text, fontSize: 30, fontWeight: "800" }, sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800" }, profileCard: { gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 15 }, profileGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 13 }, profileDetail: { width: "50%", gap: 3, paddingRight: 8 }, profileLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }, profileValue: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" }, signalSection: { gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 18 }, detail: { gap: 5 }, label: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 }, value: { color: colors.text, fontSize: 16, lineHeight: 23 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { gap: 10, marginTop: 4 }, actionsTitle: { color: colors.text, fontSize: 18, fontWeight: "800" }, action: { minHeight: 50, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, actionPressed: { backgroundColor: colors.surfaceRaised }, actionDisabled: { borderColor: colors.border }, actionText: { color: colors.accent, fontSize: 14, fontWeight: "800" }, actionTextDisabled: { color: colors.muted },
  huntOutcome: { gap: 10, marginTop: 8, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18 }, huntOutcomeTitle: { color: colors.text, fontSize: 18, fontWeight: "800" }, huntOutcomeDetail: { color: colors.muted, fontSize: 12, lineHeight: 18 }, huntOutcomeChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, huntOutcomeChoice: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 12 }, huntOutcomeChoiceActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised }, huntOutcomeChoiceText: { color: colors.text, fontSize: 12, fontWeight: "700" }, huntOutcomeSaved: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, huntOutcomeSavedText: { flex: 1, color: colors.muted, fontSize: 13 }, huntOutcomeSavedValue: { color: colors.text, fontWeight: "800" }, huntOutcomeEdit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, huntOutcomeEditText: { color: colors.accent, fontWeight: "800" },
});

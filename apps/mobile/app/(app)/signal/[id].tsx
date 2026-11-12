import type { BottleProfile } from '../../../../../shared/bottle-profile';
import { BottleProfileHero } from '../../../src/components/BottleProfileHero';
import { ProfileBackButton } from '../../../src/components/ProfileBackButton';
import { BottlePriceCheck } from '../../../src/components/BottlePriceCheck';
import { reportAge } from "../../../src/signals/report-age";
import { ErrorState } from "../../../src/components/MemberScreen";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import { presentSignal, signalMemberTagLabel, signalCardStatusLabel } from "../../../src/api/presentation";
import type { HuntOutcome, MemberPreferences, Signal } from "../../../src/api/types";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { addSignalBottleToCollection } from "../../../src/interactions/member-interactions";
import { bottleWatchMutation } from "../../../src/radar/radar-preferences";
import { bottleProfileState, collectionBottleForIdentity } from "../../../src/signals/bottle-profile";
import { colors, typeScale, fonts } from "../../../src/theme";
import { huntOutcomePromptStorageKey, shouldOfferHuntOutcomePrompt } from "../../../src/signals/hunt-outcome-prompt";
import { coverageContext, supportContext } from '../../../src/continuity/bottle-handoff';

const HUNT_OUTCOMES: ReadonlyArray<{ value: HuntOutcome; label: string }> = [
  { value: "found_it", label: "Found it" },
  { value: "gone_when_checked", label: "Gone when I checked" },
  { value: "didnt_go", label: "Didn’t go" },
];

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMobileApi();
  const router = useRouter();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [bottleDetails, setBottleDetails] = useState<BottleProfile | null>(null);
  useEffect(() => {
    setBottleDetails(null); let active = true;
    if (signal?.bottle.id) void api.getBottleProfile(signal.bottle.id).then(result => { if (active) setBottleDetails(result.bottle); }).catch(() => undefined);
    return () => { active = false; };
  }, [api, signal?.bottle.id]);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [error, setError] = useState("");
  const [preferencesError, setPreferencesError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState("");
  const [hidden, setHidden] = useState(false);
  const [photoFailed,setPhotoFailed]=useState(false);
  const [feedbackNotice,setFeedbackNotice]=useState('');

  async function saveFeedback(action:'helpful'|'no_longer_there') {
    if(!signal||saving)return;setSaving(true);setActionError('');
    try{const result=await api.actOnSignal(signal.id,action);setSignal(result.signal);setFeedbackNotice(result.action.active?(action==='helpful'?'Marked helpful. Thank you.':'Your availability correction was saved.'):'Your previous feedback was removed.');}
    catch(caught){setActionError(caught instanceof Error?caught.message:'Feedback could not be saved.');}
    finally{setSaving(false);}
  }

  async function saveSafety(action:"report"|"block",reason?:"spam"|"misleading"|"harassment"|"inappropriate"|"other") {
    if(!signal || saving)return;
    setSaving(true); setActionError("");
    try { await api.saveCommunitySafety({action,signalId:signal.id,reason}); setHidden(true); setReporting(false); setSafetyNotice(action === "block" ? "Member blocked. Their posts and future Community alerts are hidden. Manage blocked members from Account." : "Report sent for review. This post is hidden from your feed. Contact support@bourbonsignal.com if you need help."); }
    catch(caught){setActionError(caught instanceof Error?caught.message:"Your change could not be saved.");}
    finally{setSaving(false);}
  }
  const [huntOutcome, setHuntOutcomeState] = useState<HuntOutcome | null>(null);
  const [huntOutcomeVisible, setHuntOutcomeVisible] = useState(false);
  const [editingHuntOutcome, setEditingHuntOutcome] = useState(false);
  const [savingHuntOutcome, setSavingHuntOutcome] = useState(false);
  const [huntOutcomeError, setHuntOutcomeError] = useState("");

  const sequence = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (fresh = false) => {
    if (!id) return;
    const request = ++sequence.current;
    setRefreshing(true);setPhotoFailed(false);
    await Promise.allSettled([
      api.getSignal(id, { fresh }).then(result => {
        if (request === sequence.current) { setSignal(result.signal); setError(""); }
      }).catch(caught => {
        if (request === sequence.current) setError(caught instanceof MobileApiError ? caught.message : "This Signal is temporarily unavailable.");
      }),
      api.getMemberPreferences({ fresh }).then(result => {
        if (request === sequence.current) { setPreferences(result); setPreferencesError(""); }
      }).catch(() => {
        if (request === sequence.current) setPreferencesError("Member actions couldn’t refresh. Try again here.");
      }),
    ]);
    if (request === sequence.current) setRefreshing(false);
  }, [api, id]);
  useEffect(() => { setSignal(null); setError(""); setHidden(false);setSafetyNotice('');setPhotoFailed(false);setFeedbackNotice('');void load(); return () => { sequence.current += 1; }; }, [load]);
  useScreenRevalidation(load);

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
  const shelfEntry = signal && preferences ? collectionBottleForIdentity(signal.bottle, preferences.collectionPreferences.bottles) : null;
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
      const saved = await api.updateMemberPreferences({ watchlistMutation: bottleWatchMutation(signal.bottle.name, !isWatched), ...(!isWatched ? { alertMode: "specific_bottles" as const } : {}) });
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
      setActionError(caught instanceof MobileApiError && caught.status === 409 ? "My Shelf changed elsewhere. Open My Shelf and refresh before adding this bottle." : caught instanceof Error ? caught.message : "This bottle could not be added to My Shelf.");
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
      if (response.reward) setHuntOutcomeError('pending' in response.reward ? 'Update saved. Reward processing is pending; reopen this Signal to retry.' : response.reward.points > 0 ? 'Update saved · 5 points credited for this availability episode. Repeated updates do not earn again.' : 'Update saved. Points apply to the first 3 qualifying retailer/source updates per day.');
    } catch (caught) {
      setHuntOutcomeError(caught instanceof Error ? caught.message : "That outcome could not be saved.");
    } finally {
      setSavingHuntOutcome(false);
    }
  }

  return <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing && Boolean(signal)} onRefresh={() => void load(true)} tintColor={colors.accent} />}>
    <Stack.Screen options={{ title: "Bottle Profile", headerLeft: () => <ProfileBackButton /> }} />
    {!signal && !error ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
    {safetyNotice ? <Text accessibilityRole="alert" style={styles.disclaimer}>{safetyNotice}</Text> : null}
    {signal && !hidden ? <>
      <BottleProfileHero identity={signal.bottle} details={bottleDetails} personal={bottleProfile}
        onShelf={canReadCellar && (inCellar || canAddToCellar) && !saving ? () => shelfEntry ? router.push({ pathname: "/(app)/(tabs)/cellar", params: { editBottleId: shelfEntry.bottleId } }) : signal.bottle.id ? router.push({ pathname: "/(app)/cellar/add", params: { bottleId: signal.bottle.id } }) : void addToCellar() : undefined}
        onWatch={canWatch && preferences && !saving ? () => void toggleRadarWatch() : undefined} />
      <View style={styles.signalSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{signal.historical ? "Last reported availability" : signal.kind === "availability" ? "Store report" : signal.kind === "release" ? "Release details" : "Event details"}</Text>
        <Text style={styles.source}>{signalCardStatusLabel(signal)}</Text>
        {signal.location.store?.name ? <Text style={styles.storeName}>{signal.location.store.name}</Text> : null}
        <View style={styles.reportFigures}>{presented?.price ? <View style={styles.reportFigure}>{signal.availability?.price != null ? <Text style={styles.label}>Reported price</Text> : null}<Text style={signal.availability?.price == null ? styles.disclaimer : styles.reportPrice}>{signal.availability?.price == null && presented.price === "Price unknown" ? "Price not reported" : presented.price}</Text></View> : null}{presented?.quantity ? <View style={styles.reportFigure}><Text style={styles.label}>Reported quantity</Text><Text style={styles.reportQuantity}>{presented.quantity}</Text></View> : null}</View>
        {signal.source.type === "member" ? <View style={styles.authorRow}>
          {presented?.reporter ? <Text style={styles.reporter}>Reported by {presented.reporter}</Text> : null}
          {memberTag ? <View style={styles.memberTag}><Text style={styles.memberTagText}>{memberTag}</Text></View> : null}
          {!presented?.reporter && !memberTag ? <Text style={styles.source}>Community report</Text> : null}
          {signal?.source.actor?.badges?.length?<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{signal.source.actor.badges.map(badge=><Text key={badge} style={{color:colors.accent,fontSize: typeScale.small}}>{badge}</Text>)}</View>:null}
        </View> : <Text style={styles.source}>{signal.source.label}</Text>}
        <Detail label="Location" value={address || presented?.location || signal.location.state || "Location not specified"} />
        <Detail label={signal.kind === "availability" && signal.source.type === "trusted_source" ? "Last checked" : "Reported"} value={reportAge(signal).value ? new Date(reportAge(signal).value!).toLocaleString() : "Time not available"} />
        {signal.timing.firstSpottedAt ? <Detail label="First spotted" value={new Date(signal.timing.firstSpottedAt).toLocaleString()} /> : null}



        {presented?.summary && (signal.source.type === "member" || signal.kind !== "availability") ? <Detail label="Note" value={presented.summary} /> : null}
        {signal.evidence.photoUrl ? photoFailed?<Text style={styles.disclaimer}>The approved photo could not load. Pull to refresh to try again.</Text>:<Image source={{uri:signal.evidence.photoUrl}} onError={()=>setPhotoFailed(true)} accessibilityLabel="Member sighting photo approved for public display" resizeMode="contain" style={{width:"100%",height:240,borderRadius:12}} /> : null}
        <Text style={styles.disclaimer}>{signal.historical ? "This is an older report. Check with the store for current availability before driving." : "Reported availability can change. Check with the store before driving."}</Text>
        {presented?.caveat && !/stale|not alertable|last.known|before driving/i.test(presented.caveat) ? <Detail label="Source note" value={presented.caveat} /> : null}
        {signal.source.type === "member" ? <Text style={styles.disclaimer}>Member observations report what someone saw and are not verified retailer inventory.</Text> : null}
      </View>
      <BottlePriceCheck key={signal.id} msrp={bottleDetails?.msrp ?? null} initialPrice={signal.availability?.price?.toFixed(2) || ''} />
      {actionCount ? <View style={styles.actions}>
        <Text style={styles.actionsTitle}>Actions</Text>
        {canWatch ? <ActionButton disabled={saving} label={saving ? "Saving…" : isWatched ? "Remove from Radar" : "Watch in Radar"} onPress={() => void toggleRadarWatch()} /> : null}
        {canReadCellar ? <ActionButton disabled={(!inCellar && !canAddToCellar) || saving} label={inCellar ? "Edit your shelf" : !canAddToCellar ? "Free shelf is full" : saving ? "Adding to My Shelf…" : "Add to My Shelf"} onPress={() => shelfEntry ? router.push({pathname:"/(app)/(tabs)/cellar",params:{editBottleId:shelfEntry.bottleId}}) : signal.bottle.id ? router.push({pathname:"/(app)/cellar/add",params:{bottleId:signal.bottle.id}}) : void addToCellar()} /> : null}
        {address ? <ActionButton label="Open in Maps" onPress={() => void openMaps()} /> : null}
        <ActionButton label="Request coverage for this area or store" onPress={() => router.push({ pathname: '/(app)/account/coverage', params: coverageContext({ state: signal.location.state, area: signal.location.store?.city, store: signal.location.store?.name, address: signal.location.store?.address }) })} />
        <ActionButton label="Get help with this Signal" onPress={() => router.push({ pathname: '/(app)/account/support', params: supportContext({ screen: 'Signal detail', bottle: signal.bottle.name, signalId: signal.id, state: signal.location.state, area: signal.location.store?.city }) })} />
        {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
      </View> : null}
      {signal.source.type === "member" ? <View style={styles.actions}>
        <Text style={styles.actionsTitle}>Community feedback</Text>
        {signal.actions.includes('helpful')?<ActionButton disabled={saving} label={`Helpful (${signal.evidence.helpfulCount})`} onPress={()=>void saveFeedback('helpful')}/>:null}
        {signal.actions.includes('correct')?<ActionButton disabled={saving} label="No longer there" onPress={()=>Alert.alert('Did you check this store?','Only mark this if you checked the reported bottle at this store.',[{text:'Cancel',style:'cancel'},{text:'I checked',onPress:()=>void saveFeedback('no_longer_there')}])}/>:null}
        {feedbackNotice?<Text accessibilityLiveRegion="polite" style={styles.disclaimer}>{feedbackNotice}</Text>:null}
        <Text style={styles.actionsTitle}>Community safety</Text>
        <ActionButton disabled={saving} label="Report this post" onPress={()=>setReporting(value=>!value)} />
        {reporting ? <View style={styles.actions}>{([{value:"spam",label:"Spam"},{value:"misleading",label:"Misleading availability"},{value:"harassment",label:"Harassment"},{value:"inappropriate",label:"Inappropriate content"},{value:"other",label:"Other concern"}] as const).map(reason=><ActionButton key={reason.value} disabled={saving} label={reason.label} onPress={()=>void saveSafety("report",reason.value)} />)}</View> : null}
        <ActionButton disabled={saving} label="Block this member" onPress={()=>Alert.alert("Block this member?","Their posts and future Community alerts will be hidden. You can unblock them from Account.",[{text:"Cancel",style:"cancel"},{text:"Block member",style:"destructive",onPress:()=>void saveSafety("block")}])} />
        <Text style={styles.disclaimer}>Need help? support@bourbonsignal.com</Text>
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
      {preferencesError ? <ErrorState message={preferencesError} onRetry={() => void load(true)} /> : null}
    </> : null}
  </ScrollView>;
}

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && !disabled && styles.actionPressed]}><Text style={[styles.actionText, disabled && styles.actionTextDisabled]}>{label}</Text></Pressable>; }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
function ProfileDetail({ label, value }: { label: string; value: string }) { return <View style={styles.profileDetail}><Text style={styles.profileLabel}>{label}</Text><Text numberOfLines={2} style={styles.profileValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  storeName:{color:colors.text,fontFamily:fonts.heading,fontSize:24,lineHeight:30},reportFigures:{flexDirection:"row",flexWrap:"wrap",gap:28},reportFigure:{gap:6},reportPrice:{color:colors.accent,fontSize:32,fontWeight:"600"},reportQuantity:{color:colors.text,fontSize:24},
  container: { flexGrow: 1, padding: 22, paddingBottom: 42, gap: 18, backgroundColor: colors.background }, source: { color: colors.accent, fontSize: typeScale.small, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }, authorRow: { minHeight: 28, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }, reporter: { color: colors.text, fontSize: typeScale.body, lineHeight: 19, fontWeight: "700" }, memberTag: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, memberTagText: { color: colors.text, fontSize: typeScale.caption, lineHeight: 13, fontWeight: "800", letterSpacing: 0.4 }, title: { color: colors.text, fontSize: typeScale.title, fontFamily: fonts.heading, fontWeight: "700" }, sectionTitle: { color: colors.text, fontSize: typeScale.subheading, lineHeight: 23, fontWeight: "800" }, profileCard: { gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: 15 }, profileGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 13 }, profileDetail: { width: "50%", gap: 3, paddingRight: 8 }, profileLabel: { color: colors.muted, fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }, profileValue: { color: colors.text, fontSize: typeScale.body, lineHeight: 19, fontWeight: "700" }, signalSection: { gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 18 }, detail: { gap: 5 }, label: { color: colors.muted, fontSize: typeScale.small, textTransform: "uppercase", letterSpacing: 0.7 }, value: { color: colors.text, fontSize: typeScale.input, lineHeight: 23 }, error: { color: colors.danger, fontSize: typeScale.small, lineHeight: 18 }, disclaimer: { color: colors.muted, fontSize: typeScale.small, lineHeight: 18, marginTop: 4 },
  actions: { gap: 10, marginTop: 4 }, actionsTitle: { color: colors.text, fontSize: typeScale.subheading, fontWeight: "800" }, action: { minHeight: 50, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, actionPressed: { backgroundColor: colors.surfaceRaised }, actionDisabled: { borderColor: colors.border }, actionText: { color: colors.accent, fontSize: typeScale.body, fontWeight: "800" }, actionTextDisabled: { color: colors.muted },
  huntOutcome: { gap: 10, marginTop: 8, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18 }, huntOutcomeTitle: { color: colors.text, fontSize: typeScale.subheading, fontWeight: "800" }, huntOutcomeDetail: { color: colors.muted, fontSize: typeScale.small, lineHeight: 18 }, huntOutcomeChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, huntOutcomeChoice: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 12 }, huntOutcomeChoiceActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised }, huntOutcomeChoiceText: { color: colors.text, fontSize: typeScale.small, fontWeight: "700" }, huntOutcomeSaved: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, huntOutcomeSavedText: { flex: 1, color: colors.muted, fontSize: typeScale.small }, huntOutcomeSavedValue: { color: colors.text, fontWeight: "800" }, huntOutcomeEdit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, huntOutcomeEditText: { color: colors.accent, fontWeight: "800" },
});

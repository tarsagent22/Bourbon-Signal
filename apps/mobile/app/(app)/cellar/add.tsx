import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences, RadarBottleOption } from "../../../src/api/types";
import {
  bottleContributionReceiptsStorageKey,
  mergeBottleContributionReceipt,
  parseBottleContributionReceipts,
  removeBottleContributionReceipts,
  serializeBottleContributionReceipts,
} from "../../../src/cellar/contribution-receipts";
import { EmptyState, ErrorState, LoadingState } from "../../../src/components/MemberScreen";
import { ScoreSlider } from "../../../src/components/ScoreSlider";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { applyBottleContributionIds, createCollectionBottle, createCustomCollectionBottle, TASTE_TAG_OPTIONS } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

type AddKind = "sealed" | "opened" | "just_tasted";
const KINDS: Array<{ key: AddKind; label: string }> = [
  { key: "sealed", label: "I own it" },
  { key: "opened", label: "I opened it" },
  { key: "just_tasted", label: "I just tasted it" },
];
const CONTEXTS: Array<{ key: NonNullable<MemberCollectionBottle["tastingContext"]>; label: string }> = [
  { key: "bar", label: "Bar" }, { key: "bottle_share", label: "Bottle share" }, { key: "friend", label: "Friend" }, { key: "event", label: "Event" }, { key: "other", label: "Other" },
];
const COMMON_CUES = TASTE_TAG_OPTIONS.slice(0, 5);

export default function AddCellarBottleScreen() {
  const api = useMobileApi();
  const { userId } = useAuth();
  const router = useRouter();
  const receiptStorageKey = bottleContributionReceiptsStorageKey(userId);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RadarBottleOption[]>([]);
  const [selected, setSelected] = useState<RadarBottleOption | null>(null);
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customProof, setCustomProof] = useState("");
  const [customDetail, setCustomDetail] = useState("");
  const [kind, setKind] = useState<AddKind>("sealed");
  const [quantity, setQuantity] = useState("1");
  const [pricePaid, setPricePaid] = useState("");
  const [store, setStore] = useState("");
  const [showAcquisition, setShowAcquisition] = useState(false);
  const [tastingContext, setTastingContext] = useState<MemberCollectionBottle["tastingContext"]>("bar");
  const [isRated, setIsRated] = useState(false);
  const [rating, setRating] = useState(0);
  const [tasteTags, setTasteTags] = useState<string[]>([]);
  const [showMoreCues, setShowMoreCues] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true); setError("");
      try { setPreferences(await api.getMemberPreferences({ fresh: true })); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Your Cellar is temporarily unavailable."); }
      finally { setLoading(false); }
    })();
  }, [api]);

  useEffect(() => {
    const needle = query.replace(/\s+/g, " ").trim();
    if (selected || needle.length < 2) { setResults([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void api.listRadarBottles({ query: needle, limit: 12 }).then((bottles) => {
        if (active) setResults(bottles);
      }).catch(() => {
        if (active) setError("Bottle search is temporarily unavailable. You can still add the bottle below.");
      }).finally(() => { if (active) setSearching(false); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [api, query, selected]);

  const cues = useMemo(() => showMoreCues ? TASTE_TAG_OPTIONS : Array.from(new Set([...COMMON_CUES, ...tasteTags])) as typeof TASTE_TAG_OPTIONS[number][], [showMoreCues, tasteTags]);
  const hasBottle = Boolean(selected || custom);

  function choose(option: RadarBottleOption) {
    setSelected(option); setCustom(false); setQuery(option.name); setError("");
  }

  function beginCustom() {
    setSelected(null); setCustom(true); setCustomName(query.trim()); setError("");
  }

  async function save() {
    if (!preferences || !hasBottle || saving) return;
    const ownedQuantity = Number(quantity);
    const numericPrice = pricePaid.trim() ? Number(pricePaid) : undefined;
    const numericProof = customProof.trim() ? Number(customProof) : undefined;
    if (kind !== "just_tasted" && (!Number.isInteger(ownedQuantity) || ownedQuantity < 1 || ownedQuantity > 999)) { setError("Quantity must be a whole number from 1 to 999."); return; }
    if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0)) { setError("Price paid must be a positive amount."); return; }
    if (custom && !customName.trim()) { setError("Bottle name is required."); return; }
    if (numericProof !== undefined && (!Number.isFinite(numericProof) || numericProof <= 0 || numericProof > 300)) { setError("Proof must be a number from 0.1 to 300."); return; }
    if (custom && results.some((bottle) => bottle.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === customName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())) { setError("That bottle is shown in the near matches. Choose it above to avoid a duplicate."); return; }
    const customNameKey = customName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (custom && preferences.collectionPreferences.bottles.some((bottle) => bottle.bottleName.split(" · ")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === customNameKey)) { setError("This bottle is already in your Cellar. Open it there to update quantities or tasting details."); return; }

    const now = new Date().toISOString();
    const input = { kind, quantity: ownedQuantity, pricePaid: numericPrice, store, tastingContext, rating, isRated, tasteTags, notes };
    const entry = custom
      ? createCustomCollectionBottle({ name: customName, proof: numericProof, detail: customDetail }, input, now)
      : createCollectionBottle(selected!, input, now);
    if (preferences.collectionPreferences.bottles.some((bottle) => bottle.bottleId === entry.bottleId || bottle.canonicalKey === entry.canonicalKey)) { setError("This bottle is already in your Cellar. Open it there to update quantities or tasting details."); return; }

    setSaving(true); setError("");
    try {
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles: [...preferences.collectionPreferences.bottles, entry], version: preferences.collectionPreferences.version } });
      if (custom) {
        try {
          const response = await api.submitBottleContribution(
            { rawName: customName.trim(), source: "collection", context: { proof: numericProof ?? null, detail: customDetail.trim() || null } },
            `cellar-${entry.bottleId}`,
          );
          const contributionId = mergeBottleContributionReceipt(new Map(), entry.bottleId, response.contribution.id).get(entry.bottleId)!;
          let durableReceipts: ReadonlyMap<string, string> | undefined;
          try {
            if (!receiptStorageKey) throw new Error("Authenticated receipt storage is unavailable.");
            const stored = parseBottleContributionReceipts(await SecureStore.getItemAsync(receiptStorageKey));
            durableReceipts = mergeBottleContributionReceipt(stored, entry.bottleId, contributionId);
            await SecureStore.setItemAsync(receiptStorageKey, serializeBottleContributionReceipts(durableReceipts));
          } catch {
            durableReceipts = undefined;
          }

          const bottles = applyBottleContributionIds(saved.collectionPreferences.bottles, new Map([[entry.bottleId, contributionId]]));
          try {
            const contributionSaved = bottles === saved.collectionPreferences.bottles
              ? saved
              : await api.updateMemberPreferences({ collectionPreferences: { bottles, version: saved.collectionPreferences.version } });
            const contributionConfirmed = contributionSaved.collectionPreferences.bottles.some((bottle) => bottle.bottleId === entry.bottleId && bottle.bottleContributionId === contributionId);
            if (!contributionConfirmed) throw new Error("Bottle contribution receipt was not confirmed.");
            if (durableReceipts && contributionConfirmed) {
              const remaining = removeBottleContributionReceipts(durableReceipts, [entry.bottleId]);
              try {
                if (remaining.size) await SecureStore.setItemAsync(receiptStorageKey, serializeBottleContributionReceipts(remaining));
                else await SecureStore.deleteItemAsync(receiptStorageKey);
              } catch {}
            }
          } catch {
            Alert.alert("Bottle added", "Your bottle is safe in your Cellar. We’ll keep working on the match in the background.");
          }
        } catch {
          Alert.alert("Bottle added", "Your bottle is safe in your Cellar. We’ll keep working on the match in the background.");
        }
      }
      router.back();
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) {
        setPreferences(await api.getMemberPreferences({ fresh: true }).catch(() => preferences));
        setError("Your Cellar changed elsewhere. It was refreshed; review this bottle and save again.");
      } else setError(caught instanceof Error ? caught.message : "This bottle could not be added.");
    } finally { setSaving(false); }
  }

  return <SafeAreaView edges={["bottom"]} style={styles.screen}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CELLAR</Text><Text accessibilityRole="header" style={styles.title}>Add to Cellar</Text>
      <Text style={styles.description}>Find your bottle, then save what you own or tasted.</Text>
      {loading ? <LoadingState label="Opening your Cellar…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => setError("")} /> : null}
      {!loading && preferences?.entitlements?.canUseCollection !== true ? <EmptyState title="Cellar is not included with this membership" detail="Return to HQ to review the membership recognized by the app." /> : null}
      {!loading && preferences?.entitlements?.canUseCollection ? <>
        <Field label="Bottle"><TextInput accessibilityLabel="Search bottles" autoCapitalize="none" autoFocus clearButtonMode="while-editing" onChangeText={(value) => { setQuery(value); if (selected && value !== selected.name) setSelected(null); if (custom) setCustom(false); }} placeholder="Search bourbon or whiskey" placeholderTextColor={colors.muted} style={styles.input} value={query} /></Field>
        {searching ? <Text style={styles.fieldHelp}>Finding bottles…</Text> : null}
        {!selected && results.length ? <View accessibilityLabel={custom ? "Near matches" : "Bottle search results"} style={styles.results}>{custom ? <Text style={styles.nearTitle}>Near matches</Text> : null}{results.map((option) => <Pressable accessibilityRole="button" key={option.id} onPress={() => choose(option)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}><Text style={styles.resultName}>{option.name}</Text><Text style={styles.resultMeta}>{[option.proof ? `${option.proof} proof` : "", option.ageStatement || ""].filter(Boolean).join(" · ")}</Text></Pressable>)}</View> : null}
        {custom && !searching && !results.length ? <View accessibilityLabel="Near matches" style={styles.results}><Text style={styles.nearTitle}>Near matches</Text><Text style={styles.noMatches}>No close matches found.</Text></View> : null}
        {!selected && query.trim().length >= 2 && !custom ? <View style={styles.cantFind}><Text style={styles.cantFindText}>Can’t find it?</Text><Pressable accessibilityRole="button" onPress={beginCustom} style={styles.outlineButton}><Text style={styles.outlineButtonText}>Add this bottle</Text></Pressable></View> : null}
        {custom ? <View style={styles.customBox}><Text style={styles.sectionTitle}>Bottle details</Text><Field label="Display name"><TextInput accessibilityLabel="Bottle display name" onChangeText={setCustomName} placeholder="Required" placeholderTextColor={colors.muted} style={styles.input} value={customName} /></Field><View style={styles.split}><Field label="Proof (optional)"><TextInput accessibilityLabel="Bottle proof" keyboardType="decimal-pad" onChangeText={setCustomProof} placeholder="101.3" placeholderTextColor={colors.muted} style={styles.input} value={customProof} /></Field><Field label="Age, batch, or finish (optional)"><TextInput accessibilityLabel="Age batch or finish" onChangeText={setCustomDetail} placeholder="Batch 7" placeholderTextColor={colors.muted} style={styles.input} value={customDetail} /></Field></View></View> : null}
        {selected ? <View style={styles.selected}><View style={styles.selectedCopy}><Text style={styles.fieldHelp}>YOUR BOTTLE</Text><Text style={styles.selectedName}>{selected.name}</Text></View><Pressable accessibilityRole="button" onPress={() => { setSelected(null); setQuery(""); }} style={styles.target}><Text style={styles.action}>Change</Text></Pressable></View> : null}
        {hasBottle ? <>
          <Field label="What are you adding?"><View style={styles.toggles}>{KINDS.map((option) => <Toggle key={option.key} active={kind === option.key} label={option.label} onPress={() => setKind(option.key)} />)}</View></Field>
          {kind !== "just_tasted" ? <><Field label="Quantity"><TextInput accessibilityLabel="Bottle quantity" keyboardType="number-pad" maxLength={3} onChangeText={setQuantity} style={styles.input} value={quantity} /></Field><Pressable accessibilityRole="button" accessibilityState={{ expanded: showAcquisition }} onPress={() => setShowAcquisition(!showAcquisition)} style={styles.target}><Text style={styles.action}>{showAcquisition ? "Hide acquisition details" : "Acquisition details"}</Text></Pressable>{showAcquisition ? <><Field label="Price paid"><TextInput accessibilityLabel="Price paid" keyboardType="decimal-pad" onChangeText={setPricePaid} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={pricePaid} /></Field><Field label="Store"><TextInput accessibilityLabel="Store purchased from" onChangeText={setStore} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={store} /></Field></> : null}</> : <Field label="Tasting context"><View style={styles.toggles}>{CONTEXTS.map((context) => <Toggle key={context.key} active={tastingContext === context.key} label={context.label} onPress={() => setTastingContext(context.key)} />)}</View></Field>}
          <Text style={styles.sectionTitle}>My tasting</Text><View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Add a rating</Text><Text style={styles.fieldHelp}>A real 0.0 stays different from unrated.</Text></View><Switch accessibilityLabel="Add a rating" onValueChange={setIsRated} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={isRated} /></View>
          {isRated ? <ScoreSlider onChange={setRating} value={rating} /> : null}
          <Field label="Quick cues"><View style={styles.toggles}>{cues.map((tag) => <Toggle key={tag} active={tasteTags.includes(tag)} label={tag} onPress={() => setTasteTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}</View></Field>
          {!showMoreCues ? <Pressable accessibilityRole="button" onPress={() => setShowMoreCues(true)} style={styles.target}><Text style={styles.action}>More cues</Text></Pressable> : null}
          <Field label="Notes (optional)"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="What stood out?" placeholderTextColor={colors.muted} style={[styles.input, styles.notes]} value={notes} /></Field>
          <Pressable accessibilityLabel={custom ? "Add this bottle" : "Save to Cellar"} accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, pressed && styles.savePressed]}><Text style={styles.saveText}>{saving ? "Saving…" : custom ? "Add this bottle" : "Save to Cellar"}</Text></Pressable>
        </> : null}
      </> : null}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function Toggle({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 48, gap: 18 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, fontWeight: "800" }, description: { color: colors.muted, fontSize: 14, lineHeight: 20 }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }, field: { flex: 1, gap: 8 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" }, fieldHelp: { color: colors.muted, fontSize: 11, lineHeight: 17 }, input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, notes: { minHeight: 100, textAlignVertical: "top" }, results: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" }, nearTitle: { color: colors.accent, padding: 12, fontSize: 12, fontWeight: "800" }, noMatches: { color: colors.muted, paddingHorizontal: 12, paddingBottom: 12, fontSize: 12 }, result: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, resultName: { color: colors.text, fontSize: 14, fontWeight: "700" }, resultMeta: { color: colors.muted, fontSize: 11 }, suggestions: { gap: 4 }, suggestion: { minHeight: 44, justifyContent: "center" }, suggestionText: { color: colors.text, fontSize: 14 }, cantFind: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, cantFindText: { color: colors.muted, fontSize: 14 }, outlineButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderColor: colors.accent, borderWidth: 1, borderRadius: 11 }, outlineButtonText: { color: colors.accent, fontWeight: "800" }, customBox: { gap: 14, padding: 14, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surface }, split: { gap: 12 }, selected: { minHeight: 64, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, selectedCopy: { flex: 1, gap: 4 }, selectedName: { color: colors.text, fontSize: 16, fontWeight: "800" }, target: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8 }, action: { color: colors.accent, fontWeight: "800" }, toggles: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, toggle: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13 }, toggleActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }, toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, toggleTextActive: { color: colors.accent }, switchRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, switchCopy: { flex: 1 }, save: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent }, savePressed: { backgroundColor: colors.accentPressed }, saveText: { color: colors.background, fontSize: 15, fontWeight: "900" }, pressed: { backgroundColor: colors.surfaceRaised },
});

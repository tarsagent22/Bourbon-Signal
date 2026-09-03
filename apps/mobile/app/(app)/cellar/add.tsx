import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
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
import { collectionMatchForOption, createBottleSearchIndex, rankBottleCatalog } from "../../../src/cellar/bottle-search";
import bottleCatalogSeed from "../../../src/cellar/bottle-catalog-seed.json";
import { EmptyState, ErrorState, LoadingState } from "../../../src/components/MemberScreen";
import { ScoreSlider } from "../../../src/components/ScoreSlider";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import {
  applyBottleContributionIds,
  collectionDisplayKind,
  collectionInventoryLabel,
  createCustomCollectionBottle,
  exactCustomBottleMatchIndex,
  formatCollectionRating,
  TASTE_TAG_OPTIONS,
  upsertCollectionBottle,
} from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

type AddKind = "sealed" | "just_tasted";
const KINDS: Array<{ key: AddKind; label: string }> = [
  { key: "sealed", label: "Add a bottle" },
  { key: "just_tasted", label: "Rate a whiskey" },
];
const CONTEXTS: Array<{ key: NonNullable<MemberCollectionBottle["tastingContext"]>; label: string }> = [
  { key: "bar", label: "Bar" },
  { key: "bottle_share", label: "Bottle share" },
  { key: "friend", label: "Friend" },
  { key: "event", label: "Event" },
  { key: "other", label: "Other" },
];
const COMMON_CUES = TASTE_TAG_OPTIONS.slice(0, 5);
const BOTTLE_CATALOG_SEED = bottleCatalogSeed as RadarBottleOption[];

function metadataForOption(option: RadarBottleOption, bottles: MemberCollectionBottle[]) {
  const existing = collectionMatchForOption(bottles, option);
  if (existing) {
    if (collectionDisplayKind(existing) === "owned") return `Already owned · ${collectionInventoryLabel(existing) || "Inventory on hand"}`;
    return `Tasted only · ${existing.isRated ? `${formatCollectionRating(existing)} rating` : "Unrated"}`;
  }
  return [option.proof ? `${option.proof} proof` : "", option.ageStatement || ""].filter(Boolean).join(" · ") || "Whiskey catalog";
}

export default function AddCellarBottleScreen() {
  const api = useMobileApi();
  const { userId } = useAuth();
  const router = useRouter();
  const receiptStorageKey = bottleContributionReceiptsStorageKey(userId);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferenceError, setPreferenceError] = useState("");
  const [catalog, setCatalog] = useState<RadarBottleOption[]>(BOTTLE_CATALOG_SEED);
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RadarBottleOption | null>(null);
  const [selectedSource, setSelectedSource] = useState<"catalog" | "recent" | null>(null);
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
    let active = true;
    setLoading(true);
    setPreferenceError("");
    void api.getMemberPreferences({ fresh: true }).then((next) => {
      if (active) setPreferences(next);
    }).catch((caught) => {
      if (active) setPreferenceError(caught instanceof Error ? caught.message : "My Shelf is temporarily unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    void api.listBottleCatalog().then((bottles) => {
      if (active && bottles.length) setCatalog(bottles);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);

  useEffect(() => { setFormError(""); }, [customDetail, customName, customProof, isRated, notes, pricePaid, quantity, rating, store, tasteTags, tastingContext]);

  const bottles = preferences?.collectionPreferences.bottles || [];
  const needle = query.replace(/\s+/g, " ").trim();
  const searchIndex = useMemo(() => createBottleSearchIndex(catalog), [catalog]);
  const results = useMemo(() => needle.length >= 2 ? rankBottleCatalog(searchIndex, needle, 12) : [], [needle, searchIndex]);
  const recentBottles = useMemo(() => [...bottles]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 6), [bottles]);
  const cues = useMemo(() => showMoreCues ? TASTE_TAG_OPTIONS : Array.from(new Set([...COMMON_CUES, ...tasteTags])) as typeof TASTE_TAG_OPTIONS[number][], [showMoreCues, tasteTags]);
  const hasBottle = Boolean(selected || custom);
  const selectedMatch = selected ? collectionMatchForOption(bottles, selected) : undefined;
  const customCandidate = useMemo(() => {
    if (!custom || !customName.trim()) return null;
    const proof = customProof.trim() ? Number(customProof) : undefined;
    return createCustomCollectionBottle(
      { name: customName, proof: Number.isFinite(proof) ? proof : undefined, detail: customDetail },
      { kind: "just_tasted" },
      "1970-01-01T00:00:00.000Z",
    );
  }, [custom, customDetail, customName, customProof]);
  const customMatchIndex = customCandidate ? exactCustomBottleMatchIndex(bottles, customCandidate) : -1;
  const customMatch = customMatchIndex >= 0 ? bottles[customMatchIndex] : undefined;
  const currentMatch = selectedMatch || customMatch;
  const ratingEnabled = kind === "just_tasted" || isRated;
  const saveLabel = kind === "sealed"
    ? currentMatch && collectionDisplayKind(currentMatch) === "owned" ? "Add another bottle" : "Add bottle"
    : currentMatch ? "Update rating" : "Add this whiskey";

  function choose(option: RadarBottleOption, source: "catalog" | "recent" = "catalog") {
    Keyboard.dismiss();
    const existing = collectionMatchForOption(bottles, option);
    setSelected(option);
    setSelectedSource(source);
    setCustom(false);
    setQuery(option.name);
    setRating(existing?.rating || 0);
    setIsRated(existing?.isRated === true);
    setTasteTags(existing?.tasteTags || []);
    setNotes(existing?.notes || "");
    setTastingContext(existing?.tastingContext || "bar");
    setFormError("");
  }

  function chooseRecent(bottle: MemberCollectionBottle) {
    choose({ id: bottle.bottleId, name: bottle.bottleName }, "recent");
  }

  function beginCustom() {
    Keyboard.dismiss();
    setSelected(null);
    setSelectedSource(null);
    setCustom(true);
    setCustomName(query.trim());
    setFormError("");
  }

  function changeKind(next: AddKind) {
    Keyboard.dismiss();
    setKind(next);
    if (next === "just_tasted") setIsRated(true);
    setFormError("");
  }

  async function save() {
    if (!preferences || !hasBottle || saving) return;
    const ownedQuantity = Number(quantity);
    const numericPrice = pricePaid.trim() ? Number(pricePaid) : undefined;
    const numericProof = customProof.trim() ? Number(customProof) : undefined;
    if (kind === "sealed" && (!Number.isInteger(ownedQuantity) || ownedQuantity < 1 || ownedQuantity > 999)) { setFormError("Quantity must be a whole number from 1 to 999."); return; }
    if (kind === "sealed" && numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0)) { setFormError("Price paid must be a positive amount."); return; }
    if (custom && !customName.trim()) { setFormError("Whiskey name is required."); return; }
    if (numericProof !== undefined && (!Number.isFinite(numericProof) || numericProof <= 0 || numericProof > 300)) { setFormError("Proof must be a number from 0.1 to 300."); return; }

    const now = new Date().toISOString();
    const input = {
      kind,
      quantity: ownedQuantity,
      pricePaid: kind === "sealed" ? numericPrice : undefined,
      store: kind === "sealed" ? store : undefined,
      tastingContext: kind === "just_tasted" ? tastingContext : undefined,
      rating,
      isRated: ratingEnabled,
      tasteTags: ratingEnabled ? tasteTags : [],
      notes: ratingEnabled ? notes : "",
    };
    let nextBottles: MemberCollectionBottle[];
    let contributionEntry: MemberCollectionBottle | null = null;
    if (selected) {
      nextBottles = upsertCollectionBottle(preferences.collectionPreferences.bottles, selected, input, now, {
        reconcilePendingCustom: selectedSource === "catalog",
      });
    } else {
      const candidate = createCustomCollectionBottle({ name: customName, proof: numericProof, detail: customDetail }, input, now);
      const existingIndex = exactCustomBottleMatchIndex(preferences.collectionPreferences.bottles, candidate);
      if (existingIndex >= 0) {
        const existing = preferences.collectionPreferences.bottles[existingIndex];
        nextBottles = upsertCollectionBottle(preferences.collectionPreferences.bottles, { id: existing.bottleId, name: existing.bottleName }, input, now);
      } else {
        nextBottles = [...preferences.collectionPreferences.bottles, candidate];
        contributionEntry = candidate;
      }
    }

    setSaving(true);
    setFormError("");
    try {
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles: nextBottles, version: preferences.collectionPreferences.version } });
      if (contributionEntry) {
        const entry = contributionEntry;
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

          const contributedBottles = applyBottleContributionIds(saved.collectionPreferences.bottles, new Map([[entry.bottleId, contributionId]]));
          try {
            const contributionSaved = contributedBottles === saved.collectionPreferences.bottles
              ? saved
              : await api.updateMemberPreferences({ collectionPreferences: { bottles: contributedBottles, version: saved.collectionPreferences.version } });
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
            Alert.alert("Bottle added", "Your bottle is safe on My Shelf. We’ll keep working on the match in the background.");
          }
        } catch {
          Alert.alert("Bottle added", "Your bottle is safe on My Shelf. We’ll keep working on the match in the background.");
        }
      }
      router.back();
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) {
        const refreshed = await api.getMemberPreferences({ fresh: true }).catch(() => preferences);
        setPreferences(refreshed);
        setFormError("My Shelf changed elsewhere. It was refreshed; review this whiskey and save again.");
      } else {
        setFormError(caught instanceof Error ? caught.message : "This whiskey could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  return <SafeAreaView edges={["bottom"]} style={styles.screen}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>MY SHELF</Text>
        <Text accessibilityRole="header" style={styles.title}>Add to My Shelf</Text>
        <Text style={styles.description}>Find a whiskey, then add a bottle or save a rating.</Text>
        {loading ? <LoadingState label="Opening My Shelf…" /> : null}
        {preferenceError ? <ErrorState message={preferenceError} onRetry={() => {
          setLoading(true);
          setPreferenceError("");
          void api.getMemberPreferences({ fresh: true }).then(setPreferences).catch((caught) => {
            setPreferenceError(caught instanceof Error ? caught.message : "My Shelf is temporarily unavailable.");
          }).finally(() => setLoading(false));
        }} /> : null}
        {!loading && preferences && preferences.entitlements?.canUseCollection !== true ? <EmptyState title="My Shelf is not included with this membership" detail="Return to Account to review the membership recognized by the app." /> : null}
        {!loading && preferences?.entitlements?.canUseCollection ? <>
          <Field label="Whiskey"><TextInput
            accessibilityLabel="Search bottles"
            autoCapitalize="none"
            autoFocus
            clearButtonMode="while-editing"
            onChangeText={(value) => {
              setQuery(value);
              if (selected && value !== selected.name) setSelected(null);
              if (custom) setCustom(false);
              setFormError("");
            }}
            placeholder="Search bourbon or whiskey"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={query}
          /></Field>


          {!selected && !custom && !needle ? <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recently on My Shelf</Text>
            {recentBottles.length ? <View style={styles.results}>{recentBottles.map((bottle) => <ResultRow key={bottle.bottleId} label={bottle.bottleName} metadata={metadataForOption({ id: bottle.bottleId, name: bottle.bottleName }, bottles)} onPress={() => chooseRecent(bottle)} />)}</View> : <Text style={styles.fieldHelp}>Your recently updated whiskeys will appear here.</Text>}
          </View> : null}

          {!selected && needle.length >= 2 && results.length ? <View accessibilityLabel={custom ? "Near matches" : "Bottle search results"} style={styles.results}>
            {custom ? <Text style={styles.nearTitle}>Near matches</Text> : null}
            {results.map((option) => <ResultRow key={option.id} label={option.name} metadata={metadataForOption(option, bottles)} onPress={() => choose(option)} />)}
          </View> : null}
          {!selected && needle.length >= 2 && !results.length ? <Text style={styles.fieldHelp}>No catalog matches found. You can add this whiskey manually.</Text> : null}

          {!selected && needle.length >= 2 && !custom ? <View style={styles.cantFind}><Text style={styles.cantFindText}>Can’t find it?</Text><Pressable accessibilityRole="button" onPress={beginCustom} style={styles.outlineButton}><Text style={styles.outlineButtonText}>Add this whiskey</Text></Pressable></View> : null}

          {custom ? <View style={styles.customBox}>
            <Text style={styles.sectionTitle}>Whiskey details</Text>
            <Field label="Display name"><TextInput accessibilityLabel="Whiskey display name" onChangeText={setCustomName} placeholder="Required" placeholderTextColor={colors.muted} style={styles.input} value={customName} /></Field>
            <Field label="Proof (optional)"><TextInput accessibilityLabel="Whiskey proof" keyboardType="decimal-pad" onChangeText={setCustomProof} placeholder="101.3" placeholderTextColor={colors.muted} style={styles.input} value={customProof} /></Field>
            <Field label="Age, batch, or finish (optional)"><TextInput accessibilityLabel="Age batch or finish" onChangeText={setCustomDetail} placeholder="Batch 7" placeholderTextColor={colors.muted} style={styles.input} value={customDetail} /></Field>
          </View> : null}

          {selected ? <View style={styles.selected}><View style={styles.selectedCopy}><Text style={styles.fieldHelp}>YOUR WHISKEY</Text><Text style={styles.selectedName}>{selected.name}</Text><Text style={styles.resultMeta}>{metadataForOption(selected, bottles)}</Text></View><Pressable accessibilityRole="button" onPress={() => { setSelected(null); setQuery(""); setFormError(""); }} style={styles.target}><Text style={styles.action}>Change</Text></Pressable></View> : null}

          {hasBottle ? <>
            <Field label="What would you like to do?"><View style={styles.toggles}>{KINDS.map((option) => <Toggle key={option.key} active={kind === option.key} label={option.label} onPress={() => changeKind(option.key)} />)}</View></Field>

            {kind === "sealed" ? <>
              <Field label="Quantity"><TextInput accessibilityLabel="Bottle quantity" keyboardType="number-pad" maxLength={3} onChangeText={setQuantity} style={styles.input} value={quantity} /></Field>
              <DisclosureRow expanded={showAcquisition} label="Acquisition (optional)" onPress={() => setShowAcquisition((current) => !current)} />
              {showAcquisition ? <View style={styles.disclosureBody}><Field label="Price paid"><TextInput accessibilityLabel="Price paid" keyboardType="decimal-pad" onChangeText={setPricePaid} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={pricePaid} /></Field><Field label="Store"><TextInput accessibilityLabel="Store purchased from" onChangeText={setStore} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={store} /></Field></View> : null}
              <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Add a rating</Text><Text style={styles.fieldHelp}>Rate it now, or leave this off and come back after a pour.</Text></View><Switch accessibilityLabel="Add a rating" onValueChange={(next) => { Keyboard.dismiss(); setIsRated(next); }} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={isRated} /></View>
            </> : <Field label="Tasting context"><View style={styles.toggles}>{CONTEXTS.map((context) => <Toggle key={context.key} active={tastingContext === context.key} label={context.label} onPress={() => setTastingContext(context.key)} />)}</View></Field>}

            {ratingEnabled ? <View style={styles.ratingSection}>
              <Text style={styles.sectionTitle}>My rating</Text>
              <ScoreSlider onChange={setRating} onInteractionStart={Keyboard.dismiss} value={rating} />
              <Field label="Quick cues"><View style={styles.toggles}>{cues.map((tag) => <Toggle key={tag} active={tasteTags.includes(tag)} label={tag} onPress={() => setTasteTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}</View></Field>
              {!showMoreCues ? <Pressable accessibilityRole="button" onPress={() => setShowMoreCues(true)} style={styles.target}><Text style={styles.action}>More cues</Text></Pressable> : null}
              <Field label="Notes (optional)"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="What stood out?" placeholderTextColor={colors.muted} style={[styles.input, styles.notes]} value={notes} /></Field>
            </View> : null}

            {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
            <Pressable accessibilityLabel={saveLabel} accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, pressed && styles.savePressed, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? "Saving…" : saveLabel}</Text></Pressable>
          </> : formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
        </> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function ResultRow({ label, metadata, onPress }: { label: string; metadata: string; onPress: () => void }) { return <Pressable accessibilityLabel={`${label}. ${metadata}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.result, pressed && styles.pressed]}><Text style={styles.resultName}>{label}</Text><Text style={styles.resultMeta}>{metadata}</Text></Pressable>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function Toggle({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{active ? `✓ ${label}` : label}</Text></Pressable>; }
function DisclosureRow({ expanded, label, onPress }: { expanded: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={styles.disclosureRow}><Text style={styles.fieldLabel}>{label}</Text><Text aria-hidden style={styles.disclosureGlyph}>{expanded ? "−" : "+"}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 18 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 },
  recentSection: { gap: 10 },
  field: { flex: 1, gap: 8 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  catalogError: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  formError: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  notes: { minHeight: 100, textAlignVertical: "top" },
  results: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  nearTitle: { color: colors.accent, padding: 12, fontSize: 12, fontWeight: "800" },
  result: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  resultName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  resultMeta: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  cantFind: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cantFindText: { color: colors.muted, fontSize: 14 },
  outlineButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderColor: colors.accent, borderWidth: 1, borderRadius: 11 },
  outlineButtonText: { color: colors.accent, fontWeight: "800" },
  customBox: { gap: 14, padding: 14, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surface },
  selected: { minHeight: 68, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  selectedCopy: { flex: 1, gap: 4 },
  selectedName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  target: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8 },
  action: { color: colors.accent, fontWeight: "800" },
  toggles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13 },
  toggleActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  toggleTextActive: { color: colors.accent },
  switchRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  switchCopy: { flex: 1, gap: 3 },
  disclosureRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  disclosureGlyph: { color: colors.accent, fontSize: 24 },
  disclosureBody: { gap: 14 },
  ratingSection: { gap: 16 },
  save: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent },
  savePressed: { backgroundColor: colors.accentPressed },
  saveText: { color: colors.background, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { backgroundColor: colors.surfaceRaised },
});

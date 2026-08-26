import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences, RadarBottleOption } from "../../../src/api/types";
import { EmptyState, ErrorState, LoadingState } from "../../../src/components/MemberScreen";
import { ScoreSlider } from "../../../src/components/ScoreSlider";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { canonicalBottleKey, createCollectionBottle, TASTE_TAG_OPTIONS } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

type AddKind = "sealed" | "opened" | "just_tasted";
const KINDS: Array<{ key: AddKind; label: string }> = [{ key: "sealed", label: "Sealed" }, { key: "opened", label: "Opened" }, { key: "just_tasted", label: "Just tasted" }];
const CONTEXTS: Array<{ key: NonNullable<MemberCollectionBottle["tastingContext"]>; label: string }> = [{ key: "bar", label: "Bar" }, { key: "bottle_share", label: "Bottle share" }, { key: "friend", label: "Friend" }, { key: "event", label: "Event" }, { key: "other", label: "Other" }];

export default function AddCellarBottleScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [catalog, setCatalog] = useState<RadarBottleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RadarBottleOption | null>(null);
  const [kind, setKind] = useState<AddKind>("sealed");
  const [quantity, setQuantity] = useState("1");
  const [pricePaid, setPricePaid] = useState("");
  const [store, setStore] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [tastingContext, setTastingContext] = useState<MemberCollectionBottle["tastingContext"]>("bar");
  const [isRated, setIsRated] = useState(false);
  const [rating, setRating] = useState(0);
  const [tasteTags, setTasteTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [nextPreferences, bottles] = await Promise.all([api.getMemberPreferences({ fresh: true }), api.listRadarBottles({ fresh: true })]);
      setPreferences(nextPreferences); setCatalog(bottles);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The bottle library is temporarily unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || selected) return [];
    return catalog.filter((bottle) => bottle.name.toLowerCase().includes(needle)).slice(0, 30);
  }, [catalog, query, selected]);

  function choose(option: RadarBottleOption) { setSelected(option); setQuery(option.name); setError(""); }

  async function save() {
    if (!preferences || !selected || saving) return;
    const ownedQuantity = Number(quantity);

    const numericPrice = pricePaid.trim() ? Number(pricePaid) : undefined;
    if (kind !== "just_tasted" && (!Number.isInteger(ownedQuantity) || ownedQuantity < 1 || ownedQuantity > 999)) { setError("Quantity must be a whole number from 1 to 999."); return; }
    if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0)) { setError("Price paid must be a positive amount."); return; }
    if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) { setError("Purchase date must use YYYY-MM-DD."); return; }

    const key = canonicalBottleKey(selected.name);
    if (preferences.collectionPreferences.bottles.some((bottle) => bottle.bottleId === selected.id || canonicalBottleKey(bottle.canonicalKey) === key)) { setError("This bottle is already in your Cellar. Open its card to update quantities or tasting history."); return; }
    setSaving(true); setError("");
    try {
      const entry = createCollectionBottle(selected, { kind, quantity: ownedQuantity, pricePaid: numericPrice, store, purchaseDate: purchaseDate || undefined, tastingContext, rating, isRated, tasteTags, notes }, new Date().toISOString());
      await api.updateMemberPreferences({ collectionPreferences: { bottles: [...preferences.collectionPreferences.bottles, entry], version: preferences.collectionPreferences.version } });
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
      <Text style={styles.eyebrow}>CELLAR</Text><Text accessibilityRole="header" style={styles.title}>Add bottle</Text><Text style={styles.description}>Search the canonical bottle library, then record ownership or a tasting.</Text>
      {loading ? <LoadingState label="Loading the bottle library…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void (preferences ? setError("") : load())} /> : null}
      {!loading && preferences?.entitlements?.canUseCollection !== true ? <EmptyState title="Cellar is not included with this membership" detail="Return to HQ to review the membership recognized by the app." /> : null}
      {!loading && preferences?.entitlements?.canUseCollection ? <>
        <Field label="Bottle search"><TextInput accessibilityHint="Searches Bourbon Signal's canonical Radar bottle library" accessibilityLabel="Search canonical bottles" autoCapitalize="none" autoFocus clearButtonMode="while-editing" onChangeText={(value) => { setQuery(value); if (selected && value !== selected.name) setSelected(null); }} placeholder="Search bottle name" placeholderTextColor={colors.muted} style={styles.input} value={query} /></Field>
        {!selected && query.trim() && !results.length ? <EmptyState title="No bottles found" detail="Try a shorter bottle or distillery name." /> : null}
        {results.length ? <View accessibilityLabel="Bottle search results" style={styles.results}>{results.map((option) => <Pressable accessibilityHint="Selects this canonical bottle" accessibilityRole="button" key={option.id} onPress={() => choose(option)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}><Text style={styles.resultName}>{option.name}</Text>{option.rarity ? <Text style={styles.resultMeta}>{option.rarity}</Text> : null}</Pressable>)}</View> : null}
        {selected ? <View style={styles.selected}><View style={styles.selectedCopy}><Text style={styles.fieldHelp}>SELECTED BOTTLE</Text><Text style={styles.selectedName}>{selected.name}</Text></View><Pressable accessibilityRole="button" onPress={() => { setSelected(null); setQuery(""); }} style={styles.target}><Text style={styles.action}>Change</Text></Pressable></View> : null}
        {selected ? <>
          <Field label="Lifecycle"><View style={styles.toggles}>{KINDS.map((option) => <Toggle key={option.key} active={kind === option.key} label={option.label} onPress={() => setKind(option.key)} />)}</View></Field>
          {kind !== "just_tasted" ? <>
            <Field label="Quantity"><TextInput accessibilityLabel="Bottle quantity" keyboardType="number-pad" maxLength={3} onChangeText={setQuantity} style={styles.input} value={quantity} /></Field>
            <Field label="Price paid"><TextInput accessibilityLabel="Price paid" keyboardType="decimal-pad" onChangeText={setPricePaid} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={pricePaid} /></Field>
            <Field label="Store"><TextInput accessibilityLabel="Store purchased from" onChangeText={setStore} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={store} /></Field>
            <Field label="Purchase date"><TextInput accessibilityHint="Use year-month-day format" accessibilityLabel="Purchase date" autoCapitalize="none" onChangeText={setPurchaseDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} value={purchaseDate} /></Field>
          </> : <Field label="Tasting context"><View style={styles.toggles}>{CONTEXTS.map((context) => <Toggle key={context.key} active={tastingContext === context.key} label={context.label} onPress={() => setTastingContext(context.key)} />)}</View></Field>}
          <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Rated</Text><Text style={styles.fieldHelp}>Unrated stays separate from a real 0.0.</Text></View><Switch accessibilityLabel="Add a rating" onValueChange={setIsRated} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={isRated} /></View>
          {isRated ? <ScoreSlider onChange={setRating} value={rating} /> : null}
          <Field label="Taste tags"><View style={styles.toggles}>{TASTE_TAG_OPTIONS.map((tag) => <Toggle key={tag} active={tasteTags.includes(tag)} label={tag} onPress={() => setTasteTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}</View></Field>
          <Field label="Tasting notes"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="Optional notes about the pour" placeholderTextColor={colors.muted} style={[styles.input, styles.notes]} value={notes} /></Field>
          <Pressable accessibilityHint="Saves with the latest loaded collection version" accessibilityLabel="Save bottle to Cellar" accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, pressed && styles.savePressed]}><Text style={styles.saveText}>{saving ? "Saving…" : "Save to Cellar"}</Text></Pressable>
        </> : null}
      </> : null}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function Toggle({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 48, gap: 18 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, fontWeight: "800" }, description: { color: colors.muted, fontSize: 14, lineHeight: 20 }, field: { gap: 8 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" }, fieldHelp: { color: colors.muted, fontSize: 11, lineHeight: 17 }, input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, notes: { minHeight: 110, textAlignVertical: "top" }, results: { maxHeight: 440, borderColor: colors.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" }, result: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, resultName: { color: colors.text, fontSize: 14, fontWeight: "700" }, resultMeta: { color: colors.muted, fontSize: 11, textTransform: "capitalize" }, selected: { minHeight: 64, borderColor: colors.accent, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, selectedCopy: { flex: 1, gap: 4 }, selectedName: { color: colors.text, fontSize: 16, fontWeight: "800" }, target: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, action: { color: colors.accent, fontWeight: "800" }, toggles: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, toggle: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13 }, toggleActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }, toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, toggleTextActive: { color: colors.accent }, switchRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, switchCopy: { flex: 1 }, save: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent }, savePressed: { backgroundColor: colors.accentPressed }, saveText: { color: colors.background, fontSize: 15, fontWeight: "900" }, pressed: { backgroundColor: colors.surfaceRaised },
});

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences } from "../../../src/api/types";
import { EmptyState, ErrorState, LoadingState, MemberCard, memberScreenStyles } from "../../../src/components/MemberScreen";
import { CellarBottleSilhouette } from "../../../src/components/CellarBottleSilhouette";
import { ScoreSlider } from "../../../src/components/ScoreSlider";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import {
  collectionSummary,
  filterAndSortCollection,
  finishCollectionBottle,
  formatCollectionRating,
  TASTE_TAG_OPTIONS,
  type CollectionBottlePatch,
  type CollectionFilters,
  type CollectionSort,
  updateCollectionBottle,
  visibleTasteTags,
} from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const SORTS: Array<{ key: CollectionSort; label: string }> = [
  { key: "recently_updated", label: "Updated" },
  { key: "recently_acquired", label: "Acquired" },
  { key: "rating", label: "Rating" },
  { key: "name", label: "Name" },
];
const STATUSES: Array<{ key: CollectionFilters["status"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "sealed", label: "Sealed" },
  { key: "open", label: "Open" },
  { key: "finished", label: "Finished" },
  { key: "just_tasted", label: "Just tasted" },
];
const DEFAULT_FILTERS: CollectionFilters = { status: "all", minRating: null, buyAgainOnly: false };

export default function CellarScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionSort>("recently_updated");
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<MemberCollectionBottle | null>(null);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try { setPreferences(await api.getMemberPreferences({ fresh })); }
    catch (caught) { setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Your Cellar is temporarily unavailable."); }
    finally { setLoading(false); }
  }, [api]);

  useFocusEffect(useCallback(() => { void load(true); }, [load]));
  const canUseCollection = preferences?.entitlements?.canUseCollection === true;
  const sourceBottles = preferences?.collectionPreferences.bottles || [];
  const summary = useMemo(() => collectionSummary(sourceBottles), [sourceBottles]);
  const bottles = useMemo(() => filterAndSortCollection(sourceBottles, query, sort, filters), [filters, query, sort, sourceBottles]);

  const persist = useCallback(async (nextBottles: MemberCollectionBottle[], conflictMessage: string) => {
    if (!preferences || mutating) return false;
    setMutating(true);
    setError("");
    try {
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles: nextBottles, version: preferences.collectionPreferences.version } });
      setPreferences((current) => current ? { ...current, collectionPreferences: saved.collectionPreferences } : current);
      return true;
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) {
        setSelected(null);
        await load(true);
        setError(conflictMessage);
        return false;
      }
      const message = caught instanceof Error ? caught.message : "That Cellar change could not be saved.";
      setError(message);
      Alert.alert("Cellar change not saved", message);
      return false;
    } finally { setMutating(false); }
  }, [api, load, mutating, preferences]);

  const saveBottle = useCallback(async (patch: CollectionBottlePatch) => {
    if (!preferences || !selected) return;
    const next = updateCollectionBottle(preferences.collectionPreferences.bottles, selected.canonicalKey, patch, new Date().toISOString());
    if (await persist(next, "Your Cellar changed elsewhere. It was refreshed before this edit could be saved.")) setSelected(null);
  }, [persist, preferences, selected]);

  const finishBottle = useCallback(async () => {
    if (!preferences || !selected) return;
    const next = finishCollectionBottle(preferences.collectionPreferences.bottles, selected.canonicalKey, new Date().toISOString());
    if (next === preferences.collectionPreferences.bottles || next.every((item, index) => item === preferences.collectionPreferences.bottles[index])) return;
    if (await persist(next, "Your Cellar changed elsewhere. It was refreshed before the bottle could be finished.")) setSelected(null);
  }, [persist, preferences, selected]);

  const requestDelete = useCallback(() => {
    if (!preferences || !selected || mutating) return;
    Alert.alert(
      "Delete this Cellar history?",
      `${selected.bottleName} and all of its lifecycle, rating, and tasting history will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void (async () => {
          const next = preferences.collectionPreferences.bottles.filter((bottle) => bottle.canonicalKey !== selected.canonicalKey);
          if (await persist(next, "Your Cellar changed elsewhere. It was refreshed before deletion could be saved.")) setSelected(null);
        })() },
      ],
    );
  }, [mutating, persist, preferences, selected]);

  return (
    <>
      <FlatList
        contentContainerStyle={memberScreenStyles.content}
        data={canUseCollection ? bottles : []}
        keyExtractor={(item) => item.canonicalKey}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
        renderItem={({ item }) => <BottleCard bottle={item} onPress={() => setSelected(item)} />}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={<View style={styles.header}>
          <View style={styles.topRow}>
            <View style={styles.topCopy}>
              <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
              <Text style={styles.summaryLine}>{summary.uniqueBourbons} unique · {summary.ownedBottleCount} owned</Text>
              <Text style={styles.summaryDetail}>{summary.averageRating == null ? "No rated pours yet" : `${(summary.averageRating / 10).toFixed(1)} average from ${summary.ratedCount} rated`}</Text>
            </View>
            {canUseCollection ? <Pressable accessibilityHint="Opens the native bottle search and collection form" accessibilityLabel="Add bottle to Cellar" accessibilityRole="button" onPress={() => router.push("/(app)/cellar/add")} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}><Text style={styles.addButtonText}>+ Add bottle</Text></Pressable> : null}
          </View>
          {loading && !preferences ? <LoadingState label="Opening your Cellar…" /> : null}
          {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
          {preferences && !canUseCollection ? <EmptyState title="Cellar is not included with this membership" detail="HQ shows the membership recognized by the app. Saved collection data remains private without collection access." /> : null}
          {preferences && canUseCollection ? <View style={styles.controls}>
            <TextInput accessibilityLabel="Search your Cellar" autoCapitalize="none" clearButtonMode="while-editing" onChangeText={setQuery} placeholder="Search bottles, notes, tags, or stores" placeholderTextColor={colors.muted} style={styles.search} value={query} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {STATUSES.map((status) => <FilterChip key={status.key} active={filters.status === status.key} label={status.label} onPress={() => setFilters((current) => ({ ...current, status: status.key }))} />)}
              <FilterChip active={filters.minRating === 90} label="9.0+" onPress={() => setFilters((current) => ({ ...current, minRating: current.minRating === 90 ? null : 90 }))} />
              <FilterChip active={filters.buyAgainOnly} label="Buy again" onPress={() => setFilters((current) => ({ ...current, buyAgainOnly: !current.buyAgainOnly }))} />
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
              {SORTS.map((item) => <Pressable accessibilityLabel={`Sort by ${item.label}`} accessibilityRole="button" accessibilityState={{ selected: sort === item.key }} key={item.key} onPress={() => setSort(item.key)} style={[styles.sort, sort === item.key && styles.sortActive]}><Text style={[styles.sortText, sort === item.key && styles.sortTextActive]}>{item.label}</Text></Pressable>)}
            </ScrollView>
            <Text style={styles.showing}>{bottles.length === sourceBottles.length ? `${bottles.length} shown` : `${bottles.length} of ${sourceBottles.length}`}</Text>
          </View> : null}
        </View>}
        ListEmptyComponent={preferences && canUseCollection && !loading ? <EmptyState title={sourceBottles.length ? "No bottles match" : "Your Cellar is empty"} detail={sourceBottles.length ? "Clear a filter or try another search." : "Choose Add bottle, then search the canonical bottle library."} /> : null}
        style={memberScreenStyles.screen}
      />
      <BottleEditor bottle={selected} busy={mutating} onClose={() => setSelected(null)} onDelete={requestDelete} onFinish={finishBottle} onSave={saveBottle} />
    </>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={`Filter ${label}`} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text></Pressable>;
}

function lifecycleLabel(bottle: MemberCollectionBottle) {
  const counts = [`${bottle.sealedQuantity} sealed`, `${bottle.openedQuantity} open`, `${bottle.finishedCount} finished`];
  return bottle.tastedOnly ? `Just tasted${bottle.tastingContext ? ` · ${bottle.tastingContext.replace("_", " ")}` : ""}` : counts.join(" · ");
}

function BottleCard({ bottle, onPress }: { bottle: MemberCollectionBottle; onPress: () => void }) {
  const tags = visibleTasteTags(bottle.tasteTags);
  return <Pressable accessibilityHint="Opens the bottle editor" accessibilityLabel={`Edit ${bottle.bottleName}. ${lifecycleLabel(bottle)}. My rating ${formatCollectionRating(bottle)}.`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
    <MemberCard>
      <View style={styles.heading}>
        <CellarBottleSilhouette bottle={bottle} />
        <View style={styles.copy}><Text numberOfLines={2} style={styles.name}>{bottle.bottleName}</Text><Text style={styles.added}>{lifecycleLabel(bottle)}</Text></View>
        <View style={styles.rating}><Text style={styles.ratingValue}>{formatCollectionRating(bottle)}</Text><Text style={styles.ratingLabel}>MY RATING</Text></View>
      </View>
      {tags.visible.length ? <View style={styles.tags}>{tags.visible.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}{tags.hiddenCount ? <Text style={styles.moreTags}>+{tags.hiddenCount}</Text> : null}</View> : null}
      {bottle.notes ? <Text numberOfLines={2} style={styles.notes}>{bottle.notes}</Text> : null}
      <Text style={[styles.buyAgain, bottle.wouldBuyAgain && styles.buyAgainYes]}>{bottle.wouldBuyAgain ? "Would buy again" : "No buy-again preference"}</Text>
    </MemberCard>
  </Pressable>;
}

function BottleEditor({ bottle, busy, onClose, onDelete, onFinish, onSave }: { bottle: MemberCollectionBottle | null; busy: boolean; onClose: () => void; onDelete: () => void; onFinish: () => Promise<void>; onSave: (patch: CollectionBottlePatch) => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [isRated, setIsRated] = useState(false);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [wouldBuyAgain, setWouldBuyAgain] = useState(false);
  const [sealed, setSealed] = useState("0");
  const [opened, setOpened] = useState("0");
  const [finished, setFinished] = useState("0");
  const [pricePaid, setPricePaid] = useState("");
  const [store, setStore] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [tastingContext, setTastingContext] = useState<MemberCollectionBottle["tastingContext"]>();
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!bottle) return;
    setRating(bottle.rating); setIsRated(bottle.isRated); setNotes(bottle.notes || ""); setTags(bottle.tasteTags || []);
    setWouldBuyAgain(Boolean(bottle.wouldBuyAgain)); setSealed(String(bottle.sealedQuantity)); setOpened(String(bottle.openedQuantity)); setFinished(String(bottle.finishedCount));
    setPricePaid(bottle.pricePaid == null ? "" : String(bottle.pricePaid)); setStore(bottle.store || ""); setPurchaseDate(bottle.purchaseDate || ""); setTastingContext(bottle.tastingContext); setSaveError("");
  }, [bottle]);

  async function save() {
    if (!bottle || busy) return;
    const quantities = [sealed, opened, finished].map(Number);
    if (quantities.some((value) => !Number.isInteger(value) || value < 0 || value > 999)) { setSaveError("Lifecycle counts must be whole numbers from 0 to 999."); return; }
    const numericPrice = pricePaid.trim() ? Number(pricePaid) : undefined;
    if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0)) { setSaveError("Price paid must be a positive amount."); return; }
    if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) { setSaveError("Purchase date must use YYYY-MM-DD."); return; }
    setSaveError("");
    await onSave({ rating, isRated, notes, tasteTags: tags, wouldBuyAgain, sealedQuantity: quantities[0], openedQuantity: quantities[1], finishedCount: quantities[2], tastedOnly: bottle.tastedOnly, pricePaid: numericPrice, store, purchaseDate: purchaseDate || undefined, tastingContext });
  }

  const activeOwned = Number(sealed) + Number(opened) > 0;
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(bottle)}>
    <SafeAreaView edges={["top", "bottom"]} style={styles.modalFrame}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalFrame}>
      <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}><Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.modalTarget}><Text style={styles.modalAction}>Cancel</Text></Pressable><Text style={styles.modalTitle}>Bottle details</Text><Pressable accessibilityLabel="Save bottle details" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void save()} style={styles.modalTarget}><Text style={styles.modalAction}>{busy ? "Saving…" : "Save"}</Text></Pressable></View>
        <Text style={styles.editorName}>{bottle?.bottleName}</Text>
        {bottle?.tastedOnly ? <Field label="Tasting context"><View style={styles.toggleGrid}>{(["bar", "bottle_share", "friend", "event", "other"] as const).map((context) => <Toggle key={context} active={tastingContext === context} label={context === "bottle_share" ? "Bottle share" : context[0].toUpperCase() + context.slice(1)} onPress={() => setTastingContext(context)} />)}</View></Field> : <>
          <View style={styles.countRow}><NumberField label="Sealed" value={sealed} onChange={setSealed} /><NumberField label="Opened" value={opened} onChange={setOpened} /><NumberField label="Finished" value={finished} onChange={setFinished} /></View>
          <Field label="Price paid"><TextInput accessibilityLabel="Price paid" keyboardType="decimal-pad" onChangeText={setPricePaid} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={pricePaid} /></Field>
          <Field label="Store"><TextInput accessibilityLabel="Store purchased from" onChangeText={setStore} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={store} /></Field>
          <Field label="Purchase date"><TextInput accessibilityHint="Use year-month-day format" accessibilityLabel="Purchase date" autoCapitalize="none" onChangeText={setPurchaseDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={styles.input} value={purchaseDate} /></Field>
        </>}
        <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Rated</Text><Text style={styles.fieldHelp}>Turn off to keep this pour explicitly unrated.</Text></View><Switch accessibilityLabel="Bottle has a rating" onValueChange={setIsRated} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={isRated} /></View>
        {isRated ? <ScoreSlider onChange={setRating} value={rating} /> : null}
        <Field label="Taste tags"><View style={styles.toggleGrid}>{TASTE_TAG_OPTIONS.map((tag) => <Toggle key={tag} active={tags.includes(tag)} label={tag} onPress={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}</View></Field>
        <Field label="Tasting notes"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="Optional notes about this pour" placeholderTextColor={colors.muted} style={[styles.input, styles.notesInput]} value={notes} /></Field>
        <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Would buy again</Text><Text style={styles.fieldHelp}>Keep this separate from your numeric rating.</Text></View><Switch accessibilityLabel="Would buy this bottle again" onValueChange={setWouldBuyAgain} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={wouldBuyAgain} /></View>
        {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
        {!bottle?.tastedOnly && activeOwned ? <Pressable accessibilityHint="Consumes one opened bottle first, then one sealed bottle, while preserving history" accessibilityRole="button" disabled={busy} onPress={() => void onFinish()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Mark one bottle finished</Text></Pressable> : null}
        <Pressable accessibilityHint="Requires destructive confirmation" accessibilityRole="button" disabled={busy} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>Delete bottle history</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <View style={styles.numberField}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={`${label} quantity`} keyboardType="number-pad" maxLength={3} onChangeText={onChange} style={styles.input} value={value} /></View>; }
function Toggle({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 6 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingTop: 2 }, topCopy: { flex: 1, gap: 4 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, summaryLine: { color: colors.text, fontSize: 18, fontWeight: "800" }, summaryDetail: { color: colors.muted, fontSize: 12 }, addButton: { minHeight: 44, justifyContent: "center", borderRadius: 11, backgroundColor: colors.accent, paddingHorizontal: 14 }, addButtonPressed: { backgroundColor: colors.accentPressed }, addButtonText: { color: colors.background, fontSize: 13, fontWeight: "800" }, controls: { gap: 10 }, gap: { height: 8 }, pressed: { opacity: 0.72 },
  search: { minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 13, fontSize: 14 }, filterRow: { gap: 7, paddingRight: 18 }, filterChip: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12 }, filterChipActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }, filterChipText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, filterChipTextActive: { color: colors.accent }, sorts: { gap: 5, paddingRight: 18 }, sort: { minHeight: 44, justifyContent: "center", borderRadius: 999, paddingHorizontal: 12 }, sortActive: { backgroundColor: colors.surfaceRaised }, sortText: { color: colors.muted, fontSize: 11, fontWeight: "700" }, sortTextActive: { color: colors.text }, showing: { color: colors.muted, fontSize: 11 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 }, copy: { flex: 1, gap: 3 }, name: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: "700" }, added: { color: colors.muted, fontSize: 11, textTransform: "capitalize" }, rating: { minWidth: 62, alignItems: "center" }, ratingValue: { color: colors.accent, fontSize: 19, fontWeight: "800" }, ratingLabel: { color: colors.muted, fontSize: 8, fontWeight: "700", letterSpacing: 0.7 }, tags: { flexDirection: "row", alignItems: "center", gap: 6 }, tag: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }, tagText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, moreTags: { color: colors.muted, fontSize: 10, fontWeight: "700" }, notes: { color: colors.text, fontSize: 12, lineHeight: 17 }, buyAgain: { color: colors.muted, fontSize: 11 }, buyAgainYes: { color: colors.success },
  modalFrame: { flex: 1, backgroundColor: colors.background }, modal: { flexGrow: 1, padding: 20, paddingBottom: 44, gap: 20 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTarget: { minWidth: 64, minHeight: 44, justifyContent: "center" }, modalAction: { color: colors.accent, fontWeight: "700" }, modalTitle: { color: colors.text, fontSize: 16, fontWeight: "800" }, editorName: { color: colors.text, fontSize: 26, fontWeight: "800" }, field: { gap: 7 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" }, fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 17 }, input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, notesInput: { minHeight: 110, textAlignVertical: "top" }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, switchCopy: { flex: 1 }, countRow: { flexDirection: "row", gap: 8 }, numberField: { flex: 1, gap: 7 }, toggleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, toggle: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12 }, toggleActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }, toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, toggleTextActive: { color: colors.accent }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, secondaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderColor: colors.accent, borderWidth: 1 }, secondaryButtonText: { color: colors.accent, fontWeight: "800" }, deleteButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderColor: colors.danger, borderWidth: 1 }, deleteText: { color: colors.danger, fontWeight: "800" },
});

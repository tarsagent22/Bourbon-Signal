import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences } from "../../../src/api/types";
import { EmptyState, ErrorState, LoadingState, MemberCard, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { collectionSummary, filterAndSortCollection, type CollectionFilters, type CollectionSort, updateCollectionBottle, visibleTasteTags } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const SORTS: Array<{ key: CollectionSort; label: string }> = [
  { key: "rating", label: "Top rated" },
  { key: "recent", label: "Recent" },
  { key: "name", label: "A–Z" },
];
const DEFAULT_FILTERS: CollectionFilters = { status: "all", minRating: null, buyAgainOnly: false };

export default function CellarScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionSort>("rating");
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<MemberCollectionBottle | null>(null);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try { setPreferences(await api.getMemberPreferences({ fresh })); }
    catch (caught) { setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Your Cellar is temporarily unavailable."); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(false); }, [load]);
  const canUseCollection = preferences?.entitlements?.canUseCollection === true;
  const sourceBottles = preferences?.collectionPreferences.bottles || [];
  const summary = useMemo(() => collectionSummary(sourceBottles), [sourceBottles]);
  const bottles = useMemo(() => filterAndSortCollection(sourceBottles, query, sort, filters), [filters, query, sort, sourceBottles]);

  const saveBottle = useCallback(async (patch: Pick<MemberCollectionBottle, "rating" | "notes" | "tasteTags" | "wouldBuyAgain" | "opened">) => {
    if (!preferences || !selected) return;
    const nextBottles = updateCollectionBottle(preferences.collectionPreferences.bottles, selected.canonicalKey, patch, new Date().toISOString());
    try {
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles: nextBottles, version: preferences.collectionPreferences.version } });
      setPreferences((current) => current ? { ...current, collectionPreferences: saved.collectionPreferences } : current);
      setSelected(null);
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) {
        setSelected(null);
        await load(true);
        setError("Your Cellar changed elsewhere. It was refreshed before another edit could be saved.");
        return;
      }
      throw caught;
    }
  }, [api, load, preferences, selected]);

  return (
    <>
      <FlatList
        contentContainerStyle={memberScreenStyles.content}
        data={canUseCollection ? bottles : []}
        keyExtractor={(item) => item.canonicalKey}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
        renderItem={({ item }) => <BottleCard bottle={item} onEdit={() => setSelected(item)} />}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={<View style={styles.header}>
          <View style={styles.topRow}>
            <View style={styles.topCopy}>
              <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
              <Text style={styles.summaryLine}>{summary.count} {summary.count === 1 ? "bottle" : "bottles"}{summary.averageRating == null ? "" : ` · ${summary.averageRating} avg`}</Text>
            </View>
            {canUseCollection ? <Pressable accessibilityHint="Opens Signals so you can choose a bottle" accessibilityRole="button" onPress={() => router.push("/(app)/(tabs)")} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}><Text style={styles.addButtonText}>+ Add bottle</Text></Pressable> : null}
          </View>
          {loading && !preferences ? <LoadingState label="Opening your Cellar…" /> : null}
          {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
          {preferences && !canUseCollection ? <EmptyState title="Cellar is not included with this membership" detail="HQ shows the membership recognized by the app. Saved collection data remains private without collection access." /> : null}
          {preferences && canUseCollection ? <View style={styles.controls}>
            <TextInput accessibilityLabel="Search your Cellar" autoCapitalize="none" clearButtonMode="while-editing" onChangeText={setQuery} placeholder="Search bottles, notes, or tags" placeholderTextColor={colors.muted} style={styles.search} value={query} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(["all", "unopened", "opened"] as const).map((status) => <FilterChip key={status} active={filters.status === status} label={status === "all" ? "All" : status === "opened" ? "Opened" : "Unopened"} onPress={() => setFilters((current) => ({ ...current, status }))} />)}
              <FilterChip active={filters.minRating === 90} label="90+" onPress={() => setFilters((current) => ({ ...current, minRating: current.minRating === 90 ? null : 90 }))} />
              <FilterChip active={filters.buyAgainOnly} label="Buy again" onPress={() => setFilters((current) => ({ ...current, buyAgainOnly: !current.buyAgainOnly }))} />
            </ScrollView>
            <View style={styles.sortBar}>
              <Text style={styles.showing}>{bottles.length === sourceBottles.length ? `${bottles.length} shown` : `${bottles.length} of ${sourceBottles.length}`}</Text>
              <View style={styles.sorts}>{SORTS.map((item) => <Pressable accessibilityRole="button" accessibilityState={{ selected: sort === item.key }} key={item.key} onPress={() => setSort(item.key)} style={[styles.sort, sort === item.key && styles.sortActive]}><Text style={[styles.sortText, sort === item.key && styles.sortTextActive]}>{item.label}</Text></Pressable>)}</View>
            </View>
          </View> : null}
        </View>}
        ListEmptyComponent={preferences && canUseCollection && !loading ? <EmptyState title={sourceBottles.length ? "No bottles match" : "Your Cellar is empty"} detail={sourceBottles.length ? "Clear a filter or try another search." : "Choose Add bottle, then select a bottle from Signals."} /> : null}
        style={memberScreenStyles.screen}
      />
      <BottleEditor bottle={selected} onClose={() => setSelected(null)} onSave={saveBottle} />
    </>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text></Pressable>;
}

function BottleGlyph() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bottleThumb}><View style={styles.bottleCap} /><View style={styles.bottleNeck} /><View style={styles.bottleBody}><View style={styles.bottleLabel} /></View></View>;
}

function BottleCard({ bottle, onEdit }: { bottle: MemberCollectionBottle; onEdit: () => void }) {
  const tags = visibleTasteTags(bottle.tasteTags);
  return <MemberCard>
    <View style={styles.heading}>
      <BottleGlyph />
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.name}>{bottle.bottleName}</Text>
        <Text style={styles.added}>{bottle.opened ? "Opened" : "Unopened"} · Added {new Date(bottle.addedAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.rating}><Text style={styles.ratingValue}>{bottle.rating || "—"}</Text><Text style={styles.ratingLabel}>RATING</Text></View>
    </View>
    {tags.visible.length ? <View style={styles.tags}>{tags.visible.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}{tags.hiddenCount ? <Text style={styles.moreTags}>+{tags.hiddenCount}</Text> : null}</View> : null}
    {bottle.notes ? <Text numberOfLines={1} style={styles.notes}>{bottle.notes}</Text> : null}
    <View style={styles.cardFooter}>
      <Text style={[styles.buyAgain, bottle.wouldBuyAgain && styles.buyAgainYes]}>{bottle.wouldBuyAgain ? "Would buy again" : "No buy-again preference"}</Text>
      <Pressable accessibilityLabel={`Edit ${bottle.bottleName}`} accessibilityHint="Opens bottle details" accessibilityRole="button" onPress={onEdit} hitSlop={8} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}><Text style={styles.editText}>Edit</Text></Pressable>
    </View>
  </MemberCard>;
}

function BottleEditor({ bottle, onClose, onSave }: { bottle: MemberCollectionBottle | null; onClose: () => void; onSave: (patch: Pick<MemberCollectionBottle, "rating" | "notes" | "tasteTags" | "wouldBuyAgain" | "opened">) => Promise<void> }) {
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [wouldBuyAgain, setWouldBuyAgain] = useState(false);
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!bottle) return;
    setRating(bottle.rating ? String(bottle.rating) : "");
    setNotes(bottle.notes || "");
    setTags((bottle.tasteTags || []).join(", "));
    setWouldBuyAgain(Boolean(bottle.wouldBuyAgain));
    setOpened(bottle.opened === true);
    setSaveError("");
  }, [bottle]);

  async function save() {
    if (!bottle || saving) return;
    const numericRating = rating.trim() ? Number(rating) : 0;
    if (!Number.isFinite(numericRating) || numericRating < 0 || numericRating > 100) { setSaveError("Rating must be between 0 and 100."); return; }
    setSaving(true); setSaveError("");
    try { await onSave({ rating: numericRating, notes, tasteTags: tags.split(","), wouldBuyAgain, opened }); }
    catch (caught) { setSaveError(caught instanceof Error ? caught.message : "That bottle could not be saved."); }
    finally { setSaving(false); }
  }

  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(bottle)}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalFrame}>
    <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
      <View style={styles.modalHeader}><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalTarget}><Text style={styles.modalAction}>Cancel</Text></Pressable><Text style={styles.modalTitle}>Bottle details</Text><Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={save} style={styles.modalTarget}><Text style={styles.modalAction}>{saving ? "Saving…" : "Save"}</Text></Pressable></View>
      <Text style={styles.editorName}>{bottle?.bottleName}</Text>
      <View style={styles.switchRow}><View><Text style={styles.fieldLabel}>Bottle opened</Text><Text style={styles.fieldHelp}>Use this to separate shelf bottles from active pours.</Text></View><Switch accessibilityLabel="Bottle opened" onValueChange={setOpened} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={opened} /></View>
      <Field label="Rating (0–100)"><TextInput accessibilityLabel="Rating from 0 to 100" keyboardType="number-pad" maxLength={3} onChangeText={setRating} placeholder="Not rated" placeholderTextColor={colors.muted} style={styles.input} value={rating} /></Field>
      <Field label="Taste tags"><TextInput accessibilityLabel="Taste tags separated by commas" onChangeText={setTags} placeholder="Caramel, oak, vanilla" placeholderTextColor={colors.muted} style={styles.input} value={tags} /></Field>
      <Field label="Tasting notes"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="What stood out?" placeholderTextColor={colors.muted} style={[styles.input, styles.notesInput]} value={notes} /></Field>
      <View style={styles.switchRow}><View><Text style={styles.fieldLabel}>Would buy again</Text><Text style={styles.fieldHelp}>Use this as a deliberate preference, not a rating substitute.</Text></View><Switch accessibilityLabel="Would buy this bottle again" onValueChange={setWouldBuyAgain} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={wouldBuyAgain} /></View>
      {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
    </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 6 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingTop: 2 }, topCopy: { flex: 1, gap: 4 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, summaryLine: { color: colors.text, fontSize: 18, fontWeight: "800" }, addButton: { minHeight: 44, justifyContent: "center", borderRadius: 11, backgroundColor: colors.accent, paddingHorizontal: 14 }, addButtonPressed: { backgroundColor: colors.accentPressed }, addButtonText: { color: colors.background, fontSize: 13, fontWeight: "800" }, controls: { gap: 10 }, gap: { height: 8 }, pressed: { opacity: 0.72 },
  search: { minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 13, fontSize: 14 }, filterRow: { gap: 7, paddingRight: 18 }, filterChip: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12 }, filterChipActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }, filterChipText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, filterChipTextActive: { color: colors.accent },
  sortBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, showing: { color: colors.muted, fontSize: 11 }, sorts: { flexDirection: "row", gap: 5 }, sort: { minHeight: 44, justifyContent: "center", borderRadius: 999, paddingHorizontal: 9 }, sortActive: { backgroundColor: colors.surfaceRaised }, sortText: { color: colors.muted, fontSize: 11, fontWeight: "700" }, sortTextActive: { color: colors.text },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 }, bottleThumb: { width: 38, height: 54, alignItems: "center", justifyContent: "flex-end", borderRadius: 10, backgroundColor: colors.surfaceRaised, paddingBottom: 6 }, bottleCap: { width: 10, height: 4, borderRadius: 2, backgroundColor: colors.accent }, bottleNeck: { width: 8, height: 9, backgroundColor: colors.muted }, bottleBody: { width: 20, height: 28, borderRadius: 5, borderColor: colors.muted, borderWidth: 1, alignItems: "center", justifyContent: "center" }, bottleLabel: { width: 12, height: 8, borderRadius: 2, backgroundColor: colors.accent }, copy: { flex: 1, gap: 3 }, name: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: "700" }, added: { color: colors.muted, fontSize: 11 },
  rating: { minWidth: 42, alignItems: "center" }, ratingValue: { color: colors.accent, fontSize: 19, fontWeight: "800" }, ratingLabel: { color: colors.muted, fontSize: 8, fontWeight: "700", letterSpacing: 0.7 }, tags: { flexDirection: "row", alignItems: "center", gap: 6 }, tag: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }, tagText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, moreTags: { color: colors.muted, fontSize: 10, fontWeight: "700" }, notes: { color: colors.text, fontSize: 12, lineHeight: 17 }, cardFooter: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, buyAgain: { color: colors.muted, fontSize: 11 }, buyAgainYes: { color: colors.success }, editButton: { minWidth: 48, minHeight: 32, alignItems: "flex-end", justifyContent: "center" }, editText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  modalFrame: { flex: 1, backgroundColor: colors.background }, modal: { flexGrow: 1, backgroundColor: colors.background, padding: 20, paddingBottom: 44, gap: 20 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTarget: { minWidth: 64, minHeight: 44, justifyContent: "center" }, modalAction: { color: colors.accent, fontWeight: "700" }, modalTitle: { color: colors.text, fontSize: 16, fontWeight: "800" }, editorName: { color: colors.text, fontSize: 26, fontWeight: "800" },
  field: { gap: 7 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" }, fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 17, maxWidth: 270 }, input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, notesInput: { minHeight: 110, textAlignVertical: "top" }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});

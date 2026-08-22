import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences } from "../../../src/api/types";
import { EmptyState, ErrorState, LoadingState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { filterAndSortCollection, type CollectionSort, updateCollectionBottle } from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const SORTS: Array<{ key: CollectionSort; label: string }> = [
  { key: "rating", label: "Top rated" },
  { key: "recent", label: "Recent" },
  { key: "name", label: "A–Z" },
];

export default function CellarScreen() {
  const api = useMobileApi();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionSort>("rating");
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
  const bottles = useMemo(() => filterAndSortCollection(sourceBottles, query, sort), [query, sort, sourceBottles]);

  const saveBottle = useCallback(async (patch: Pick<MemberCollectionBottle, "rating" | "notes" | "tasteTags" | "wouldBuyAgain">) => {
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
        renderItem={({ item }) => <BottleCard bottle={item} onPress={() => setSelected(item)} />}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={<View style={styles.header}>
          <ScreenIntro eyebrow="Your bottles" title="Cellar" description="Your bottles, ratings, and tasting notes." />
          {loading && !preferences ? <LoadingState label="Opening your Cellar…" /> : null}
          {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
          {preferences && !canUseCollection ? <EmptyState title="Cellar is not included with this membership" detail="HQ shows the membership recognized by the app. Saved collection data remains private without collection access." /> : null}
          {preferences && canUseCollection ? <View style={styles.controls}>
            <SectionTitle detail={`${bottles.length} of ${sourceBottles.length}`}>Collection</SectionTitle>
            <TextInput accessibilityLabel="Search your Cellar" autoCapitalize="none" clearButtonMode="while-editing" onChangeText={setQuery} placeholder="Search bottles, notes, or tags" placeholderTextColor={colors.muted} style={styles.search} value={query} />
            <View style={styles.sorts}>{SORTS.map((item) => <Pressable accessibilityRole="button" accessibilityState={{ selected: sort === item.key }} key={item.key} onPress={() => setSort(item.key)} style={[styles.sort, sort === item.key && styles.sortActive]}><Text style={[styles.sortText, sort === item.key && styles.sortTextActive]}>{item.label}</Text></Pressable>)}</View>
          </View> : null}
        </View>}
        ListEmptyComponent={preferences && canUseCollection && !loading ? <EmptyState title={sourceBottles.length ? "No bottles match" : "Your Cellar is empty"} detail={sourceBottles.length ? "Try another bottle name, note, or taste tag." : "Add a bottle from a Signal to start your collection."} /> : null}
        style={memberScreenStyles.screen}
      />
      <BottleEditor bottle={selected} onClose={() => setSelected(null)} onSave={saveBottle} />
    </>
  );
}

function BottleCard({ bottle, onPress }: { bottle: MemberCollectionBottle; onPress: () => void }) {
  const tags = bottle.tasteTags?.filter(Boolean).slice(0, 4) || [];
  return <Pressable accessibilityHint="Opens tasting details for editing" accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
    <MemberCard>
      <View style={styles.heading}>
        <View style={styles.copy}><Text style={styles.name}>{bottle.bottleName}</Text><Text style={styles.added}>Added {new Date(bottle.addedAt).toLocaleDateString()} · Tap to edit</Text></View>
        <View style={styles.rating}><Text style={styles.ratingValue}>{bottle.rating || "—"}</Text><Text style={styles.ratingLabel}>RATING</Text></View>
      </View>
      {tags.length ? <View style={styles.tags}>{tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View> : null}
      {bottle.notes ? <Text numberOfLines={2} style={styles.notes}>{bottle.notes}</Text> : null}
      <Text style={[styles.buyAgain, bottle.wouldBuyAgain && styles.buyAgainYes]}>{bottle.wouldBuyAgain ? "Would buy again" : "No buy-again preference"}</Text>
    </MemberCard>
  </Pressable>;
}

function BottleEditor({ bottle, onClose, onSave }: { bottle: MemberCollectionBottle | null; onClose: () => void; onSave: (patch: Pick<MemberCollectionBottle, "rating" | "notes" | "tasteTags" | "wouldBuyAgain">) => Promise<void> }) {
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [wouldBuyAgain, setWouldBuyAgain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!bottle) return;
    setRating(bottle.rating ? String(bottle.rating) : "");
    setNotes(bottle.notes || "");
    setTags((bottle.tasteTags || []).join(", "));
    setWouldBuyAgain(Boolean(bottle.wouldBuyAgain));
    setSaveError("");
  }, [bottle]);

  async function save() {
    if (!bottle || saving) return;
    const numericRating = rating.trim() ? Number(rating) : 0;
    if (!Number.isFinite(numericRating) || numericRating < 0 || numericRating > 100) { setSaveError("Rating must be between 0 and 100."); return; }
    setSaving(true); setSaveError("");
    try { await onSave({ rating: numericRating, notes, tasteTags: tags.split(","), wouldBuyAgain }); }
    catch (caught) { setSaveError(caught instanceof Error ? caught.message : "That bottle could not be saved."); }
    finally { setSaving(false); }
  }

  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(bottle)}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalFrame}>
    <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
      <View style={styles.modalHeader}><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalTarget}><Text style={styles.modalAction}>Cancel</Text></Pressable><Text style={styles.modalTitle}>Bottle details</Text><Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={save} style={styles.modalTarget}><Text style={styles.modalAction}>{saving ? "Saving…" : "Save"}</Text></Pressable></View>
      <Text style={styles.editorName}>{bottle?.bottleName}</Text>
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
  header: { gap: 18, marginBottom: 10 }, controls: { gap: 10 }, gap: { height: 10 }, pressed: { opacity: 0.72 },
  search: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 15 },
  sorts: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, sort: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13 }, sortActive: { backgroundColor: colors.accent, borderColor: colors.accent }, sortText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, sortTextActive: { color: colors.background },
  heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }, copy: { flex: 1, gap: 4 }, name: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" }, added: { color: colors.muted, fontSize: 12 },
  rating: { minWidth: 52, alignItems: "center", borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 13 }, ratingValue: { color: colors.accent, fontSize: 22, fontWeight: "800" }, ratingLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, tag: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, tagText: { color: colors.muted, fontSize: 11, fontWeight: "600" }, notes: { color: colors.text, fontSize: 13, lineHeight: 19 }, buyAgain: { color: colors.muted, fontSize: 12 }, buyAgainYes: { color: colors.success },
  modalFrame: { flex: 1, backgroundColor: colors.background }, modal: { flexGrow: 1, backgroundColor: colors.background, padding: 20, paddingBottom: 44, gap: 20 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTarget: { minWidth: 64, minHeight: 44, justifyContent: "center" }, modalAction: { color: colors.accent, fontWeight: "700" }, modalTitle: { color: colors.text, fontSize: 16, fontWeight: "800" }, editorName: { color: colors.text, fontSize: 26, fontWeight: "800" },
  field: { gap: 7 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" }, fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 17, maxWidth: 270 }, input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, notesInput: { minHeight: 110, textAlignVertical: "top" }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});

import { useAuth } from "@clerk/expo";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences } from "../../../src/api/types";
import {
  bottleContributionReceiptsStorageKey,
  mergeBottleContributionReceipt,
  parseBottleContributionReceipts,
  removeBottleContributionReceipts,
  serializeBottleContributionReceipts,
  type BottleContributionReceipts,
} from "../../../src/cellar/contribution-receipts";
import { EmptyState, ErrorState, LoadingState, MemberCard, memberScreenStyles } from "../../../src/components/MemberScreen";
import { CellarBottleSilhouette } from "../../../src/components/CellarBottleSilhouette";
import { ScoreSlider } from "../../../src/components/ScoreSlider";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import {
  activeCollectionRefinementCount, applyBottleContributionIds, collectionInventoryLabel, collectionSummary,
  filterAndSortCollection, formatCollectionRating, projectCollectionBottles, shortCollectionDate, TASTE_TAG_OPTIONS,
  type CollectionBottlePatch, type CollectionFilters, type CollectionSort, updateCollectionBottle,
} from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

type CellarMode = "owned" | "tastings";
const DEFAULT_FILTERS: CollectionFilters = { status: "all", minRating: null, buyAgainOnly: false };
const COMMON_CUES = TASTE_TAG_OPTIONS.slice(0, 5);

async function readContributionReceipts(storageKey: string) {
  if (!storageKey) return { available: false, receipts: new Map<string, string>() };
  try {
    return {
      available: true,
      receipts: parseBottleContributionReceipts(await SecureStore.getItemAsync(storageKey)),
    };
  } catch {
    return { available: false, receipts: new Map<string, string>() };
  }
}

async function writeContributionReceipts(storageKey: string, receipts: BottleContributionReceipts) {
  if (!storageKey) return false;
  try {
    if (receipts.size) await SecureStore.setItemAsync(storageKey, serializeBottleContributionReceipts(receipts));
    else await SecureStore.deleteItemAsync(storageKey);
    return true;
  } catch {
    return false;
  }
}

export default function CellarScreen() {
  const api = useMobileApi();
  const { userId } = useAuth();
  const router = useRouter();
  const receiptStorageKey = bottleContributionReceiptsStorageKey(userId);
  const { width, fontScale } = useWindowDimensions();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<CellarMode>("owned");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionSort>("recently_rated");
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_FILTERS);
  const [refineOpen, setRefineOpen] = useState(false);
  const [selected, setSelected] = useState<MemberCollectionBottle | null>(null);
  const [mutating, setMutating] = useState(false);
  const reportedPendingBottleIds = useRef(new Set<string>());

  const persistContributionIds = useCallback(async (snapshot: MemberPreferences, contributionIds: ReadonlyMap<string, string>) => {
    let base = snapshot;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const bottles = applyBottleContributionIds(base.collectionPreferences.bottles, contributionIds);
      if (bottles === base.collectionPreferences.bottles) return base;
      try {
        const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles, version: base.collectionPreferences.version } });
        const next = { ...base, collectionPreferences: saved.collectionPreferences };
        setPreferences((current) => !current || current.collectionPreferences.version === base.collectionPreferences.version ? next : current);
        return next;
      } catch (caught) {
        if (attempt === 0 && caught instanceof MobileApiError && caught.status === 409) {
          try {
            base = await api.getMemberPreferences({ fresh: true });
            setPreferences((current) => !current || current.collectionPreferences.version <= base.collectionPreferences.version ? base : current);
          } catch {
            return base;
          }
        } else return base;
      }
    }
    return base;
  }, [api]);

  const retryPendingContributions = useCallback((snapshot: MemberPreferences, storedReceipts: ReadonlyMap<string, string>) => {
    void (async () => {
      let receipts = storedReceipts;
      let base = await persistContributionIds(snapshot, receipts);
      const alreadyPersisted = [...receipts].filter(([bottleId, contributionId]) => base.collectionPreferences.bottles.some((bottle) => bottle.bottleId === bottleId && bottle.bottleContributionId === contributionId)).map(([bottleId]) => bottleId);
      if (alreadyPersisted.length) {
        const remaining = removeBottleContributionReceipts(receipts, alreadyPersisted);
        if (await writeContributionReceipts(receiptStorageKey, remaining)) receipts = remaining;
      }

      const pendingReports = base.collectionPreferences.bottles.filter((bottle) => bottle.pendingCanonicalMatch && !bottle.bottleContributionId && !receipts.has(bottle.bottleId) && !reportedPendingBottleIds.current.has(bottle.bottleId));
      pendingReports.forEach((bottle) => reportedPendingBottleIds.current.add(bottle.bottleId));
      const contributionIds = new Map<string, string>();
      for (const bottle of pendingReports) {
        try {
          const response = await api.submitBottleContribution(
            { rawName: bottle.bottleName.split(" · ")[0], source: "collection", context: { retry: true } },
            `cellar-${bottle.bottleId}`,
          );
          const nextReceipts = mergeBottleContributionReceipt(receipts, bottle.bottleId, response.contribution.id);
          contributionIds.set(bottle.bottleId, nextReceipts.get(bottle.bottleId)!);
          if (await writeContributionReceipts(receiptStorageKey, nextReceipts)) receipts = nextReceipts;
        } catch {
          reportedPendingBottleIds.current.delete(bottle.bottleId);
        }
      }
      if (!contributionIds.size) return;

      base = await persistContributionIds(base, contributionIds);
      const persisted = [...contributionIds].filter(([bottleId, contributionId]) => base.collectionPreferences.bottles.some((bottle) => bottle.bottleId === bottleId && bottle.bottleContributionId === contributionId)).map(([bottleId]) => bottleId);
      if (persisted.length) {
        const remaining = removeBottleContributionReceipts(receipts, persisted);
        if (remaining !== receipts && await writeContributionReceipts(receiptStorageKey, remaining)) receipts = remaining;
      }
    })();
  }, [api, persistContributionIds, receiptStorageKey]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError("");
    try {
      const receiptRead = await readContributionReceipts(receiptStorageKey);
      const nextPreferences = await api.getMemberPreferences({ fresh });
      setPreferences(nextPreferences);
      retryPendingContributions(nextPreferences, receiptRead.receipts);
    }
    catch (caught) { setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Your Cellar is temporarily unavailable."); }
    finally { setLoading(false); }
  }, [api, receiptStorageKey, retryPendingContributions]);
  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  const canUseCollection = preferences?.entitlements?.canUseCollection === true;
  const sourceBottles = preferences?.collectionPreferences.bottles || [];
  const summary = useMemo(() => collectionSummary(sourceBottles), [sourceBottles]);
  const modeBottles = useMemo(() => projectCollectionBottles(sourceBottles, mode), [mode, sourceBottles]);
  const bottles = useMemo(() => filterAndSortCollection(modeBottles, query, sort, filters), [filters, modeBottles, query, sort]);
  const numColumns = mode === "owned" && width >= 340 && fontScale < 1.35 ? 2 : 1;
  const tileWidth = numColumns === 2 ? (width - 36 - 10) / 2 : undefined;
  const refinementCount = activeCollectionRefinementCount(filters, sort);
  const resultSetChanged = Boolean(query.trim() || refinementCount);

  const persist = useCallback(async (nextBottles: MemberCollectionBottle[], conflictMessage: string) => {
    if (!preferences || mutating) return false;
    setMutating(true); setError("");
    try {
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles: nextBottles, version: preferences.collectionPreferences.version } });
      setPreferences((current) => current ? { ...current, collectionPreferences: saved.collectionPreferences } : current);
      return true;
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) { setSelected(null); await load(true); setError(conflictMessage); return false; }
      const message = caught instanceof Error ? caught.message : "That Cellar change could not be saved.";
      setError(message); Alert.alert("Cellar change not saved", message); return false;
    } finally { setMutating(false); }
  }, [api, load, mutating, preferences]);

  const saveBottle = useCallback(async (patch: CollectionBottlePatch) => {
    if (!preferences || !selected) return;
    const next = updateCollectionBottle(preferences.collectionPreferences.bottles, selected.canonicalKey, patch, new Date().toISOString());
    if (await persist(next, "Your Cellar changed elsewhere. It was refreshed before this edit could be saved.")) setSelected(null);
  }, [persist, preferences, selected]);

  const requestDelete = useCallback(() => {
    if (!preferences || !selected || mutating) return;
    Alert.alert("Delete this Cellar history?", `${selected.bottleName} and all of its lifecycle, rating, and tasting history will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        const next = preferences.collectionPreferences.bottles.filter((bottle) => bottle.canonicalKey !== selected.canonicalKey);
        if (await persist(next, "Your Cellar changed elsewhere. It was refreshed before deletion could be saved.")) setSelected(null);
      })() },
    ]);
  }, [mutating, persist, preferences, selected]);

  function changeMode(next: CellarMode) {
    setMode(next); setFilters(DEFAULT_FILTERS); setSort("recently_rated");
  }

  return <>
    <FlatList
      key={`${mode}-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
      contentContainerStyle={[memberScreenStyles.content, numColumns > 1 && styles.gridContent]}
      data={canUseCollection ? bottles : []}
      keyExtractor={(item) => item.canonicalKey}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
      renderItem={({ item }) => mode === "owned" ? <BottleTile bottle={item} onPress={() => setSelected(item)} width={tileWidth} /> : <TastingRow bottle={item} onPress={() => setSelected(item)} />}
      ItemSeparatorComponent={numColumns === 1 ? () => <View style={styles.gap} /> : undefined}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.topRow}><View style={styles.topCopy}><Text style={styles.eyebrow}>YOUR CELLAR</Text><Text style={styles.summaryLine}>{summary.ownedBottleCount} bottles · {summary.ratedCount} rated</Text><Text style={styles.summaryDetail}>{summary.averageRating == null ? "No rated pours yet" : `${(summary.averageRating / 10).toFixed(1)} average rating`}</Text></View>{canUseCollection ? <Pressable accessibilityLabel="Add bottle to Cellar" accessibilityRole="button" onPress={() => router.push("/(app)/cellar/add")} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}><Text style={styles.addButtonText}>+ Add</Text></Pressable> : null}</View>
        {loading && !preferences ? <LoadingState label="Opening your Cellar…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
        {preferences && !canUseCollection ? <EmptyState title="Cellar is not included with this membership" detail="HQ shows the membership recognized by the app. Saved collection data remains private without collection access." /> : null}
        {preferences && canUseCollection ? <><View accessibilityLabel="Cellar mode" style={styles.modeSwitch}><ModeButton active={mode === "owned"} label="My bottles" onPress={() => changeMode("owned")} /><ModeButton active={mode === "tastings"} label="Tastings" onPress={() => changeMode("tastings")} /></View><View style={styles.controlRow}><TextInput accessibilityLabel="Search your Cellar" autoCapitalize="none" clearButtonMode="while-editing" onChangeText={setQuery} placeholder={mode === "owned" ? "Search my bottles" : "Search tastings"} placeholderTextColor={colors.muted} style={styles.search} value={query} /><Pressable accessibilityLabel={refinementCount ? `Refine, ${refinementCount} active` : "Refine"} accessibilityRole="button" onPress={() => setRefineOpen(true)} style={styles.refineButton}><Text style={styles.refineText}>Refine{refinementCount ? ` (${refinementCount})` : ""}</Text></Pressable></View>{resultSetChanged ? <Text style={styles.showing}>{bottles.length} shown</Text> : null}</> : null}
      </View>}
      ListEmptyComponent={preferences && canUseCollection && !loading ? <EmptyState title={modeBottles.length ? "No bottles match" : mode === "owned" ? "No bottles on hand" : "No tastings yet"} detail={modeBottles.length ? "Clear the search or refine choices." : mode === "owned" ? "Choose Add to save a bottle you own." : "Finished bottles and just-tasted pours appear here."} /> : null}
      style={memberScreenStyles.screen}
    />
    <RefineSheet filters={filters} mode={mode} onChange={setFilters} onClose={() => setRefineOpen(false)} onSort={setSort} sort={sort} visible={refineOpen} />
    <BottleEditor bottle={selected} busy={mutating} onClose={() => setSelected(null)} onDelete={requestDelete} onSave={saveBottle} />
  </>;
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}><Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text></Pressable>; }

function BottleTile({ bottle, onPress, width }: { bottle: MemberCollectionBottle; onPress: () => void; width?: number }) {
  const inventory = collectionInventoryLabel(bottle);
  const buyAgain = bottle.wouldBuyAgain === true ? "Buy again" : bottle.wouldBuyAgain === false ? "Wouldn’t buy again" : "";
  return <Pressable accessibilityLabel={`Edit ${bottle.bottleName}. ${inventory}. ${bottle.isRated ? `My rating ${formatCollectionRating(bottle)}` : "Unrated"}. ${buyAgain}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tile, width !== undefined && { flex: 0, width }, pressed && styles.pressed]}><CellarBottleSilhouette /><Text numberOfLines={2} style={styles.tileName}>{bottle.bottleName}</Text><Text style={styles.tileRating}>{bottle.isRated ? `My rating ${formatCollectionRating(bottle)}` : "Unrated"}</Text>{inventory ? <Text style={styles.inventory}>{inventory}</Text> : null}{buyAgain ? <Text style={styles.preference}>{buyAgain}</Text> : null}</Pressable>;
}

function TastingRow({ bottle, onPress }: { bottle: MemberCollectionBottle; onPress: () => void }) {
  const date = shortCollectionDate(bottle.ratedAt);
  const context = bottle.tastedOnly ? bottle.tastingContext?.replace("_", " ") : bottle.finishedCount ? bottle.finishedCount === 1 ? "Finished bottle" : `${bottle.finishedCount} finished bottles` : "";
  const buyAgain = bottle.wouldBuyAgain === true ? "Buy again" : bottle.wouldBuyAgain === false ? "Wouldn’t buy again" : "";
  const cues = (bottle.tasteTags || []).slice(0, 3).join(" · ");
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tastingRow, pressed && styles.pressed]}><View style={styles.tastingCopy}><Text numberOfLines={1} style={styles.tastingName}>{bottle.bottleName}</Text><Text style={styles.tastingMeta}>{[date ? `Rated ${date}` : "", context, buyAgain].filter(Boolean).join(" · ")}</Text>{cues ? <Text numberOfLines={1} style={styles.tastingCues}>{cues}</Text> : null}</View><Text style={styles.tastingScore}>{formatCollectionRating(bottle)}</Text></Pressable>;
}

function RefineSheet({ filters, mode, onChange, onClose, onSort, sort, visible }: { filters: CollectionFilters; mode: CellarMode; onChange: (next: CollectionFilters) => void; onClose: () => void; onSort: (next: CollectionSort) => void; sort: CollectionSort; visible: boolean }) {
  const statuses = mode === "owned" ? [{ key: "all", label: "All owned" }, { key: "open", label: "Open now" }, { key: "sealed", label: "Sealed backups" }] as const : [{ key: "all", label: "All" }, { key: "just_tasted", label: "Just tasted" }, { key: "finished", label: "Finished" }] as const;
  const sorts = [{ key: "recently_rated", label: "Recently rated" }, { key: "rating", label: "Rating" }, { key: "name", label: "Name" }] as const;
  const contexts = [{ key: "bar", label: "Bar" }, { key: "bottle_share", label: "Bottle share" }, { key: "friend", label: "Friend" }, { key: "event", label: "Event" }, { key: "other", label: "Other" }] as const;
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}><SafeAreaView style={styles.modalFrame}><View style={styles.refineSheet}><View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.modalTitle}>Refine {mode === "owned" ? "My bottles" : "Tastings"}</Text><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalTarget}><Text style={styles.modalAction}>Done</Text></Pressable></View><Field label="Show"><View style={styles.toggleGrid}>{statuses.map((item) => <Toggle key={item.key} active={filters.status === item.key} label={item.label} onPress={() => onChange({ ...filters, status: item.key })} />)}</View></Field>{mode === "owned" ? <><Toggle active={filters.buyAgainOnly} label="Buy again" onPress={() => onChange({ ...filters, buyAgainOnly: !filters.buyAgainOnly })} /><Toggle active={filters.minRating === 90} label="Rated 9.0+" onPress={() => onChange({ ...filters, minRating: filters.minRating === 90 ? null : 90 })} /></> : <Field label="Tasting context"><View style={styles.toggleGrid}>{contexts.map((context) => <Toggle key={context.key} active={filters.tastingContext === context.key} label={context.label} onPress={() => onChange({ ...filters, tastingContext: filters.tastingContext === context.key ? undefined : context.key })} />)}</View></Field>}<Field label="Sort"><View style={styles.toggleGrid}>{sorts.map((item) => <Toggle key={item.key} active={sort === item.key} label={item.label} onPress={() => onSort(item.key)} />)}</View></Field></View></SafeAreaView></Modal>;
}

function BottleEditor({ bottle, busy, onClose, onDelete, onSave }: { bottle: MemberCollectionBottle | null; busy: boolean; onClose: () => void; onDelete: () => void; onSave: (patch: CollectionBottlePatch) => Promise<void> }) {
  const [rating, setRating] = useState(0); const [isRated, setIsRated] = useState(false); const [notes, setNotes] = useState(""); const [tags, setTags] = useState<string[]>([]); const [wouldBuyAgain, setWouldBuyAgain] = useState<boolean | undefined>();
  const [sealed, setSealed] = useState(0); const [opened, setOpened] = useState(0); const [finished, setFinished] = useState(0); const [pricePaid, setPricePaid] = useState(""); const [store, setStore] = useState(""); const [tastingContext, setTastingContext] = useState<MemberCollectionBottle["tastingContext"]>();
  const [showMoreCues, setShowMoreCues] = useState(false); const [showAcquisition, setShowAcquisition] = useState(false); const [showMoreOptions, setShowMoreOptions] = useState(false); const [correcting, setCorrecting] = useState(false); const [saveError, setSaveError] = useState("");
  useEffect(() => { if (!bottle) return; setRating(bottle.rating); setIsRated(bottle.isRated); setNotes(bottle.notes || ""); setTags(bottle.tasteTags || []); setWouldBuyAgain(bottle.wouldBuyAgain); setSealed(bottle.sealedQuantity); setOpened(bottle.openedQuantity); setFinished(bottle.finishedCount); setPricePaid(bottle.pricePaid == null ? "" : String(bottle.pricePaid)); setStore(bottle.store || ""); setTastingContext(bottle.tastingContext); setShowMoreCues(false); setShowAcquisition(bottle.pricePaid != null || Boolean(bottle.store?.trim())); setShowMoreOptions(false); setCorrecting(false); setSaveError(""); }, [bottle]);
  const cues = showMoreCues ? TASTE_TAG_OPTIONS : Array.from(new Set([...COMMON_CUES, ...tags]));
  async function save() { if (!bottle || busy) return; const numericPrice = pricePaid.trim() ? Number(pricePaid) : undefined; if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0)) { setSaveError("Price paid must be a positive amount."); return; } setSaveError(""); await onSave({ rating, isRated, notes, tasteTags: tags, wouldBuyAgain, sealedQuantity: sealed, openedQuantity: opened, finishedCount: finished, tastedOnly: bottle.tastedOnly, pricePaid: numericPrice, store, tastingContext }); }
  const dated = shortCollectionDate(bottle?.ratedAt);
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(bottle)}><SafeAreaView edges={["top", "bottom"]} style={styles.modalFrame}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalFrame}><ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">
    <View style={styles.modalHeader}><Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.modalTarget}><Text style={styles.modalAction}>Cancel</Text></Pressable><Text style={styles.modalTitle}>Bottle details</Text><Pressable accessibilityLabel="Save bottle details" accessibilityRole="button" disabled={busy} onPress={() => void save()} style={styles.modalTarget}><Text style={styles.modalAction}>{busy ? "Saving…" : "Save"}</Text></Pressable></View><Text style={styles.editorName}>{bottle?.bottleName}</Text>
    {!bottle?.tastedOnly ? <Section title="Inventory"><View style={styles.actionStack}><ActionButton disabled={sealed < 1} label="Open a bottle" onPress={() => { if (sealed > 0) { setSealed(sealed - 1); setOpened(opened + 1); } }} /><ActionButton label="Add another" onPress={() => setSealed(Math.min(999, sealed + 1))} /><ActionButton disabled={opened < 1} label="Finished an open bottle" onPress={() => { if (opened > 0) { setOpened(opened - 1); setFinished(Math.min(999, finished + 1)); } }} /></View><Text style={styles.inventory}>{collectionInventoryLabel({ sealedQuantity: sealed, openedQuantity: opened }) || "None on hand"}</Text></Section> : <Section title="Inventory"><Text style={styles.fieldHelp}>Just tasted — no bottle inventory saved.</Text></Section>}
    <Section title="My tasting">{bottle?.tastedOnly ? <Field label="Tasting context"><View style={styles.toggleGrid}>{(["bar", "bottle_share", "friend", "event", "other"] as const).map((context) => <Toggle key={context} active={tastingContext === context} label={context === "bottle_share" ? "Bottle share" : context[0].toUpperCase() + context.slice(1)} onPress={() => setTastingContext(context)} />)}</View></Field> : null}<View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Rated</Text>{dated && isRated ? <Text style={styles.fieldHelp}>Rated {dated}</Text> : <Text style={styles.fieldHelp}>A real 0.0 stays different from unrated.</Text>}</View><Switch accessibilityLabel="Bottle has a rating" onValueChange={setIsRated} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={isRated} /></View>{isRated ? <ScoreSlider onChange={setRating} value={rating} /> : null}<Field label="Quick cues"><View style={styles.toggleGrid}>{cues.map((tag) => <Toggle key={tag} active={tags.includes(tag)} label={tag} onPress={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}</View></Field>{!showMoreCues ? <ActionButton label="More cues" onPress={() => setShowMoreCues(true)} /> : null}<Field label="Notes (optional)"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="What stood out?" placeholderTextColor={colors.muted} style={[styles.input, styles.notesInput]} value={notes} /></Field><Field label="Buy again?"><View accessibilityLabel="Buy again preference" accessibilityRole="radiogroup" style={styles.segmented}>{([{ label: "Not sure", value: undefined }, { label: "Buy again", value: true }, { label: "Wouldn’t", value: false }] as const).map((option) => <PreferenceChoice checked={wouldBuyAgain === option.value} key={option.label} label={option.label} onPress={() => setWouldBuyAgain(option.value)} />)}</View></Field></Section>
    {!bottle?.tastedOnly ? <Section title="Acquisition" optional><ActionButton label={showAcquisition ? "Hide acquisition details" : "Acquisition details"} onPress={() => setShowAcquisition(!showAcquisition)} />{showAcquisition ? <><Field label="Price paid"><TextInput accessibilityLabel="Price paid" keyboardType="decimal-pad" onChangeText={setPricePaid} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={pricePaid} /></Field><Field label="Store"><TextInput accessibilityLabel="Store purchased from" onChangeText={setStore} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={store} /></Field></> : null}</Section> : null}
    <Section title="More options"><ActionButton label={showMoreOptions ? "Hide more options" : "More options"} onPress={() => setShowMoreOptions(!showMoreOptions)} />{showMoreOptions ? <><ActionButton label="Correct quantities" onPress={() => setCorrecting(!correcting)} />{correcting ? <View style={styles.corrections}><Stepper label="Sealed" onChange={setSealed} value={sealed} /><Stepper label="Open" onChange={setOpened} value={opened} /><Stepper label="Finished" onChange={setFinished} value={finished} /></View> : null}<Pressable accessibilityHint="Requires destructive confirmation" accessibilityRole="button" disabled={busy} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>Delete bottle history</Text></Pressable></> : null}</Section>
    {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}

function Section({ children, optional, title }: { children: React.ReactNode; optional?: boolean; title: string }) { return <View style={styles.section}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{optional ? <Text style={styles.fieldHelp}>OPTIONAL</Text> : null}</View>{children}</View>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function Toggle({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text></Pressable>; }
function PreferenceChoice({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked }} onPress={onPress} style={[styles.segment, checked && styles.toggleActive]}><Text style={[styles.toggleText, checked && styles.toggleTextActive]}>{label}</Text></Pressable>; }
function ActionButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>; }
function Stepper({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) { return <View style={styles.stepper}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.stepperActions}><Pressable accessibilityLabel={`Remove one ${label}`} accessibilityRole="button" onPress={() => onChange(Math.max(0, value - 1))} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable><Text style={styles.stepValue}>{value}</Text><Pressable accessibilityLabel={`Add one ${label}`} accessibilityRole="button" onPress={() => onChange(Math.min(999, value + 1))} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable></View></View>; }

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 6 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingTop: 2 }, topCopy: { flex: 1, gap: 4 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, summaryLine: { color: colors.text, fontSize: 18, fontWeight: "800" }, summaryDetail: { color: colors.muted, fontSize: 12 }, addButton: { minHeight: 44, justifyContent: "center", borderRadius: 11, backgroundColor: colors.accent, paddingHorizontal: 14 }, addButtonPressed: { backgroundColor: colors.accentPressed }, addButtonText: { color: colors.background, fontSize: 13, fontWeight: "800" }, modeSwitch: { flexDirection: "row", padding: 3, borderRadius: 12, backgroundColor: colors.surface }, modeButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 9 }, modeButtonActive: { backgroundColor: colors.surfaceRaised }, modeText: { color: colors.muted, fontWeight: "700" }, modeTextActive: { color: colors.text }, controlRow: { flexDirection: "row", gap: 8 }, search: { flex: 1, minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 13, fontSize: 14 }, refineButton: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14 }, refineText: { color: colors.accent, fontWeight: "800" }, showing: { color: colors.muted, fontSize: 11 }, gridContent: { gap: 10 }, gridRow: { gap: 10 }, gap: { height: 8 }, tile: { flex: 1, minHeight: 190, alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, backgroundColor: colors.surface }, tileName: { minHeight: 40, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700", textAlign: "center" }, tileRating: { color: colors.accent, fontSize: 13, fontWeight: "800" }, inventory: { color: colors.muted, fontSize: 11, textTransform: "capitalize" }, preference: { color: colors.muted, fontSize: 11 }, pressed: { opacity: 0.72 }, tastingRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: colors.surface }, tastingCopy: { flex: 1, gap: 3 }, tastingName: { color: colors.text, fontSize: 15, fontWeight: "700" }, tastingMeta: { color: colors.muted, fontSize: 11, textTransform: "capitalize" }, tastingCues: { color: colors.muted, fontSize: 11 }, tastingScore: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  modalFrame: { flex: 1, backgroundColor: colors.background }, refineSheet: { flex: 1, padding: 20, gap: 24 }, modalHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTarget: { minWidth: 64, minHeight: 44, justifyContent: "center" }, modalAction: { color: colors.accent, fontWeight: "700" }, modalTitle: { color: colors.text, fontSize: 17, fontWeight: "800" }, editor: { padding: 20, paddingBottom: 44, gap: 22 }, editorName: { color: colors.text, fontSize: 26, fontWeight: "800" }, section: { gap: 14, paddingTop: 4 }, sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "800" }, field: { gap: 7 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" }, fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 17 }, input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, notesInput: { minHeight: 100, textAlignVertical: "top" }, switchRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, switchCopy: { flex: 1 }, toggleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, toggle: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12 }, segmented: { flexDirection: "row", borderColor: colors.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" }, segment: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, toggleActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }, toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, toggleTextActive: { color: colors.accent }, actionStack: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, actionButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13 }, actionText: { color: colors.accent, fontWeight: "800", fontSize: 12 }, disabled: { opacity: 0.4 }, corrections: { gap: 8 }, stepper: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, stepperActions: { flexDirection: "row", alignItems: "center", gap: 10 }, stepButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 10 }, stepText: { color: colors.accent, fontSize: 22 }, stepValue: { minWidth: 28, color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" }, deleteButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderColor: colors.danger, borderWidth: 1 }, deleteText: { color: colors.danger, fontWeight: "800" }, error: { color: colors.danger, fontSize: 13 },
});

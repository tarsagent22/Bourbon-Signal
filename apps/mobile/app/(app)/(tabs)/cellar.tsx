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
import { CellarBottleSilhouette } from "../../../src/components/CellarBottleSilhouette";
import { CellarGlencairnSilhouette } from "../../../src/components/CellarGlencairnSilhouette";
import { EmptyState, ErrorState, LoadingState, memberScreenStyles } from "../../../src/components/MemberScreen";
import { ScoreSlider } from "../../../src/components/ScoreSlider";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import {
  activeCollectionRefinementCount,
  applyBottleContributionIds,
  applyCollectionInventoryAction,
  collectionDisplayKind,
  collectionInventoryLabel,
  collectionSummary,
  DEFAULT_COLLECTION_FILTERS,
  DEFAULT_COLLECTION_SORT,
  filterAndSortCollection,
  formatCollectionRating,
  TASTE_TAG_OPTIONS,
  type CollectionBottlePatch,
  type CollectionFilters,
  type CollectionInventoryAction,
  type CollectionSort,
  updateCollectionBottle,
} from "../../../src/interactions/member-interactions";
import { colors } from "../../../src/theme";

const COMMON_CUES = TASTE_TAG_OPTIONS.slice(0, 5);

function findBottle(bottles: MemberCollectionBottle[], selected: MemberCollectionBottle) {
  return bottles.find((bottle) => bottle.bottleId === selected.bottleId)
    || bottles.find((bottle) => bottle.canonicalKey === selected.canonicalKey)
    || null;
}

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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionSort>(DEFAULT_COLLECTION_SORT);
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_COLLECTION_FILTERS);
  const [refineOpen, setRefineOpen] = useState(false);
  const [selected, setSelected] = useState<MemberCollectionBottle | null>(null);
  const [mutating, setMutating] = useState(false);
  const reportedPendingBottleIds = useRef(new Set<string>());

  const acceptServerPreferences = useCallback((next: MemberPreferences) => {
    setPreferences(next);
    setSelected((current) => current ? findBottle(next.collectionPreferences.bottles, current) : null);
  }, []);

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
      const alreadyPersisted = [...receipts]
        .filter(([bottleId, contributionId]) => base.collectionPreferences.bottles.some((bottle) => bottle.bottleId === bottleId && bottle.bottleContributionId === contributionId))
        .map(([bottleId]) => bottleId);
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
      const persisted = [...contributionIds]
        .filter(([bottleId, contributionId]) => base.collectionPreferences.bottles.some((bottle) => bottle.bottleId === bottleId && bottle.bottleContributionId === contributionId))
        .map(([bottleId]) => bottleId);
      if (persisted.length) {
        const remaining = removeBottleContributionReceipts(receipts, persisted);
        if (remaining !== receipts && await writeContributionReceipts(receiptStorageKey, remaining)) receipts = remaining;
      }
    })();
  }, [api, persistContributionIds, receiptStorageKey]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const receiptRead = await readContributionReceipts(receiptStorageKey);
      const nextPreferences = await api.getMemberPreferences({ fresh });
      acceptServerPreferences(nextPreferences);
      retryPendingContributions(nextPreferences, receiptRead.receipts);
    } catch (caught) {
      setError(caught instanceof MobileApiError && caught.status === 401
        ? "Your session could not be verified. Return to Signals and retry."
        : caught instanceof Error ? caught.message : "Your Cellar is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [acceptServerPreferences, api, receiptStorageKey, retryPendingContributions]);

  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  const canUseCollection = preferences?.entitlements?.canUseCollection === true;
  const sourceBottles = preferences?.collectionPreferences.bottles || [];
  const summary = useMemo(() => collectionSummary(sourceBottles), [sourceBottles]);
  const bottles = useMemo(() => filterAndSortCollection(sourceBottles, query, sort, filters), [filters, query, sort, sourceBottles]);
  const numColumns = width >= 360 && fontScale < 1.3 ? 2 : 1;
  const tileWidth = numColumns === 2 ? (width - 36 - 10) / 2 : undefined;
  const refinementCount = activeCollectionRefinementCount(filters, sort);
  const resultSetChanged = Boolean(query.trim() || refinementCount);

  const persistBottles = useCallback(async (nextBottles: MemberCollectionBottle[], version: number, conflictMessage: string) => {
    if (mutating) return null;
    setMutating(true);
    setError("");
    try {
      const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles: nextBottles, version } });
      acceptServerPreferences(saved);
      return saved;
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) {
        await load(true);
        setError(conflictMessage);
        Alert.alert("Cellar refreshed", conflictMessage);
        return null;
      }
      const message = caught instanceof Error ? caught.message : "That Cellar change could not be saved.";
      setError(message);
      Alert.alert("Cellar change not saved", message);
      return null;
    } finally {
      setMutating(false);
    }
  }, [acceptServerPreferences, api, load, mutating]);

  const saveBottle = useCallback(async (patch: CollectionBottlePatch) => {
    if (!preferences || !selected) return false;
    const next = updateCollectionBottle(preferences.collectionPreferences.bottles, selected.canonicalKey, patch, new Date().toISOString());
    const saved = await persistBottles(next, preferences.collectionPreferences.version, "Your Cellar changed elsewhere. It was refreshed before these details could be saved.");
    if (!saved) return false;
    setSelected(null);
    return true;
  }, [persistBottles, preferences, selected]);

  const undoInventoryAction = useCallback(async (priorBottles: MemberCollectionBottle[], serverVersion: number) => {
    if (mutating) return;
    setMutating(true);
    setError("");
    try {
      const restored = await api.updateMemberPreferences({ collectionPreferences: { bottles: priorBottles, version: serverVersion } });
      acceptServerPreferences(restored);
      Alert.alert("Change undone", "Your prior inventory has been restored.");
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 409) {
        await load(true);
        const message = "Your Cellar changed again before Undo could be applied. It has been refreshed.";
        setError(message);
        Alert.alert("Undo not applied", message);
      } else {
        const message = caught instanceof Error ? caught.message : "Undo could not be saved.";
        setError(message);
        Alert.alert("Undo not applied", message);
      }
    } finally {
      setMutating(false);
    }
  }, [acceptServerPreferences, api, load, mutating]);

  const applyInventoryAction = useCallback((action: CollectionInventoryAction) => {
    if (!preferences || !selected || mutating) return;
    const execute = async () => {
      const priorBottles = preferences.collectionPreferences.bottles;
      const nextBottles = applyCollectionInventoryAction(priorBottles, selected.canonicalKey, action, new Date().toISOString());
      if (nextBottles === priorBottles) return;
      const saved = await persistBottles(nextBottles, preferences.collectionPreferences.version, "Your Cellar changed elsewhere. It was refreshed before that inventory action could be saved.");
      if (!saved) return;
      const messages: Record<CollectionInventoryAction, string> = {
        add_bottle: "One sealed bottle was added.",
        open_bottle: "One sealed bottle was marked open.",
        finish_bottle: "One open bottle was marked finished.",
        keep_tasted_only: "Inventory was removed while your rating and tasting history were kept.",
      };
      Alert.alert("Cellar updated", messages[action], [
        { text: "Undo", onPress: () => void undoInventoryAction(priorBottles, saved.collectionPreferences.version) },
        { text: "Done", style: "cancel" },
      ]);
    };

    if (action === "keep_tasted_only" && selected.sealedQuantity + selected.openedQuantity > 0) {
      Alert.alert("Keep as tasted only?", "This removes all current bottle inventory but keeps your rating, tasting notes, and acquisition details.", [
        { text: "Cancel", style: "cancel" },
        { text: "Keep as tasted only", style: "destructive", onPress: () => void execute() },
      ]);
      return;
    }
    void execute();
  }, [mutating, persistBottles, preferences, selected, undoInventoryAction]);

  const requestDelete = useCallback(() => {
    if (!preferences || !selected || mutating) return;
    Alert.alert("Delete this Cellar history?", `${selected.bottleName} and all inventory, rating, and tasting history will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        const next = preferences.collectionPreferences.bottles.filter((bottle) => bottle.bottleId !== selected.bottleId);
        const saved = await persistBottles(next, preferences.collectionPreferences.version, "Your Cellar changed elsewhere. It was refreshed before deletion could be saved.");
        if (saved) setSelected(null);
      })() },
    ]);
  }, [mutating, persistBottles, preferences, selected]);

  return <>
    <FlatList
      key={`cellar-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
      contentContainerStyle={[memberScreenStyles.content, numColumns > 1 && styles.gridContent]}
      data={canUseCollection ? bottles : []}
      keyExtractor={(item) => item.bottleId || item.canonicalKey}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={() => void load(true)} tintColor={colors.accent} />}
      renderItem={({ item }) => <WhiskeyTile bottle={item} onPress={() => setSelected(item)} width={tileWidth} />}
      ItemSeparatorComponent={numColumns === 1 ? () => <View style={styles.gap} /> : undefined}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.topRow}>
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>YOUR CELLAR</Text>
            <Text style={styles.summaryLine}>{summary.ownedWhiskeyCount} owned · {summary.tastedOnlyCount} tasted only</Text>
            <Text style={styles.summaryDetail}>{summary.ratedCount} rated{summary.averageRating == null ? "" : ` · ${(summary.averageRating / 10).toFixed(1)} average`}</Text>
          </View>
          {canUseCollection ? <Pressable accessibilityLabel="Add whiskey to Cellar" accessibilityRole="button" onPress={() => router.push("/(app)/cellar/add")} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}><Text style={styles.addButtonText}>+ Add</Text></Pressable> : null}
        </View>
        {loading && !preferences ? <LoadingState label="Opening your Cellar…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
        {preferences && !canUseCollection ? <EmptyState title="Cellar is not included with this membership" detail="HQ shows the membership recognized by the app. Saved collection data remains private without collection access." /> : null}
        {preferences && canUseCollection ? <>
          <View style={styles.controlRow}>
            <TextInput accessibilityLabel="Search your Cellar" autoCapitalize="none" clearButtonMode="while-editing" onChangeText={setQuery} placeholder="Search your Cellar" placeholderTextColor={colors.muted} style={styles.search} value={query} />
            <Pressable accessibilityLabel={refinementCount ? `Refine, ${refinementCount} active` : "Refine"} accessibilityRole="button" onPress={() => setRefineOpen(true)} style={styles.refineButton}><Text style={styles.refineText}>Refine{refinementCount ? ` (${refinementCount})` : ""}</Text></Pressable>
          </View>
          {resultSetChanged ? <Text style={styles.showing}>{bottles.length} shown</Text> : null}
        </> : null}
      </View>}
      ListEmptyComponent={preferences && canUseCollection && !loading ? <EmptyState title={sourceBottles.length ? "No whiskeys match" : "Your Cellar is ready"} detail={sourceBottles.length ? "Clear the search or refine choices." : "Choose Add to save a bottle or a whiskey you tasted."} /> : null}
      style={memberScreenStyles.screen}
    />
    <RefineSheet filters={filters} onChange={setFilters} onClose={() => setRefineOpen(false)} onSort={setSort} sort={sort} visible={refineOpen} />
    <BottleEditor bottle={selected} busy={mutating} onClose={() => setSelected(null)} onDelete={requestDelete} onInventoryAction={applyInventoryAction} onSave={saveBottle} />
  </>;
}

function WhiskeyTile({ bottle, onPress, width }: { bottle: MemberCollectionBottle; onPress: () => void; width?: number }) {
  const kind = collectionDisplayKind(bottle);
  const kindLabel = kind === "owned" ? "Owned" : "Tasted only";
  const inventory = kind === "owned" ? collectionInventoryLabel(bottle) || "Inventory on hand" : "No bottles on hand";
  const rating = formatCollectionRating(bottle);
  return <Pressable
    accessibilityLabel={`${kindLabel}. ${bottle.bottleName}. Rating ${rating}. Inventory ${inventory}.`}
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [styles.tile, width !== undefined && { flex: 0, width }, pressed && styles.pressed]}
  >
    {kind === "owned" ? <CellarBottleSilhouette /> : <CellarGlencairnSilhouette />}
    <Text numberOfLines={2} style={styles.tileName}>{bottle.bottleName}</Text>
    <Text style={styles.tileRating}>{rating}</Text>
    <Text style={styles.inventory}>{kind === "owned" ? inventory : "Tasted only"}</Text>
  </Pressable>;
}

function RefineSheet({ filters, onChange, onClose, onSort, sort, visible }: { filters: CollectionFilters; onChange: (next: CollectionFilters) => void; onClose: () => void; onSort: (next: CollectionSort) => void; sort: CollectionSort; visible: boolean }) {
  const statuses = [
    { key: "all", label: "All" },
    { key: "owned", label: "Owned" },
    { key: "tasted", label: "Tasted only" },
    { key: "open", label: "Open now" },
    { key: "sealed", label: "Sealed" },
  ] as const;
  const ratings = [{ key: "all", label: "All" }, { key: "rated", label: "Rated" }, { key: "unrated", label: "Unrated" }] as const;
  const sorts = [
    { key: "recently_updated", label: "Recently updated" },
    { key: "recently_rated", label: "Recently rated" },
    { key: "rating", label: "Rating" },
    { key: "name", label: "Name" },
  ] as const;
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
    <SafeAreaView style={styles.modalFrame}>
      <ScrollView contentContainerStyle={styles.refineSheet} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.modalTitle}>Refine</Text><Pressable accessibilityRole="button" onPress={onClose} style={styles.modalTarget}><Text style={styles.modalAction}>Done</Text></Pressable></View>
        <Field label="Show"><View style={styles.toggleGrid}>{statuses.map((item) => <Toggle key={item.key} active={filters.status === item.key} label={item.label} onPress={() => onChange({ ...filters, status: item.key })} />)}</View></Field>
        <Field label="Rating"><View style={styles.toggleGrid}>{ratings.map((item) => <Toggle key={item.key} active={(filters.rating || "all") === item.key} label={item.label} onPress={() => onChange({ ...filters, rating: item.key })} />)}</View></Field>
        <View style={styles.toggleGrid}>
          <Toggle active={filters.buyAgainOnly} label="Buy again" onPress={() => onChange({ ...filters, buyAgainOnly: !filters.buyAgainOnly })} />
          <Toggle active={filters.minRating === 90} label="9.0+" onPress={() => onChange({ ...filters, minRating: filters.minRating === 90 ? null : 90 })} />
        </View>
        <Field label="Sort"><View style={styles.toggleGrid}>{sorts.map((item) => <Toggle key={item.key} active={sort === item.key} label={item.label} onPress={() => onSort(item.key)} />)}</View></Field>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function BottleEditor({ bottle, busy, onClose, onDelete, onInventoryAction, onSave }: {
  bottle: MemberCollectionBottle | null;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
  onInventoryAction: (action: CollectionInventoryAction) => void;
  onSave: (patch: CollectionBottlePatch) => Promise<boolean>;
}) {
  const [rating, setRating] = useState(0);
  const [isRated, setIsRated] = useState(false);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [wouldBuyAgain, setWouldBuyAgain] = useState<boolean | undefined>();
  const [sealed, setSealed] = useState(0);
  const [opened, setOpened] = useState(0);
  const [finished, setFinished] = useState(0);
  const [pricePaid, setPricePaid] = useState("");
  const [store, setStore] = useState("");
  const [showMoreCues, setShowMoreCues] = useState(false);
  const [showAcquisition, setShowAcquisition] = useState(false);
  const [showBottleDetails, setShowBottleDetails] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!bottle) return;
    setRating(bottle.rating);
    setIsRated(bottle.isRated);
    setNotes(bottle.notes || "");
    setTags(bottle.tasteTags || []);
    setWouldBuyAgain(bottle.wouldBuyAgain);
    setPricePaid(bottle.pricePaid == null ? "" : String(bottle.pricePaid));
    setStore(bottle.store || "");
    setShowMoreCues(false);
    setShowAcquisition(false);
    setShowBottleDetails(false);
    setSaveError("");
  }, [bottle?.bottleId]);

  useEffect(() => {
    if (!bottle) return;
    setSealed(bottle.sealedQuantity);
    setOpened(bottle.openedQuantity);
    setFinished(bottle.finishedCount);
  }, [bottle?.bottleId, bottle?.finishedCount, bottle?.openedQuantity, bottle?.sealedQuantity]);

  const dirty = Boolean(bottle) && (
    rating !== bottle!.rating
    || isRated !== bottle!.isRated
    || notes !== (bottle!.notes || "")
    || tags.join("\u0000") !== (bottle!.tasteTags || []).join("\u0000")
    || wouldBuyAgain !== bottle!.wouldBuyAgain
    || sealed !== bottle!.sealedQuantity
    || opened !== bottle!.openedQuantity
    || finished !== bottle!.finishedCount
    || pricePaid !== (bottle!.pricePaid == null ? "" : String(bottle!.pricePaid))
    || store !== (bottle!.store || "")
  );
  const cues = showMoreCues ? TASTE_TAG_OPTIONS : Array.from(new Set([...COMMON_CUES, ...tags]));
  const kind = bottle ? collectionDisplayKind(bottle) : "tasted";
  const inventorySummary = bottle ? `${bottle.sealedQuantity} sealed · ${bottle.openedQuantity} open · ${bottle.finishedCount} finished` : "";
  const acquisitionSummary = bottle ? [bottle.pricePaid == null ? "" : `$${bottle.pricePaid}`, bottle.store || ""].filter(Boolean).join(" · ") || "No acquisition details" : "";

  useEffect(() => { setSaveError(""); }, [finished, isRated, notes, opened, pricePaid, rating, sealed, store, tags, wouldBuyAgain]);

  function requestClose() {
    if (busy) return;
    if (!dirty) { onClose(); return; }
    Alert.alert("Discard changes?", "Your unsaved Cellar details will be lost. Inventory actions already saved to the server will remain.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  }

  async function save() {
    if (!bottle || busy || !dirty) return;
    const numericPrice = pricePaid.trim() ? Number(pricePaid) : undefined;
    if (numericPrice !== undefined && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      setSaveError("Price paid must be a positive amount.");
      return;
    }
    setSaveError("");
    const saved = await onSave({
      rating,
      isRated,
      notes,
      tasteTags: tags,
      wouldBuyAgain,
      sealedQuantity: sealed,
      openedQuantity: opened,
      finishedCount: finished,
      tastedOnly: sealed + opened === 0,
      pricePaid: numericPrice,
      store,
      purchaseDate: bottle.purchaseDate,
      tastingContext: bottle.tastingContext,
    });
    if (!saved) setSaveError("These details were not saved. Review the message and try again.");
  }

  return <Modal allowSwipeDismissal={!dirty && !busy} animationType="slide" onRequestClose={requestClose} presentationStyle="pageSheet" visible={Boolean(bottle)}>
    <SafeAreaView edges={["top", "bottom"]} style={styles.modalFrame}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalFrame}>
        <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={requestClose} style={styles.modalTarget}><Text style={styles.modalAction}>Cancel</Text></Pressable>
            <Text accessibilityRole="header" style={styles.modalTitle}>Cellar details</Text>
            <Pressable accessibilityLabel="Save Cellar details" accessibilityRole="button" accessibilityState={{ disabled: busy || !dirty }} disabled={busy || !dirty} onPress={() => void save()} style={styles.modalTarget}><Text style={[styles.modalAction, (busy || !dirty) && styles.mutedAction]}>{busy ? "Saving…" : "Save"}</Text></Pressable>
          </View>
          <Text style={styles.editorName}>{bottle?.bottleName}</Text>

          <Section title="In my Cellar">
            <View style={styles.inventoryStateRow}><Text style={styles.inventoryState}>{kind === "owned" ? "Owned" : "Tasted only"}</Text><Text style={styles.fieldHelp}>{inventorySummary}</Text></View>
            <View style={styles.actionStack}>
              <ActionButton disabled={busy} label="Add bottle" onPress={() => onInventoryAction("add_bottle")} />
              <ActionButton disabled={busy || (bottle?.sealedQuantity || 0) < 1} label="Open one" onPress={() => onInventoryAction("open_bottle")} />
              <ActionButton disabled={busy || (bottle?.openedQuantity || 0) < 1} label="Mark one finished" onPress={() => onInventoryAction("finish_bottle")} />
              <ActionButton disabled={busy || kind === "tasted"} label="Keep as tasted only" onPress={() => onInventoryAction("keep_tasted_only")} />
            </View>
            <Text style={styles.fieldHelp}>Inventory actions save immediately and do not require the header Save.</Text>
          </Section>

          <Section title="My rating">
            <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Add a rating</Text><Text style={styles.fieldHelp}>Turn this on when you want a score saved with this whiskey.</Text></View><Switch accessibilityLabel="Add a rating" onValueChange={setIsRated} thumbColor={colors.text} trackColor={{ false: colors.border, true: colors.accentPressed }} value={isRated} /></View>
            {isRated ? <ScoreSlider onChange={setRating} value={rating} /> : null}
            <Field label="Quick cues"><View style={styles.toggleGrid}>{cues.map((tag) => <Toggle key={tag} active={tags.includes(tag)} label={tag} onPress={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}</View></Field>
            {!showMoreCues ? <ActionButton label="More cues" onPress={() => setShowMoreCues(true)} /> : null}
            <Field label="Notes (optional)"><TextInput accessibilityLabel="Tasting notes" multiline onChangeText={setNotes} placeholder="What stood out?" placeholderTextColor={colors.muted} style={[styles.input, styles.notesInput]} value={notes} /></Field>
            <Field label="Would you buy it again?"><View accessibilityLabel="Would you buy it again?" accessibilityRole="radiogroup" style={styles.segmented}>{([
              { label: "Not sure", value: undefined },
              { label: "Yes", value: true },
              { label: "No", value: false },
            ] as const).map((option) => <PreferenceChoice checked={wouldBuyAgain === option.value} key={option.label} label={option.label} onPress={() => setWouldBuyAgain(option.value)} />)}</View></Field>
          </Section>

          <DisclosureRow expanded={showAcquisition} label="Acquisition" onPress={() => setShowAcquisition((current) => !current)} summary={acquisitionSummary} />
          {showAcquisition ? <View style={styles.disclosureBody}><Field label="Price paid"><TextInput accessibilityLabel="Price paid" keyboardType="decimal-pad" onChangeText={setPricePaid} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={pricePaid} /></Field><Field label="Store"><TextInput accessibilityLabel="Store purchased from" onChangeText={setStore} placeholder="Optional" placeholderTextColor={colors.muted} style={styles.input} value={store} /></Field></View> : null}

          <DisclosureRow expanded={showBottleDetails} label="Bottle details" onPress={() => setShowBottleDetails((current) => !current)} summary={inventorySummary} />
          {showBottleDetails ? <View style={styles.disclosureBody}>
            <Text style={styles.fieldHelp}>Use these steppers only to correct the saved quantities.</Text>
            <Stepper label="Sealed" onChange={setSealed} value={sealed} />
            <Stepper label="Open" onChange={setOpened} value={opened} />
            <Stepper label="Finished" onChange={setFinished} value={finished} />
            <Pressable accessibilityHint="Requires destructive confirmation" accessibilityRole="button" disabled={busy} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>Delete Cellar history</Text></Pressable>
          </View> : null}
          {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function Toggle({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{active ? `✓ ${label}` : label}</Text></Pressable>; }
function PreferenceChoice({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked }} onPress={onPress} style={[styles.segment, checked && styles.toggleActive]}><Text style={[styles.toggleText, checked && styles.toggleTextActive]}>{checked ? `✓ ${label}` : label}</Text></Pressable>; }
function ActionButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>; }
function DisclosureRow({ expanded, label, onPress, summary }: { expanded: boolean; label: string; onPress: () => void; summary: string }) { return <Pressable accessibilityLabel={`${label}. ${summary}`} accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={styles.disclosureRow}><View style={styles.disclosureCopy}><Text style={styles.sectionTitle}>{label}</Text><Text numberOfLines={1} style={styles.fieldHelp}>{summary}</Text></View><Text aria-hidden style={styles.disclosureGlyph}>{expanded ? "−" : "+"}</Text></Pressable>; }
function Stepper({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) { return <View style={styles.stepper}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.stepperActions}><Pressable accessibilityLabel={`Remove one ${label}`} accessibilityRole="button" onPress={() => onChange(Math.max(0, value - 1))} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable><Text style={styles.stepValue}>{value}</Text><Pressable accessibilityLabel={`Add one ${label}`} accessibilityRole="button" onPress={() => onChange(Math.min(999, value + 1))} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable></View></View>; }

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 8 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingTop: 2 },
  topCopy: { flex: 1, gap: 4 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  summaryLine: { color: colors.text, fontSize: 18, fontWeight: "800" },
  summaryDetail: { color: colors.muted, fontSize: 12 },
  addButton: { minHeight: 44, justifyContent: "center", borderRadius: 11, backgroundColor: colors.accent, paddingHorizontal: 14 },
  addButtonPressed: { backgroundColor: colors.accentPressed },
  addButtonText: { color: colors.background, fontSize: 13, fontWeight: "800" },
  controlRow: { flexDirection: "row", gap: 8 },
  search: { flex: 1, minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 13, fontSize: 14 },
  refineButton: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14 },
  refineText: { color: colors.accent, fontWeight: "800" },
  showing: { color: colors.muted, fontSize: 11 },
  gridContent: { gap: 10 },
  gridRow: { gap: 10 },
  gap: { height: 8 },
  tile: { flex: 1, minHeight: 196, alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, backgroundColor: colors.surface },
  tileName: { minHeight: 42, color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: "800", textAlign: "center" },
  tileRating: { color: colors.accent, fontSize: 24, fontWeight: "900" },
  inventory: { color: colors.muted, fontSize: 11, textTransform: "capitalize" },
  pressed: { opacity: 0.72 },
  modalFrame: { flex: 1, backgroundColor: colors.background },
  refineSheet: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 24 },
  modalHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTarget: { minWidth: 64, minHeight: 44, justifyContent: "center" },
  modalAction: { color: colors.accent, fontWeight: "700" },
  mutedAction: { color: colors.muted },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  editor: { padding: 20, paddingBottom: 44, gap: 22 },
  editorName: { color: colors.text, fontSize: 26, fontWeight: "800" },
  section: { gap: 14, paddingTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  field: { gap: 7 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  notesInput: { minHeight: 100, textAlignVertical: "top" },
  inventoryStateRow: { gap: 4 },
  inventoryState: { color: colors.accent, fontSize: 16, fontWeight: "800" },
  switchRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  switchCopy: { flex: 1, gap: 3 },
  toggleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { minHeight: 44, justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12 },
  segmented: { flexDirection: "row", borderColor: colors.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  segment: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  toggleActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  toggleTextActive: { color: colors.accent },
  actionStack: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13 },
  actionText: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  disabled: { opacity: 0.4 },
  disclosureRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  disclosureCopy: { flex: 1, gap: 3 },
  disclosureGlyph: { color: colors.accent, fontSize: 24 },
  disclosureBody: { gap: 14, paddingBottom: 4 },
  stepper: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepperActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderColor: colors.border, borderWidth: 1, borderRadius: 10 },
  stepText: { color: colors.accent, fontSize: 22 },
  stepValue: { minWidth: 28, color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  deleteButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderColor: colors.danger, borderWidth: 1 },
  deleteText: { color: colors.danger, fontWeight: "800" },
  error: { color: colors.danger, fontSize: 13 },
});

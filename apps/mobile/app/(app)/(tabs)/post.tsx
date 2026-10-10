import { useFormDraft } from "../../../src/hooks/useFormDraft";
import { DraftNotice } from "../../../src/components/DraftNotice";
import { useBottleCatalog } from "../../../src/hooks/useBottleCatalog";
import { ErrorState } from "../../../src/components/MemberScreen";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from '@clerk/expo';
import { useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Children, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { GeographySearchResponse, MemberProfile, RadarBottleOption } from "../../../src/api/types";
import { MemberCard, PageHeading, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useAccessibleStatus } from '../../../src/hooks/useAccessibleStatus';
import { createSightingIdempotencyKey, parseSightingDraftBinding, serializeSightingDraftBinding, SIGHTING_IDEMPOTENCY_STORAGE_KEY, type SightingDraftBinding } from "../../../src/sightings/manual-sighting";
import { approvedStoreFromGeography, buildPostSignalPreview, buildPostSightingSubmission, isPostRequiredComplete, POST_QUANTITY_CHOICES, type PostSignalPreview, type PostStoreSelection } from "../../../src/sightings/post-composer";
import { type SightingPhotoAsset } from "../../../src/sightings/sighting-photo";
import { type PhotoJournalEntry } from "../../../src/sightings/photo-journal";
import { chooseSightingPhoto, discardSightingPhoto, sightingPhotoBlob, nativePhotoJournal, retainSightingPhoto, type SightingPhotoSource } from "../../../src/sightings/sighting-photo-native";
import { colors, typeScale, fonts, layout, typography } from "../../../src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COVERAGE_STATES } from "../../../../../shared/coverage-states";

type ActivePicker = "bottle" | "store" | null;
type GeographyResult = GeographySearchResponse["results"][number];

export default function PostScreen() {
  const { userId } = useAuth();
  return userId ? <PostComposer key={userId} userId={userId} /> : null;
}

function PostComposer({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const api = useMobileApi();
  const journal = useMemo(() => nativePhotoJournal(userId), [userId]);
  const draftStorageKey = `${SIGHTING_IDEMPOTENCY_STORAGE_KEY}.${userId}`;
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const bottleCatalog = useBottleCatalog();
  const [bottleName, setBottleName] = useState("");
  const [bottleId, setBottleId] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeZip, setStoreZip] = useState("");
  const [selectedStore, setSelectedStore] = useState<PostStoreSelection | null>(null);
  const [manualStore, setManualStore] = useState(false);
  const [storeResults, setStoreResults] = useState<PostStoreSelection[]>([]);
  const [storeSearching, setStoreSearching] = useState(false);
  const [storeSearchError, setStoreSearchError] = useState("");
  const [storeSearchAttempt, setStoreSearchAttempt] = useState(0);
  const [storeSearchState, setStoreSearchState] = useState("");
  const [storeNextOffset, setStoreNextOffset] = useState(0);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [storeTotal, setStoreTotal] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [customQuantity, setCustomQuantity] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<SightingPhotoAsset | null>(null);
  const [pendingPhotoAttachment, setPendingPhotoAttachment] = useState<PhotoJournalEntry | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useAccessibleStatus(error || success || photoMessage);
  const [idempotencyReady, setIdempotencyReady] = useState(false);
  const draftBinding = useRef<SightingDraftBinding | null>(null);
  const storeSearchSequence = useRef(0);
  const storePageInFlight = useRef(false);

  const draftDefaults = { bottleName: "", bottleId: "", storeName: "", storeAddress: "", storeCity: "", storeState: "", storeZip: "", selectedStoreId: "", manualStore: false, price: "", quantity: "", customQuantity: false, notes: "" };
  const draft = useFormDraft({ owner: userId, form: "post", defaults: draftDefaults,
    fields: { bottleName, bottleId: bottleId || "", storeName, storeAddress, storeCity, storeState, storeZip, selectedStoreId: selectedStore?.id || "", manualStore, price, quantity, customQuantity, notes },
    restore: value => {
      setBottleName(value.bottleName); setBottleId(value.bottleId || null); setStoreName(value.storeName); setStoreAddress(value.storeAddress); setStoreCity(value.storeCity); setStoreState(value.storeState); setStoreZip(value.storeZip);
      setSelectedStore(value.selectedStoreId ? { id: value.selectedStoreId, name: value.storeName, address: value.storeAddress, city: value.storeCity, state: value.storeState, zip: value.storeZip } : null);
      setManualStore(value.manualStore); setPrice(value.price); setQuantity(value.quantity); setCustomQuantity(value.customQuantity); setNotes(value.notes);
    },
  });
  function discardDraft() {
    Alert.alert("Discard this draft?", "Your unfinished text will be removed from this device.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => { void draft.discard().catch(() => undefined); } },
    ]);
  }

  useEffect(() => {
    let active = true;
    void api.getMemberProfile()
      .then(result => { if (active) setProfile(result.profile); })
      .catch((caught) => {
        if (active) setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Posting access is temporarily unavailable.");
      })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    let active = true;
    async function prepareDurableDraft() {
      try {
        const pending = await journal.load();
        if (active && pending) { setPendingPhotoAttachment(pending); setSelectedPhoto(pending.photo); setPhotoMessage('A saved photo is waiting. Retry without posting another Signal.'); }
        const stored = await SecureStore.getItemAsync(draftStorageKey);
        const binding = parseSightingDraftBinding(stored) || { key: createSightingIdempotencyKey(), fingerprint: null };
        if (!stored || !stored.trim().startsWith("{")) await SecureStore.setItemAsync(draftStorageKey, serializeSightingDraftBinding(binding));
        if (active) { draftBinding.current = binding; setIdempotencyReady(true); }
      } catch {
        if (active) setError("Secure draft protection is unavailable. Restart the app before posting.");
      }
    }
    void prepareDurableDraft();
    return () => { active = false; };
  }, [draftStorageKey, journal]);

  const canSubmit = profile?.entitlements.canSubmitSignals === true;
  const bottleSuggestions = useMemo(() => bottleCatalog.search(bottleName, 5), [bottleCatalog.search, bottleName]);
  const requiredComplete = useMemo(() => isPostRequiredComplete({ bottleName, storeName, storeAddress, storeCity, storeState }), [bottleName, storeAddress, storeCity, storeName, storeState]);
  const selectedBottleRarity = useMemo(() => bottleCatalog.catalog.find((bottle) => bottle.id === bottleId)?.rarity, [bottleCatalog.catalog, bottleId]);
  const preview = useMemo(() => buildPostSignalPreview({
    bottleName,
    bottleRarity: selectedBottleRarity,
    storeName,
    storeAddress,
    storeCity,
    storeState,
    price,
    quantity,
    notes,
    reporter: profile?.displayName || profile?.identity?.label,
  }), [bottleName, notes, price, profile?.displayName, profile?.identity?.label, quantity, selectedBottleRarity, storeAddress, storeCity, storeName, storeState]);
  const actionDisabled = pendingPhotoAttachment ? photoBusy || submitting : !requiredComplete || !idempotencyReady || submitting || photoBusy;

  useEffect(() => {
    const query = storeName.replace(/\s+/g, " ").trim();
    setStoreResults([]);
    setStoreHasMore(false);
    setStoreNextOffset(0);
    setStoreTotal(null);
    storePageInFlight.current = false;
    if (!canSubmit || manualStore || selectedStore || activePicker !== "store" || query.length < 2) {
      storeSearchSequence.current += 1;
      setStoreResults([]);
      setStoreSearching(false);
      return;
    }
    setStoreSearchError("");
    const sequence = ++storeSearchSequence.current;
    setStoreSearching(true);
    const timer = setTimeout(() => {
      api.searchMonitoringGeography({ levels: ["store"], state: storeSearchState || undefined, query, limit: 8 })
        .then((response) => {
          if (storeSearchSequence.current !== sequence) return;
          setStoreResults(response.results.flatMap((entry: GeographyResult) => {
            const store = approvedStoreFromGeography(entry);
            return store ? [store] : [];
          }));
          setStoreNextOffset(response.offset + response.results.length);
          setStoreHasMore(response.hasMore);
          setStoreTotal(response.total ?? null);
        })
        .catch(() => { if (storeSearchSequence.current === sequence) setStoreSearchError("Store search couldn’t connect. Try again or enter the store manually."); })
        .finally(() => { if (storeSearchSequence.current === sequence) setStoreSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); if (storeSearchSequence.current === sequence) storeSearchSequence.current += 1; };
  }, [activePicker, api, canSubmit, manualStore, selectedStore, storeName, storeSearchAttempt, storeSearchState]);

  async function loadMoreStores() {
    if (storeSearching || storePageInFlight.current || !storeHasMore) return;
    const sequence = storeSearchSequence.current;
    storePageInFlight.current = true;
    setStoreSearching(true);
    setStoreSearchError("");
    try {
      const response = await api.searchMonitoringGeography({ levels: ["store"], state: storeSearchState || undefined, query: storeName.trim(), limit: 8, offset: storeNextOffset });
      if (storeSearchSequence.current !== sequence) return;
      const page = response.results.flatMap(entry => {
        const store = approvedStoreFromGeography(entry);
        return store ? [store] : [];
      });
      setStoreResults(current => [...new Map([...current, ...page].map(store => [`${store.state}:${store.id}`, store])).values()]);
      setStoreNextOffset(response.offset + response.results.length);
      setStoreHasMore(response.hasMore);
      setStoreTotal(response.total ?? null);
    } catch {
      if (storeSearchSequence.current === sequence) setStoreSearchError("More stores couldn’t load. Try again.");
    } finally {
      if (storeSearchSequence.current === sequence) { storePageInFlight.current = false; setStoreSearching(false); }
    }
  }

  function changeStoreSearchState(state: string) {
    if (state === storeSearchState) return;
    storeSearchSequence.current += 1;
    setStoreResults([]);
    setStoreHasMore(false);
    setStoreSearchState(state);
  }

  function changeBottleName(value: string) {
    setBottleName(value);
    setBottleId(null);
    setSuccess("");
  }

  function chooseBottle(bottle: RadarBottleOption) {
    setBottleName(bottle.name);
    setBottleId(bottle.id);
    setActivePicker(null);
  }

  function changeStoreName(value: string) {
    storeSearchSequence.current += 1;
    setStoreResults([]);
    setStoreSearching(value.trim().length >= 2);
    if (selectedStore) {
      setStoreAddress(""); setStoreCity(""); setStoreState(""); setStoreZip("");
    }
    setSelectedStore(null);
    setStoreName(value);
    setSuccess("");
  }

  function chooseStore(store: PostStoreSelection) {
    setSelectedStore(store);
    setStoreName(store.name);
    setStoreAddress(store.address);
    setStoreCity(store.city);
    setStoreState(store.state);
    setStoreZip(store.zip || "");
    setStoreResults([]);
    setActivePicker(null);
  }

  function startManualStore() {
    setManualStore(true);
    setSelectedStore(null);
    setStoreResults([]);
    setStoreAddress(""); setStoreCity(""); setStoreState(""); setStoreZip("");
    setActivePicker(null);
  }

  function returnToStoreSearch() {
    setManualStore(false);
    setSelectedStore(null);
    setStoreAddress(""); setStoreCity(""); setStoreState(""); setStoreZip("");
    setActivePicker("store");
  }

  function resetComposer() {
    void draft.clear().catch(() => undefined);
    setBottleName(""); setBottleId(null); setStoreName(""); setStoreAddress(""); setStoreCity(""); setStoreState(""); setStoreZip("");
    setSelectedStore(null); setManualStore(false); setStoreResults([]); setPrice(""); setQuantity(""); setCustomQuantity(false); setNotes(""); setActivePicker(null);
  }

  async function prepareNextDraft() {
    const nextBinding: SightingDraftBinding = { key: createSightingIdempotencyKey(), fingerprint: null };
    try {
      await SecureStore.setItemAsync(draftStorageKey, serializeSightingDraftBinding(nextBinding));
      draftBinding.current = nextBinding;
    } catch {
      setIdempotencyReady(false);
      setError("Signal saved, but secure draft protection could not prepare the next post. Restart the app before posting again.");
    }
  }

  async function selectPhoto(source: SightingPhotoSource) {
    if (photoBusy || pendingPhotoAttachment) return;
    setPhotoBusy(true);
    setError("");
    setPhotoMessage("");
    try {
      const result = await chooseSightingPhoto(source);
      if (result.error) {
        setPhotoMessage(result.error);
        return;
      }
      if (!result.photo) return;
      discardSightingPhoto(selectedPhoto);
      setSelectedPhoto(result.photo);
      setPhotoMessage("Photo ready. It will be attached after the Signal is saved.");
    } catch (caught) {
      setPhotoMessage(caught instanceof Error ? caught.message : "That photo could not be prepared. You can still post without it.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function removeSelectedPhoto() {
    if (pendingPhotoAttachment) return;
    discardSightingPhoto(selectedPhoto);
    setSelectedPhoto(null);
    setPhotoMessage("");
  }

  async function completePhotoAttachment(photo: SightingPhotoAsset) {
    discardSightingPhoto(photo);
    setSelectedPhoto(null);
    setPendingPhotoAttachment(null);
    setPhotoMessage("");
    resetComposer();
    setSuccess("Signal posted with photo evidence. Thanks for helping nearby members.");
    await prepareNextDraft();
  }

  async function retryPhotoUpload(attachment: PhotoJournalEntry) {
    if (photoBusy) return;
    setPhotoBusy(true);
    setError("");
    setPhotoMessage("Recovering photo evidence…");
    try {
      await journal.resume(api, sightingPhotoBlob);
      await completePhotoAttachment(attachment.photo);
    } catch {
      setError("Photo could not be completed. Retry the saved request without posting another Signal.");
      setPhotoMessage("");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    if (pendingPhotoAttachment) {
      await retryPhotoUpload(pendingPhotoAttachment);
      return;
    }
    if (!idempotencyReady) {
      setError("Secure draft protection is unavailable. Restart the app before posting.");
      return;
    }
    const built = buildPostSightingSubmission({
      bottleName,
      bottleId,
      bottleRarity: selectedBottleRarity,
      store: { id: selectedStore?.id || null, name: storeName, address: storeAddress, city: storeCity, state: storeState, zip: storeZip || undefined },
      price,
      quantity,
      notes,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(built.payload));
      const currentBinding = draftBinding.current;
      if (!currentBinding) throw new Error("Secure draft protection is unavailable. Restart the app before posting.");
      const requestBinding: SightingDraftBinding = currentBinding.fingerprint && currentBinding.fingerprint !== fingerprint
        ? { key: createSightingIdempotencyKey(), fingerprint }
        : { key: currentBinding.key, fingerprint };
      await SecureStore.setItemAsync(draftStorageKey, serializeSightingDraftBinding(requestBinding));
      draftBinding.current = requestBinding;
      if (selectedPhoto) {
        if (await journal.load()) throw new Error('Finish the saved photo retry before posting another Signal.');
        const retained = retainSightingPhoto(userId, selectedPhoto);
        await journal.prepare(built.payload, requestBinding.key, retained);
        const attachment = (await journal.load())!;
        discardSightingPhoto(selectedPhoto);
        setSelectedPhoto(retained);
        setPendingPhotoAttachment(attachment);
        await retryPhotoUpload(attachment);
      } else {
        const result = await api.submitSighting(built.payload, requestBinding.key);
        resetComposer();
        setSuccess(result.duplicate ? "That Signal was already saved. You are all set." : "Signal posted. Thanks for helping nearby members.");
        await prepareNextDraft();
      }
    } catch (caught) {
      setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Your Signal could not be posted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={memberScreenStyles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]} keyboardShouldPersistTaps="handled" style={styles.scroll}>
        <PageHeading title="Post a Signal" decorated={false} description="Share a sighting. Help your community. Earn points." />
        {loadingProfile ? <ActivityIndicator color={colors.accent} /> : null}
        {!loadingProfile && profile && !canSubmit ? <MemberCard><Text style={styles.blockedTitle}>Posting is not included with this membership</Text><Text style={styles.help}>Account shows the membership attached to this account.</Text></MemberCard> : null}
        {canSubmit ? <View style={styles.composer}>
          {!pendingPhotoAttachment ? <DraftNotice compact hasContent={draft.hasContent} notice={draft.notice} error={draft.error} onDiscard={discardDraft} /> : null}
          <ComposerSection icon="bottle-tonic-outline" title="Choose a bottle" required>
            {bottleCatalog.error ? <ErrorState message={bottleCatalog.error} onRetry={bottleCatalog.retry} /> : null}
            <Field autoCapitalize="words" autoCorrect={false} label="Bottle" onChangeText={changeBottleName} onFocus={() => setActivePicker("bottle")} placeholder="Search bottle catalog" value={bottleName} />
            {bottleId ? <SelectionNote icon="check-circle-outline" text="Catalog bottle selected" /> : bottleName.trim() ? <Text style={styles.helper}>Can’t find it? Keep the bottle name exactly as entered.</Text> : null}
            {activePicker === "bottle" && bottleName.trim().length >= 2 && !bottleId ? <SuggestionList empty="No catalog match. You can still use this name.">
              {bottleSuggestions.map((bottle) => <SuggestionRow key={bottle.id} onPress={() => chooseBottle(bottle)} subtitle={bottle.rarity ? bottle.rarity.replace("_", " ") : undefined} title={bottle.name} />)}
            </SuggestionList> : null}
          </ComposerSection>

          <View style={styles.divider} />
          <ComposerSection icon="storefront-outline" title="Find a retailer" required>
            {!manualStore ? <>
              {!selectedStore ? <Field autoCapitalize="words" autoCorrect={false} label="Store" onChangeText={changeStoreName} onFocus={() => setActivePicker("store")} placeholder="Store name, city, address or ZIP" value={storeName} /> : null}
              {activePicker === "store" && !selectedStore ? <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.storeStateRow} contentContainerStyle={styles.storeStateChips} accessibilityLabel="Store search state">
                {[{code:"",name:"All states"}, ...COVERAGE_STATES.filter(state=>state.code==="NC"), ...COVERAGE_STATES.filter(state=>state.code!=="NC")].map(state => <Pressable key={state.code} accessibilityRole="button" accessibilityLabel={state.name} accessibilityState={{selected:storeSearchState === state.code}} onPress={() => changeStoreSearchState(state.code)} style={[styles.chip,styles.storeStateChip,storeSearchState === state.code && styles.chipActive]}><Text style={[styles.chipText,storeSearchState === state.code && styles.chipTextActive]}>{state.code || state.name}</Text></Pressable>)}
              </ScrollView> : null}
              {selectedStore ? <View style={styles.selectedStore}><View style={styles.selectionCopy}><Text style={styles.selectionTitle}>{selectedStore.name}</Text><Text style={styles.selectionSubtitle}>{selectedStore.city}, {selectedStore.state} · {selectedStore.address}</Text></View><Pressable accessibilityLabel="Change selected retailer" accessibilityRole="button" hitSlop={8} onPress={() => { changeStoreName(""); setActivePicker("store"); }}><Text style={styles.textAction}>CHANGE</Text></Pressable></View> : null}
              {activePicker === "store" && storeName.trim().length >= 2 && !selectedStore ? <SuggestionList empty={storeSearching ? undefined : "No approved retailer match yet."} loading={storeSearching}>
                {storeSearchError ? <ErrorState message={storeSearchError} onRetry={() => { if (storeResults.length && storeHasMore) void loadMoreStores(); else setStoreSearchAttempt(value => value + 1); }} /> : null}
                {!storeSearching && !storeSearchError && storeName.trim().length >= 2 && !storeResults.length ? <Text style={styles.helper}>No matching stores. Try another name or enter the store manually.</Text> : null}
                {storeResults.length > 0 ? <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.storeResults}>
                  {storeResults.map((store) => <SuggestionRow key={`${store.state}:${store.id}`} onPress={() => chooseStore(store)} subtitle={`${store.city}, ${store.state} · ${store.address}`} title={store.name} />)}
                </ScrollView> : null}
                {storeResults.length > 0 && storeTotal !== null ? <Text style={styles.helper}>{storeResults.length} of {storeTotal} matching stores</Text> : null}
                {storeHasMore ? <Pressable accessibilityRole="button" disabled={storeSearching} onPress={() => void loadMoreStores()} style={styles.moreStores}><Text style={styles.manualActionText}>{storeSearching ? "Loading stores…" : "Show more stores"}</Text></Pressable> : null}
              </SuggestionList> : null}
              {!selectedStore ? <Pressable accessibilityRole="button" onPress={startManualStore} style={({ pressed }) => [styles.manualAction, pressed && styles.pressed]}><MaterialCommunityIcons color={colors.accent} name="pencil-outline" size={16} /><Text style={styles.manualActionText}>Enter store manually</Text></Pressable> : null}
            </> : <>
              <View style={styles.manualHeading}><Text style={styles.helper}>Manual store</Text><Pressable accessibilityRole="button" onPress={returnToStoreSearch}><Text style={styles.textAction}>SEARCH INSTEAD</Text></Pressable></View>
              <Field autoCapitalize="words" label="Retailer name" onChangeText={setStoreName} placeholder="Store name" value={storeName} />
              <Field autoCapitalize="words" label="Street address" onChangeText={setStoreAddress} placeholder="123 Main St" value={storeAddress} />
              <View style={styles.row}><View style={styles.city}><Field autoCapitalize="words" label="City" onChangeText={setStoreCity} placeholder="City" value={storeCity} /></View><View style={styles.state}><Field autoCapitalize="characters" label="State" maxLength={2} onChangeText={setStoreState} placeholder="NC" value={storeState} /></View></View>
            </>}
          </ComposerSection>

          <View style={styles.divider} />
          <ComposerSection icon="text-box-outline" title="Details">
            <View style={styles.priceField}><Text style={styles.label}>Shelf price</Text><View style={styles.priceInput}><Text style={styles.currency}>$</Text><TextInput accessibilityLabel="Shelf price" keyboardType="decimal-pad" onChangeText={setPrice} placeholder="69.99" placeholderTextColor={colors.muted} style={styles.priceTextInput} value={price} /></View></View>
            <View style={styles.field}><Text style={styles.label}>Quantity seen</Text><View style={styles.chips}>{POST_QUANTITY_CHOICES.map((choice) => <Pressable accessibilityRole="button" accessibilityState={{ selected: !customQuantity && quantity === choice }} key={choice} onPress={() => { setCustomQuantity(false); setQuantity(choice); }} style={[styles.chip, !customQuantity && quantity === choice && styles.chipActive]}><Text style={[styles.chipText, !customQuantity && quantity === choice && styles.chipTextActive]}>{choice}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityState={{ selected: customQuantity }} onPress={() => { setCustomQuantity(true); setQuantity(""); }} style={[styles.chip, customQuantity && styles.chipActive]}><Text style={[styles.chipText, customQuantity && styles.chipTextActive]}>Other</Text></Pressable></View></View>
            {customQuantity ? <Field accessibilityLabel="Custom quantity seen" label="Custom quantity" onChangeText={setQuantity} placeholder="Example: 2 behind counter" value={quantity} /> : null}
            <Field autoCapitalize="sentences" label="Notes" multiline numberOfLines={3} onChangeText={setNotes} placeholder="Anything nearby members should know" value={notes} />
            <View style={styles.photoEvidence}>
              <View style={styles.photoHeading}><View style={styles.photoTitleRow}><MaterialCommunityIcons color={colors.accent} name="camera-outline" size={18} /><Text style={styles.photoTitle}>Photo evidence</Text></View><Text style={styles.photoOptional}>OPTIONAL</Text></View>
              {!selectedPhoto ? <View style={styles.photoActions}>
                <Pressable accessibilityRole="button" disabled={photoBusy} onPress={() => void selectPhoto("camera")} style={({ pressed }) => [styles.photoAction, pressed && styles.pressed]}><MaterialCommunityIcons color={colors.text} name="camera" size={18} /><Text style={styles.photoActionText}>Take photo</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={photoBusy} onPress={() => void selectPhoto("library")} style={({ pressed }) => [styles.photoAction, pressed && styles.pressed]}><MaterialCommunityIcons color={colors.text} name="image-outline" size={18} /><Text style={styles.photoActionText}>Choose photo</Text></Pressable>
              </View> : <View style={styles.photoPreviewWrap}>
                <Image accessibilityLabel="Selected sighting evidence" resizeMode="cover" source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} />
                {!pendingPhotoAttachment ? <View style={styles.photoActions}>
                  <Pressable accessibilityRole="button" disabled={photoBusy} onPress={() => void selectPhoto("library")} style={({ pressed }) => [styles.photoAction, pressed && styles.pressed]}><Text style={styles.photoActionText}>Replace photo</Text></Pressable>
                  <Pressable accessibilityRole="button" disabled={photoBusy} onPress={removeSelectedPhoto} style={({ pressed }) => [styles.photoRemove, pressed && styles.pressed]}><Text style={styles.photoRemoveText}>Remove photo</Text></Pressable>
                </View> : null}
              </View>}
              {photoBusy ? <ActivityIndicator color={colors.accent} size="small" /> : null}
              {photoMessage ? <Text accessibilityRole="alert" style={styles.photoMessage}>{photoMessage}</Text> : null}
              <Text style={styles.photoDisclosure}>Evidence may appear publicly with this sighting. Photos are resized, re-encoded, and stripped of embedded metadata before upload.</Text>
            </View>
          </ComposerSection>

          {preview ? <SignalPreview preview={preview} /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {success ? <View style={{gap:6}}><Text accessibilityRole="alert" style={styles.success}>{success}</Text><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(app)/account/rewards", params: { section: "achievements" } })} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.accent,fontWeight:"700"}}>View points & badges →</Text></Pressable></View> : null}

          <Text style={styles.disclaimer}>Only report what you observed. Availability can change quickly, and manually entered bottles or stores may be reviewed.</Text>
        </View> : null}
        {!canSubmit && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
      {canSubmit ? <View style={styles.actionFooter}>
        {!requiredComplete ? <Text style={styles.actionHint}>Choose a bottle and retailer to continue.</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: actionDisabled }} disabled={actionDisabled} onPress={submit} style={({ pressed }) => [styles.submit, actionDisabled && styles.submitDisabled, pressed && !actionDisabled && styles.submitPressed]}>
          {submitting || photoBusy ? <ActivityIndicator color={colors.background} /> : <><MaterialCommunityIcons color={actionDisabled ? colors.muted : colors.background} name={pendingPhotoAttachment ? "cloud-upload-outline" : "broadcast"} size={18} /><Text style={[styles.submitText, actionDisabled && styles.submitTextDisabled]}>{pendingPhotoAttachment ? "Retry photo upload" : "Post Signal"}</Text></>}
        </Pressable>
      </View> : null}
    </KeyboardAvoidingView>
  );
}

function ComposerSection({ children, icon, required = false, title }: React.PropsWithChildren<{ icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; required?: boolean; title: string }>) {
  return <View style={styles.section}><View style={styles.sectionHeading}><MaterialCommunityIcons color={colors.accent} name={icon} size={20} /><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{required ? <Text style={styles.required}>REQUIRED</Text> : <Text style={styles.required}>OPTIONAL</Text>}</View>{children}</View>;
}

function SignalPreview({ preview }: { preview: PostSignalPreview }) {
  const accessibilityLabel = [preview.sourceLabel, preview.contextLabel, preview.bottleName, preview.storeName, preview.geography, preview.price, preview.quantity, preview.note, preview.reporter].filter(Boolean).join(", ");
  return <View style={styles.previewSection}>
    <View style={styles.previewHeading}><Text style={styles.previewHeadingText}>SIGNAL PREVIEW</Text><Text style={styles.previewHelp}>This is how your post will appear in Community.</Text></View>
    <View accessible accessibilityLabel={accessibilityLabel} style={[styles.previewCard, { backgroundColor: preview.surface, borderColor: preview.keyline }]}>
      <View style={styles.previewTopline}><View style={styles.previewSourceRow}><Text style={[styles.previewSource, { color: preview.accent }]}>{preview.sourceLabel}</Text><View style={[styles.previewKeyline, { backgroundColor: preview.keyline }]} /><Text style={[styles.previewContext, { color: preview.accent }]}>{preview.contextLabel}</Text></View><Text style={[styles.previewTime, { color: preview.secondaryText }]}>{preview.timeLabel}</Text></View>
      <Text numberOfLines={2} style={styles.previewBottle}>{preview.bottleName}</Text>
      <Text numberOfLines={2} style={styles.previewStore}>{preview.storeName}</Text>
      <Text numberOfLines={1} style={[styles.previewGeography, { color: preview.secondaryText }]}>{preview.geography}</Text>
      {preview.price || preview.quantity ? <View style={styles.previewMetaRow}>{preview.price ? <Text style={styles.previewPrice}>{preview.price}</Text> : null}{preview.price && preview.quantity ? <View style={[styles.previewMetaDivider, { backgroundColor: preview.keyline }]} /> : null}{preview.quantity ? <Text style={[styles.previewQuantity, { color: preview.secondaryText }]}>{preview.quantity}</Text> : null}</View> : null}
      {preview.note ? <Text numberOfLines={2} style={[styles.previewNote, { color: preview.secondaryText }]}>{preview.note}</Text> : null}
      {preview.reporter ? <Text numberOfLines={1} style={[styles.previewReporter, { color: preview.secondaryText }]}>{preview.reporter}</Text> : null}
    </View>
  </View>;
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };
function Field({ label, multiline, style, ...props }: FieldProps) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={props.accessibilityLabel || label} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multiline, style]} {...props} /></View>;
}

function SelectionNote({ icon, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; text: string }) {
  return <View style={styles.selectionNote}><MaterialCommunityIcons color={colors.success} name={icon} size={15} /><Text style={styles.selectionNoteText}>{text}</Text></View>;
}

function SuggestionList({ children, empty, loading = false }: React.PropsWithChildren<{ empty?: string; loading?: boolean }>) {
  const hasChildren = Children.toArray(children).length > 0;
  return <View style={styles.suggestions}>{loading && !hasChildren ? <ActivityIndicator color={colors.accent} size="small" /> : hasChildren ? children : empty ? <Text style={styles.suggestionEmpty}>{empty}</Text> : null}</View>;
}

function SuggestionRow({ onPress, subtitle, title }: { onPress: () => void; subtitle?: string; title: string }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}><View style={styles.selectionCopy}><Text style={styles.suggestionTitle}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={styles.suggestionSubtitle}>{subtitle}</Text> : null}</View><MaterialCommunityIcons color={colors.muted} name="chevron-right" size={18} /></Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { ...memberScreenStyles.content, paddingTop: 15, paddingBottom: 28, gap: 20 },
  blockedTitle: { color: colors.text, fontSize: typeScale.input, fontWeight: "700" },
  help: { color: colors.muted, fontSize: typeScale.small, lineHeight: 19 },
  composer: { gap: 18 },
  section: { gap: 10 },
  sectionHeading: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { flex: 1, color: colors.text, ...typography.section },
  required: { color: colors.muted, fontSize: typeScale.micro, fontWeight: "800", letterSpacing: 0.9 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
  field: { gap: 6, flexGrow: 1, flexShrink: 0 },
  label: { color: colors.muted, fontSize: typeScale.caption, fontWeight: "700" },
  input: { minHeight: layout.controlHeight, borderColor: colors.border, borderWidth: 1, borderRadius: layout.controlRadius, backgroundColor: colors.background, color: colors.text, fontSize: typeScale.input, paddingHorizontal: 12, paddingVertical: 9 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  helper: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  city: { flex: 3 },
  state: { flex: 1, minWidth: 72 },
  suggestions: { borderColor: colors.border, borderWidth: 1, borderRadius: layout.controlRadius, overflow: "hidden", backgroundColor: colors.background, minHeight: layout.controlHeight, justifyContent: "center" },
  suggestionRow: { minHeight: 48, paddingHorizontal: 11, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionTitle: { color: colors.text, fontSize: typeScale.small, fontWeight: "700" },
  suggestionSubtitle: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15 },
  suggestionEmpty: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16, padding: 11 },
  pressed: { backgroundColor: colors.surfaceRaised },
  selectionNote: { flexDirection: "row", alignItems: "center", gap: 5 },
  selectionNoteText: { color: colors.success, fontSize: typeScale.caption, fontWeight: "700" },
  selectedStore: { borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth, borderRadius: layout.controlRadius, padding: 11, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceRaised },
  selectionCopy: { flex: 1, gap: 2 },
  selectionTitle: { color: colors.text, fontSize: typeScale.small, fontWeight: "800" },
  selectionSubtitle: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15 },
  textAction: { color: colors.accent, fontSize: typeScale.caption, fontWeight: "900", letterSpacing: 0.6 },
  manualAction: { minHeight: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, marginLeft: -9 },
  manualActionText: { color: colors.accent, fontSize: typeScale.small, fontWeight: "800" },
  moreStores: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  storeStateChips: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4 },
  storeStateRow: { height: 52, flexGrow: 0, flexShrink: 0 },
  storeStateChip: { minHeight: 44 },
  storeResults: { maxHeight: 320, flexGrow: 0 },
  manualHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  priceField: { gap: 6 },
  priceInput: { minHeight: layout.controlHeight, borderColor: colors.border, borderWidth: 1, borderRadius: layout.controlRadius, backgroundColor: colors.background, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  currency: { color: colors.text, fontSize: typeScale.input, fontWeight: "700" },
  priceTextInput: { flex: 1, color: colors.text, fontSize: typeScale.input, paddingHorizontal: 7, paddingVertical: 9 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { minWidth: 46, minHeight: layout.controlHeight, borderColor: colors.border, borderWidth: 1, borderRadius: layout.controlRadius, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: colors.background },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.muted, fontSize: typeScale.small, fontWeight: "700" },
  chipTextActive: { color: colors.accent },
  photoEvidence: { gap: 10, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  photoHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  photoTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  photoTitle: { color: colors.text, fontSize: typeScale.small, fontWeight: "800" },
  photoOptional: { color: colors.muted, fontSize: typeScale.micro, fontWeight: "800", letterSpacing: 0.9 },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoAction: { minHeight: layout.controlHeight, borderColor: colors.border, borderWidth: 1, borderRadius: layout.controlRadius, backgroundColor: colors.background, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  photoActionText: { color: colors.text, fontSize: typeScale.small, fontWeight: "800" },
  photoPreviewWrap: { gap: 9 },
  photoPreview: { width: "100%", height: 178, borderRadius: 11, backgroundColor: colors.background },
  photoRemove: { minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  photoRemoveText: { color: colors.danger, fontSize: typeScale.small, fontWeight: "800" },
  photoMessage: { color: colors.accent, fontSize: typeScale.caption, lineHeight: 16 },
  photoDisclosure: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15 },

  previewSection: { gap: 8, marginTop: 2 },
  previewHeading: { gap: 3 },
  previewHeadingText: { color: colors.accent, fontSize: typeScale.caption, lineHeight: 14, fontWeight: "900", letterSpacing: 1.05 },
  previewHelp: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15 },
  previewCard: { backgroundColor: "#1A1B1D", borderColor: "#3E4146", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 5.5 },
  previewTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 1 },
  previewSourceRow: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  previewSource: { color: "#B8BDC5", fontSize: typeScale.caption, lineHeight: 14, fontWeight: "900", letterSpacing: 1.05 },
  previewKeyline: { width: 1, height: 11, backgroundColor: "#3E4146" },
  previewContext: { color: "#A9ADB4", fontSize: typeScale.micro, lineHeight: 13, fontWeight: "800", letterSpacing: 0.8 },
  previewTime: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15, fontWeight: "600" },
  previewBottle: { color: colors.text, fontFamily: fonts.bottle, fontSize: typeScale.section, lineHeight: 26 },
  previewStore: { color: colors.text, fontSize: typeScale.body, lineHeight: 19, fontWeight: "600" },
  previewGeography: { color: colors.muted, fontSize: typeScale.small, lineHeight: 17, fontWeight: "500" },
  previewMetaRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 1 },
  previewMetaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  previewPrice: { color: colors.text, fontSize: typeScale.small, lineHeight: 18, fontWeight: "700" },
  previewQuantity: { color: colors.muted, fontSize: typeScale.small, lineHeight: 17, fontWeight: "600", flexShrink: 1 },
  previewNote: { color: colors.muted, fontSize: typeScale.small, lineHeight: 17, marginTop: 1 },
  previewReporter: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15, fontWeight: "600", marginTop: 1 },
  error: { color: colors.danger, fontSize: typeScale.small, lineHeight: 18 },
  success: { color: colors.success, fontSize: typeScale.small, lineHeight: 18 },
  disclaimer: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15 },
  actionFooter: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, gap: 6 },
  actionHint: { color: colors.muted, fontSize: typeScale.caption, textAlign: "center" },
  submit: { minHeight: layout.controlHeight, borderRadius: layout.controlRadius, backgroundColor: colors.accent, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  submitDisabled: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 },
  submitPressed: { backgroundColor: colors.accentPressed },
  submitText: { color: colors.background, fontSize: typeScale.body, fontWeight: "900" },
  submitTextDisabled: { color: colors.muted },
});

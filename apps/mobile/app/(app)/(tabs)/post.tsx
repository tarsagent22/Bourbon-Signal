import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { GeographySearchResponse, MemberProfile, RadarBottleOption } from "../../../src/api/types";
import { MemberCard, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { createSightingIdempotencyKey, parseSightingDraftBinding, serializeSightingDraftBinding, SIGHTING_IDEMPOTENCY_STORAGE_KEY, type SightingDraftBinding } from "../../../src/sightings/manual-sighting";
import { approvedStoreFromGeography, buildPostSignalPreview, buildPostSightingSubmission, filterBottleSuggestions, isPostRequiredComplete, POST_QUANTITY_CHOICES, type PostSignalPreview, type PostStoreSelection } from "../../../src/sightings/post-composer";
import { colors } from "../../../src/theme";

type ActivePicker = "bottle" | "store" | null;
type GeographyResult = GeographySearchResponse["results"][number];

export default function PostScreen() {
  const api = useMobileApi();
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [bottleCatalog, setBottleCatalog] = useState<RadarBottleOption[]>([]);
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
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [customQuantity, setCustomQuantity] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [idempotencyReady, setIdempotencyReady] = useState(false);
  const draftBinding = useRef<SightingDraftBinding | null>(null);
  const storeSearchSequence = useRef(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getMemberProfile(),
      api.listRadarBottles().catch(() => [] as RadarBottleOption[]),
    ])
      .then(([result, bottles]) => { if (active) { setProfile(result.profile); setBottleCatalog(bottles); } })
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
        const stored = await SecureStore.getItemAsync(SIGHTING_IDEMPOTENCY_STORAGE_KEY);
        const binding = parseSightingDraftBinding(stored) || { key: createSightingIdempotencyKey(), fingerprint: null };
        if (!stored || !stored.trim().startsWith("{")) await SecureStore.setItemAsync(SIGHTING_IDEMPOTENCY_STORAGE_KEY, serializeSightingDraftBinding(binding));
        if (active) { draftBinding.current = binding; setIdempotencyReady(true); }
      } catch {
        if (active) setError("Secure draft protection is unavailable. Restart the app before posting.");
      }
    }
    void prepareDurableDraft();
    return () => { active = false; };
  }, []);

  const canSubmit = profile?.entitlements.canSubmitSignals === true;
  const bottleSuggestions = useMemo(() => filterBottleSuggestions(bottleCatalog, bottleName), [bottleCatalog, bottleName]);
  const requiredComplete = useMemo(() => isPostRequiredComplete({ bottleName, storeName, storeAddress, storeCity, storeState }), [bottleName, storeAddress, storeCity, storeName, storeState]);
  const selectedBottleRarity = useMemo(() => bottleCatalog.find((bottle) => bottle.id === bottleId)?.rarity, [bottleCatalog, bottleId]);
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
  const actionDisabled = !requiredComplete || !idempotencyReady || submitting;

  useEffect(() => {
    const query = storeName.replace(/\s+/g, " ").trim();
    if (!canSubmit || manualStore || selectedStore || activePicker !== "store" || query.length < 2) {
      storeSearchSequence.current += 1;
      setStoreResults([]);
      setStoreSearching(false);
      return;
    }
    const sequence = ++storeSearchSequence.current;
    const timer = setTimeout(() => {
      setStoreSearching(true);
      api.searchMonitoringGeography({ levels: ["store"], query, limit: 6 })
        .then((response) => response.results.flatMap((entry: GeographyResult) => {
          const store = approvedStoreFromGeography(entry);
          return store ? [store] : [];
        }))
        .then((results) => { if (storeSearchSequence.current === sequence) setStoreResults(results); })
        .catch(() => { if (storeSearchSequence.current === sequence) setStoreResults([]); })
        .finally(() => { if (storeSearchSequence.current === sequence) setStoreSearching(false); });
    }, 250);
    return () => clearTimeout(timer);
  }, [activePicker, api, canSubmit, manualStore, selectedStore, storeName]);

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
    setStoreSearching(false);
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
    setBottleName(""); setBottleId(null); setStoreName(""); setStoreAddress(""); setStoreCity(""); setStoreState(""); setStoreZip("");
    setSelectedStore(null); setManualStore(false); setStoreResults([]); setPrice(""); setQuantity(""); setCustomQuantity(false); setNotes(""); setActivePicker(null);
  }

  async function submit() {
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
      await SecureStore.setItemAsync(SIGHTING_IDEMPOTENCY_STORAGE_KEY, serializeSightingDraftBinding(requestBinding));
      draftBinding.current = requestBinding;
      const result = await api.submitSighting(built.payload, requestBinding.key);
      resetComposer();
      setSuccess(result.duplicate ? "That Signal was already saved. You are all set." : "Signal posted. Thanks for helping nearby members.");
      const nextBinding: SightingDraftBinding = { key: createSightingIdempotencyKey(), fingerprint: null };
      try {
        await SecureStore.setItemAsync(SIGHTING_IDEMPOTENCY_STORAGE_KEY, serializeSightingDraftBinding(nextBinding));
        draftBinding.current = nextBinding;
      } catch {
        setIdempotencyReady(false);
        setError("Signal saved, but secure draft protection could not prepare the next post. Restart the app before posting again.");
      }
    } catch (caught) {
      setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Your Signal could not be posted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88} style={memberScreenStyles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
        <View style={styles.postIntro}><Text accessibilityRole="header" style={styles.introTitle}>Post a Signal</Text><Text style={styles.introDescription}>Share bottle sightings with the community and earn points</Text></View>
        {loadingProfile ? <ActivityIndicator color={colors.accent} /> : null}
        {!loadingProfile && profile && !canSubmit ? <MemberCard><Text style={styles.blockedTitle}>Posting is not included with this membership</Text><Text style={styles.help}>Account shows the membership attached to this account.</Text></MemberCard> : null}
        {canSubmit ? <View style={styles.composer}>
          <ComposerSection icon="bottle-tonic-outline" title="Choose a bottle" required>
            <Field autoCapitalize="words" autoCorrect={false} label="Bottle" onChangeText={changeBottleName} onFocus={() => setActivePicker("bottle")} placeholder="Search bottle catalog" value={bottleName} />
            {bottleId ? <SelectionNote icon="check-circle-outline" text="Catalog bottle selected" /> : bottleName.trim() ? <Text style={styles.helper}>Can’t find it? Keep the bottle name exactly as entered.</Text> : null}
            {activePicker === "bottle" && bottleName.trim().length >= 2 && !bottleId ? <SuggestionList empty="No catalog match. You can still use this name.">
              {bottleSuggestions.map((bottle) => <SuggestionRow key={bottle.id} onPress={() => chooseBottle(bottle)} subtitle={bottle.rarity ? bottle.rarity.replace("_", " ") : undefined} title={bottle.name} />)}
            </SuggestionList> : null}
          </ComposerSection>

          <View style={styles.divider} />
          <ComposerSection icon="storefront-outline" title="Find a retailer" required>
            {!manualStore ? <>
              <Field autoCapitalize="words" autoCorrect={false} label="Store" onChangeText={changeStoreName} onFocus={() => setActivePicker("store")} placeholder="Search retailer, city, or address" value={storeName} />
              {selectedStore ? <View style={styles.selectedStore}><View style={styles.selectionCopy}><Text style={styles.selectionTitle}>{selectedStore.name}</Text><Text style={styles.selectionSubtitle}>{selectedStore.city}, {selectedStore.state} · {selectedStore.address}</Text></View><Pressable accessibilityLabel="Change selected retailer" accessibilityRole="button" hitSlop={8} onPress={() => { changeStoreName(""); setActivePicker("store"); }}><Text style={styles.textAction}>CHANGE</Text></Pressable></View> : null}
              {activePicker === "store" && storeName.trim().length >= 2 && !selectedStore ? <SuggestionList empty={storeSearching ? undefined : "No approved retailer match yet."} loading={storeSearching}>
                {storeResults.map((store) => <SuggestionRow key={`${store.state}:${store.id}`} onPress={() => chooseStore(store)} subtitle={`${store.city}, ${store.state} · ${store.address}`} title={store.name} />)}
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
          <ComposerSection icon="text-box-outline" title="Other Details (optional)">
            <View style={styles.priceField}><Text style={styles.label}>Shelf price</Text><View style={styles.priceInput}><Text style={styles.currency}>$</Text><TextInput accessibilityLabel="Shelf price" keyboardType="decimal-pad" onChangeText={setPrice} placeholder="69.99" placeholderTextColor={colors.muted} style={styles.priceTextInput} value={price} /></View></View>
            <View style={styles.field}><Text style={styles.label}>Quantity seen</Text><View style={styles.chips}>{POST_QUANTITY_CHOICES.map((choice) => <Pressable accessibilityRole="button" accessibilityState={{ selected: !customQuantity && quantity === choice }} key={choice} onPress={() => { setCustomQuantity(false); setQuantity(choice); }} style={[styles.chip, !customQuantity && quantity === choice && styles.chipActive]}><Text style={[styles.chipText, !customQuantity && quantity === choice && styles.chipTextActive]}>{choice}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityState={{ selected: customQuantity }} onPress={() => { setCustomQuantity(true); setQuantity(""); }} style={[styles.chip, customQuantity && styles.chipActive]}><Text style={[styles.chipText, customQuantity && styles.chipTextActive]}>Other</Text></Pressable></View></View>
            {customQuantity ? <Field accessibilityLabel="Custom quantity seen" label="Custom quantity" onChangeText={setQuantity} placeholder="Example: 2 behind counter" value={quantity} /> : null}
            <Field autoCapitalize="sentences" label="Notes" multiline numberOfLines={3} onChangeText={setNotes} placeholder="Anything nearby members should know" value={notes} />
          </ComposerSection>

          {preview ? <SignalPreview preview={preview} /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
          <Text style={styles.disclaimer}>Only report what you observed. Availability can change quickly, and manually entered bottles or stores may be reviewed.</Text>
        </View> : null}
        {!canSubmit && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
      {canSubmit ? <View style={styles.actionFooter}>
        {!requiredComplete ? <Text style={styles.actionHint}>Choose a bottle and retailer to continue.</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: actionDisabled }} disabled={actionDisabled} onPress={submit} style={({ pressed }) => [styles.submit, actionDisabled && styles.submitDisabled, pressed && !actionDisabled && styles.submitPressed]}>
          {submitting ? <ActivityIndicator color={colors.background} /> : <><MaterialCommunityIcons color={actionDisabled ? colors.muted : colors.background} name="broadcast" size={18} /><Text style={[styles.submitText, actionDisabled && styles.submitTextDisabled]}>Post Signal</Text></>}
        </Pressable>
      </View> : null}
    </KeyboardAvoidingView>
  );
}

function ComposerSection({ children, icon, required = false, title }: React.PropsWithChildren<{ icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; required?: boolean; title: string }>) {
  return <View style={styles.section}><View style={styles.sectionHeading}><MaterialCommunityIcons color={colors.accent} name={icon} size={20} /><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{required ? <Text style={styles.required}>REQUIRED</Text> : null}</View>{children}</View>;
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
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <View style={styles.suggestions}>{loading ? <ActivityIndicator color={colors.accent} size="small" /> : hasChildren ? children : empty ? <Text style={styles.suggestionEmpty}>{empty}</Text> : null}</View>;
}

function SuggestionRow({ onPress, subtitle, title }: { onPress: () => void; subtitle?: string; title: string }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}><View style={styles.selectionCopy}><Text style={styles.suggestionTitle}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={styles.suggestionSubtitle}>{subtitle}</Text> : null}</View><MaterialCommunityIcons color={colors.muted} name="chevron-right" size={18} /></Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { ...memberScreenStyles.content, paddingTop: 15, paddingBottom: 28, gap: 20 },
  postIntro: { gap: 6 },
  introTitle: { color: colors.text, fontFamily: "Fraunces_700Bold", fontSize: 31, lineHeight: 35, letterSpacing: -0.45 },
  introDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  blockedTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  help: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  composer: { gap: 18 },
  section: { gap: 10 },
  sectionHeading: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800" },
  required: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.9 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
  field: { gap: 6, flex: 1 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  input: { minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.background, color: colors.text, fontSize: 15, paddingHorizontal: 12, paddingVertical: 9 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  city: { flex: 3 },
  state: { flex: 1, minWidth: 72 },
  suggestions: { borderColor: colors.border, borderWidth: 1, borderRadius: 11, overflow: "hidden", backgroundColor: colors.background, minHeight: 42, justifyContent: "center" },
  suggestionRow: { minHeight: 48, paddingHorizontal: 11, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  suggestionSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  suggestionEmpty: { color: colors.muted, fontSize: 11, lineHeight: 16, padding: 11 },
  pressed: { backgroundColor: colors.surfaceRaised },
  selectionNote: { flexDirection: "row", alignItems: "center", gap: 5 },
  selectionNoteText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  selectedStore: { borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, padding: 11, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceRaised },
  selectionCopy: { flex: 1, gap: 2 },
  selectionTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  selectionSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  textAction: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  manualAction: { minHeight: 38, alignSelf: "flex-start", borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, marginLeft: -9 },
  manualActionText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  manualHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  priceField: { gap: 6 },
  priceInput: { minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.background, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  currency: { color: colors.text, fontSize: 15, fontWeight: "700" },
  priceTextInput: { flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 7, paddingVertical: 9 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { minWidth: 46, minHeight: 36, borderColor: colors.border, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: colors.background },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: colors.accent },
  previewSection: { gap: 8, marginTop: 2 },
  previewHeading: { gap: 3 },
  previewHeadingText: { color: colors.accent, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.05 },
  previewHelp: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  previewCard: { backgroundColor: "#1A1B1D", borderColor: "#3E4146", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 5.5 },
  previewTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 1 },
  previewSourceRow: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  previewSource: { color: "#B8BDC5", fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.05 },
  previewKeyline: { width: 1, height: 11, backgroundColor: "#3E4146" },
  previewContext: { color: "#A9ADB4", fontSize: 9, lineHeight: 13, fontWeight: "800", letterSpacing: 0.8 },
  previewTime: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  previewBottle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2 },
  previewStore: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  previewGeography: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  previewMetaRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 1 },
  previewMetaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  previewPrice: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  previewQuantity: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "600", flexShrink: 1 },
  previewNote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 1 },
  previewReporter: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 1 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontSize: 12, lineHeight: 18 },
  disclaimer: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  actionFooter: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, gap: 6 },
  actionHint: { color: colors.muted, fontSize: 10, textAlign: "center" },
  submit: { minHeight: 48, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  submitDisabled: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 },
  submitPressed: { backgroundColor: colors.accentPressed },
  submitText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  submitTextDisabled: { color: colors.muted },
});

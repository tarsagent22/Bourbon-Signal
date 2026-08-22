import { useAuth } from "@clerk/expo";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberProfile, SightingSubmission } from "../../../src/api/types";
import { MemberCard, ScreenIntro, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { buildManualStoreId, createSightingIdempotencyKey, parseSightingDraftBinding, serializeSightingDraftBinding, SIGHTING_IDEMPOTENCY_STORAGE_KEY, type SightingDraftBinding } from "../../../src/sightings/manual-sighting";
import { colors } from "../../../src/theme";

export default function PostScreen() {
  const api = useMobileApi();
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [bottleName, setBottleName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeState, setStoreState] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [idempotencyReady, setIdempotencyReady] = useState(false);
  const draftBinding = useRef<SightingDraftBinding | null>(null);

  useEffect(() => {
    let active = true;
    api.getMemberProfile()
      .then((result) => { if (active) setProfile(result.profile); })
      .catch(async (caught) => {
        if (caught instanceof MobileApiError && caught.status === 401) await signOut();
        else if (active) setError(caught instanceof Error ? caught.message : "Posting access is temporarily unavailable.");
      })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [api, signOut]);

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
  const requiredComplete = useMemo(() => Boolean(bottleName.trim() && storeName.trim() && storeAddress.trim() && storeCity.trim() && /^[A-Za-z]{2}$/.test(storeState.trim())), [bottleName, storeAddress, storeCity, storeName, storeState]);

  async function submit() {
    if (!idempotencyReady) {
      setError("Secure draft protection is unavailable. Restart the app before posting.");
      return;
    }
    if (!requiredComplete || submitting) {
      setError("Add the bottle, store, street address, city, and two-letter state.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    const normalizedState = storeState.trim().toUpperCase();
    const parsedPrice = price.trim() ? Number(price.replace(/[$,]/g, "")) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("Enter a valid shelf price or leave it blank.");
      setSubmitting(false);
      return;
    }
    const payload: SightingSubmission = {
        bottleName: bottleName.trim(),
        storeId: buildManualStoreId(storeName, storeAddress, storeCity, normalizedState),
        storeName: storeName.trim(),
        storeAddress: storeAddress.trim(),
        storeCity: storeCity.trim(),
        storeState: normalizedState,
        quantityEstimate: quantity.trim() || undefined,
        price: parsedPrice,
        notes: notes.trim() || undefined,
        sightingType: "seen_in_store",
        reviewState: {
          needsStoreReview: true,
          manualStoreName: storeName.trim(),
          manualStoreCity: storeCity.trim(),
          manualStoreState: normalizedState,
        },
      };
    try {
      const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(payload));
      const currentBinding = draftBinding.current;
      if (!currentBinding) throw new Error("Secure draft protection is unavailable. Restart the app before posting.");
      const requestBinding: SightingDraftBinding = currentBinding.fingerprint && currentBinding.fingerprint !== fingerprint
        ? { key: createSightingIdempotencyKey(), fingerprint }
        : { key: currentBinding.key, fingerprint };
      await SecureStore.setItemAsync(SIGHTING_IDEMPOTENCY_STORAGE_KEY, serializeSightingDraftBinding(requestBinding));
      draftBinding.current = requestBinding;
      const result = await api.submitSighting(payload, requestBinding.key);
      setSuccess(result.duplicate ? "That Signal was already saved. You are all set." : "Signal posted. Thanks for helping nearby members.");
      setBottleName(""); setStoreName(""); setStoreAddress(""); setStoreCity(""); setStoreState(""); setPrice(""); setQuantity(""); setNotes("");
      const nextBinding: SightingDraftBinding = { key: createSightingIdempotencyKey(), fingerprint: null };
      try {
        await SecureStore.setItemAsync(SIGHTING_IDEMPOTENCY_STORAGE_KEY, serializeSightingDraftBinding(nextBinding));
        draftBinding.current = nextBinding;
      } catch {
        setIdempotencyReady(false);
        setError("Signal saved, but secure draft protection could not prepare the next post. Restart the app before posting again.");
      }
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 401) await signOut();
      else setError(caught instanceof Error ? caught.message : "Your Signal could not be posted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88} style={memberScreenStyles.screen}>
      <ScrollView contentContainerStyle={memberScreenStyles.content} keyboardShouldPersistTaps="handled">
        <ScreenIntro eyebrow="Member report" title="Post a Signal" description="A quick, durable store sighting. Required facts come first; price, quantity, and context stay optional." />
        {loadingProfile ? <ActivityIndicator color={colors.accent} /> : null}
        {!loadingProfile && profile && !canSubmit ? <MemberCard><Text style={styles.blockedTitle}>Posting is not included with this membership</Text><Text style={styles.help}>HQ shows the membership attached to this account.</Text></MemberCard> : null}
        {canSubmit ? <MemberCard>
          <Field autoCapitalize="words" label="Bottle" onChangeText={setBottleName} placeholder="Bottle name" value={bottleName} />
          <Field autoCapitalize="words" label="Store" onChangeText={setStoreName} placeholder="Retailer name" value={storeName} />
          <Field autoCapitalize="words" label="Street address" onChangeText={setStoreAddress} placeholder="123 Main St" value={storeAddress} />
          <View style={styles.row}>
            <View style={styles.city}><Field autoCapitalize="words" label="City" onChangeText={setStoreCity} placeholder="City" value={storeCity} /></View>
            <View style={styles.state}><Field autoCapitalize="characters" label="State" maxLength={2} onChangeText={setStoreState} placeholder="NC" value={storeState} /></View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}><Field keyboardType="decimal-pad" label="Price (optional)" onChangeText={setPrice} placeholder="69.99" value={price} /></View>
            <View style={styles.half}><Field label="Quantity (optional)" onChangeText={setQuantity} placeholder="2 on shelf" value={quantity} /></View>
          </View>
          <Field autoCapitalize="sentences" label="Notes (optional)" multiline onChangeText={setNotes} placeholder="Useful context for nearby members" value={notes} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !requiredComplete || !idempotencyReady || submitting }} disabled={!requiredComplete || !idempotencyReady || submitting} onPress={submit} style={({ pressed }) => [styles.submit, (!requiredComplete || !idempotencyReady || submitting) && styles.submitDisabled, pressed && styles.submitPressed]}>
            {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.submitText}>Post Signal</Text>}
          </Pressable>
          <Text style={styles.disclaimer}>Availability can change quickly. Only report what you observed; Bourbon Signal may review manually entered bottles or stores.</Text>
        </MemberCard> : null}
        {!canSubmit && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };
function Field({ label, multiline, ...props }: FieldProps) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multiline]} {...props} /></View>;
}

const styles = StyleSheet.create({
  blockedTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  help: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  field: { gap: 7, flex: 1 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.background, color: colors.text, fontSize: 16, paddingHorizontal: 13, paddingVertical: 11 },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  city: { flex: 3 }, state: { flex: 1, minWidth: 76 }, half: { flex: 1 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  success: { color: colors.success, fontSize: 13, lineHeight: 19 },
  submit: { minHeight: 52, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  submitDisabled: { opacity: 0.45 },
  submitPressed: { backgroundColor: colors.accentPressed },
  submitText: { color: colors.background, fontSize: 15, fontWeight: "800" },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 17 },
});

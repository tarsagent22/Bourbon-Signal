import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import { openAppleSubscriptionManagement } from "../../../src/account/subscription-management";
import { useAccessibleStatus } from "../../../src/hooks/useAccessibleStatus";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

export default function DeleteAccountScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const { signOut } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [error, setError] = useState("");
  useAccessibleStatus(error);
  const confirmed = confirmation.trim() === "DELETE";

  async function manageAppleSubscription() {
    if (subscriptionBusy) return;
    setSubscriptionBusy(true);
    setError("");
    try {
      await openAppleSubscriptionManagement(Linking.openURL);
    } catch {
      setError("App Store subscription settings could not be opened. Open the App Store, tap your profile, then Subscriptions.");
    } finally {
      setSubscriptionBusy(false);
    }
  }

  async function deleteAccount() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.requestAccountDeletion();
      if (!result.accessRevoked) {
        setError("Account access could not be revoked yet. Try again.");
        return;
      }
      await signOut().catch(() => undefined);
      router.replace("/");
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.code === "RECENT_AUTHENTICATION_REQUIRED") {
        setError("For security, sign out and sign in again, then return here to delete your account.");
      } else {
        setError(caught instanceof Error ? caught.message : "Account deletion could not start safely. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PERMANENT ACTION</Text>
        <Text accessibilityRole="header" style={styles.title}>Delete account</Text>
        <Text style={styles.intro}>This permanently removes your Bourbon Signal access. It cannot be undone.</Text>
      </View>

      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.panelTitle}>What happens now</Text>
        <Text style={styles.body}>• Alert and push delivery are disabled before your identity is removed.</Text>
        <Text style={styles.body}>• Active sessions and registered push devices are revoked.</Text>
        <Text style={styles.body}>• Your Cellar, recommendations, hunt outcomes, local preview, and Community posts are removed from active product storage.</Text>
        <Text style={styles.body}>• Limited billing, gift, referral, rewards, fulfillment, coverage-request, retailer, fraud-prevention, and legal records may remain where required.</Text>
        <Text style={styles.body}>• Uploaded sighting proof files are queued for separate storage cleanup.</Text>
      </View>

      <View style={styles.subscriptionPanel}>
        <Text accessibilityRole="header" style={styles.panelTitle}>Apple subscriptions are separate</Text>
        <Text style={styles.body}>Bourbon Signal cannot cancel an Apple subscription. Apple billing continues until you cancel it in the App Store. Deleting your account does not cancel Apple billing.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ busy: subscriptionBusy, disabled: subscriptionBusy || busy }} disabled={subscriptionBusy || busy} onPress={() => void manageAppleSubscription()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>{subscriptionBusy ? "Opening…" : "Manage subscriptions in the App Store"}</Text>
        </Pressable>

      </View>

      <View style={styles.confirmation}>
        <Text style={styles.confirmLabel}>Type DELETE to confirm</Text>
        <TextInput accessibilityLabel="Type DELETE to confirm permanent account deletion" autoCapitalize="characters" autoCorrect={false} editable={!busy} maxLength={16} onChangeText={(value) => { setConfirmation(value); setError(""); }} placeholder="DELETE" placeholderTextColor={colors.muted} style={styles.input} value={confirmation} />
        <Text style={styles.hint}>You may be asked to sign in again if your last verification is more than 10 minutes old.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: !confirmed || busy }} disabled={!confirmed || busy} onPress={() => void deleteAccount()} style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed, (!confirmed || busy) && styles.disabled]}>
          {busy ? <ActivityIndicator accessibilityLabel="Deleting account" color={colors.text} /> : <Text style={styles.deleteText}>Permanently delete account</Text>}
        </Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 56, gap: 18 }, hero: { gap: 8, paddingVertical: 8 },
  eyebrow: { color: colors.danger, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 }, title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "900" }, intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  panel: { backgroundColor: colors.surface, borderRadius: 16, padding: 17, gap: 9 }, subscriptionPanel: { backgroundColor: colors.surfaceRaised, borderRadius: 16, padding: 17, gap: 11 }, panelTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "800" }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  secondaryButton: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }, secondaryButtonText: { color: colors.accent, fontSize: 14, fontWeight: "800", textAlign: "center" },
  confirmation: { gap: 10 }, confirmLabel: { color: colors.text, fontSize: 15, fontWeight: "800" }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.danger, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: 16, letterSpacing: 1.2 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  deleteButton: { minHeight: 52, marginTop: 4, borderRadius: 12, backgroundColor: "#8F352D", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }, deletePressed: { backgroundColor: "#742820" }, deleteText: { color: colors.text, fontSize: 15, fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
});

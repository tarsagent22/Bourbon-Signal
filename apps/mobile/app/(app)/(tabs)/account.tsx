import { useAuth } from "@clerk/expo";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMobileApi, MobileApiError } from "../../../src/api/client";
import type { MemberProfile } from "../../../src/api/types";
import { colors } from "../../../src/theme";

const SUPPORT_URL = "https://www.bourbonsignal.com/support";
const PRIVACY_URL = "https://www.bourbonsignal.com/legal/privacy";
const ACCOUNT_DELETION_URL = "mailto:support@bourbonsignal.com?subject=Bourbon%20Signal%20account%20deletion%20request&body=Please%20delete%20my%20Bourbon%20Signal%20account.%20I%20am%20sending%20this%20request%20from%20the%20email%20address%20associated%20with%20my%20account.";

export default function AccountScreen() {
  const { getToken, signOut } = useAuth();
  const api = useMemo(() => createMobileApi({ getToken }), [getToken]);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.getMemberProfile()
      .then((result) => { if (active) setProfile(result.profile); })
      .catch((caught) => {
        if (active) setError(caught instanceof MobileApiError ? caught.message : "Membership details are temporarily unavailable.");
      });
    return () => { active = false; };
  }, [api]);

  async function openExternal(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setError("That link could not be opened. Contact support@bourbonsignal.com.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} style={styles.screen}>
      {!profile && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {profile ? <>
        <Text style={styles.eyebrow}>MEMBER ACCOUNT</Text>
        <Text style={styles.title}>{profile.identity?.label || "Bourbon Signal Member"}</Text>
        <View style={styles.card}>
          <Row label="Membership" value={profile.membership.label} />
          <Row label="Signal Feed" value={profile.entitlements.fullFeed ? "Full access" : "Preview access"} />
          <Row label="Send Signals" value={profile.entitlements.canSubmitSignals ? "Available" : "Unavailable"} />
        </View>
      </> : null}

      <View style={styles.links}>
        <LinkRow label="Support" onPress={() => openExternal(SUPPORT_URL)} />
        <LinkRow label="Privacy policy" onPress={() => openExternal(PRIVACY_URL)} />
        <LinkRow danger label="Request account deletion" onPress={() => openExternal(ACCOUNT_DELETION_URL)} />
      </View>
      <Text style={styles.deletionNote}>Deletion requests open a pre-addressed email. Support verifies ownership, removes the account, and confirms any records retained for billing, fraud prevention, or legal obligations.</Text>

      <Pressable accessibilityRole="button" onPress={() => signOut()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function LinkRow({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
      <Text style={[styles.linkText, danger && styles.dangerText]}>{label}</Text>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: 22, gap: 18 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16 },
  row: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { color: colors.muted },
  value: { color: colors.text, fontWeight: "600" },
  links: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  linkRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  linkText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  dangerText: { color: colors.danger },
  chevron: { color: colors.muted, fontSize: 24 },
  deletionNote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  button: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center" },
  pressed: { backgroundColor: colors.surfaceRaised },
  buttonText: { color: colors.text, fontWeight: "700" },
  error: { color: colors.danger },
});

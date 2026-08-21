import { useAuth } from "@clerk/expo";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { createMobileApi, MobileApiError } from "../../../src/api/client";
import type { MemberProfile } from "../../../src/api/types";
import { colors } from "../../../src/theme";

export default function AccountScreen() {
  const { getToken, signOut } = useAuth();
  const api = useMemo(() => createMobileApi({ getToken }), [getToken]);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; api.getMemberProfile().then((result) => { if (active) setProfile(result.profile); }).catch((caught) => { if (active) setError(caught instanceof MobileApiError ? caught.message : "Membership details are temporarily unavailable."); }); return () => { active = false; }; }, [api]);
  return (
    <View style={styles.container}>
      {!profile && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {profile ? <>
        <Text style={styles.eyebrow}>MEMBER ACCOUNT</Text>
        <Text style={styles.title}>{profile.identity?.label || "Bourbon Signal Member"}</Text>
        <View style={styles.card}>
          <Row label="Membership" value={profile.membership.label} />
          <Row label="Signal Feed" value={profile.entitlements.fullFeed ? "Full access" : "Preview access"} />
          <Row label="Send Signals" value={profile.entitlements.canSubmitSignals ? "Available" : "Unavailable"} />
        </View>
      </> : null}
      <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>Sign out</Text></Pressable>
    </View>
  );
}
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({
  container: { flex: 1, padding: 22, backgroundColor: colors.background, gap: 18 }, eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1 }, title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16 }, row: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, label: { color: colors.muted }, value: { color: colors.text, fontWeight: "600" },
  button: { marginTop: "auto", borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center" }, pressed: { backgroundColor: colors.surface }, buttonText: { color: colors.text, fontWeight: "700" }, error: { color: colors.danger },
});

import { useAuth, useSignUp } from "@clerk/expo";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMobileApi } from "../../src/hooks/useMobileApi";
import { useAccessibleStatus } from "../../src/hooks/useAccessibleStatus";
import { colors } from "../../src/theme";

type Stage = "account" | "verification" | "onboarding";
type StateOption = { code: string; name: string };

function clerkMessage(caught: unknown) {
  const clerkError = caught as { errors?: Array<{ longMessage?: string; message?: string }> };
  return clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || "We could not create your account. Try again.";
}

export default function SignUpScreen() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signUp, fetchStatus } = useSignUp();
  const api = useMobileApi();
  const router = useRouter();
  const params = useLocalSearchParams<{ resume?: string }>();
  const [stage, setStage] = useState<Stage>(() => params.resume === "onboarding" ? "onboarding" : "account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age21Affirmed, setAge21Affirmed] = useState(false);
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [homeState, setHomeState] = useState("");
  const [states, setStates] = useState<StateOption[]>([]);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useAccessibleStatus(error);

  async function loadStates() {
    if (statesLoading) return;
    setStatesLoading(true);
    setError("");
    try {
      const response = await api.searchMonitoringGeography({ levels: ["state"], limit: 60, fresh: true });
      setStates(response.states.map(({ code: stateCode, name }) => ({ code: stateCode, name })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "State options could not be loaded. Try again.");
    } finally {
      setStatesLoading(false);
    }
  }

  useEffect(() => {
    if (stage === "onboarding" && !states.length) void loadStates();
  }, [stage]); // State loading is explicitly retryable; do not refetch after a successful load.

  if (!authLoaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  if (isSignedIn && stage !== "onboarding") return <Redirect href="/(app)/(tabs)" />;

  async function createAccount() {
    if (busy || fetchStatus === "fetching") return;
    if (!email.trim() || !password) {
      setError("Enter an email address and password.");
      return;
    }
    if (!age21Affirmed) {
      setError("You must affirm that you are 21 or older.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const attempt = await signUp.password({ emailAddress: email.trim(), password });
      if (attempt.error) throw { errors: [attempt.error] };
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw { errors: [sent.error] };
      setCode("");
      setStage("verification");
    } catch (caught) {
      setError(clerkMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    if (busy || fetchStatus === "fetching" || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const verification = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (verification.error) throw { errors: [verification.error] };
      if (signUp.status !== "complete") {
        setError("Email verification is not complete. Check the code and try again.");
        return;
      }
      setStage("onboarding");
      const finalized = await signUp.finalize();
      if (finalized.error) throw { errors: [finalized.error] };
    } catch (caught) {
      setStage("verification");
      setError(clerkMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || fetchStatus === "fetching") return;
    setBusy(true);
    setError("");
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw { errors: [sent.error] };
    } catch (caught) {
      setError(clerkMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function completeOnboarding() {
    if (busy) return;
    if (!displayName.trim()) {
      setError("Enter a Community display name.");
      return;
    }
    if (!homeState) {
      setError("Choose your home state and starting area.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.completeMobileOnboarding({ displayName: displayName.trim(), age21Affirmed: true, homeState });
      router.replace("/(app)/(tabs)");
    } catch (caught) {
      setError(caught instanceof Error ? `${caught.message} Try again.` : "Your profile could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedState = states.find((state) => state.code === homeState);
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}>
        <Text style={styles.eyebrow}>{stage === "onboarding" ? "SET UP YOUR FREE ACCOUNT" : "CREATE ACCOUNT"}</Text>
        <Text accessibilityRole="header" style={styles.title}>{stage === "account" ? "Join Bourbon Signal" : stage === "verification" ? "Verify your email" : "Start with your market"}</Text>
        <Text style={styles.subtitle}>{stage === "account" ? "Create a Free account with no payment and no card required." : stage === "verification" ? `Enter the code sent to ${email.trim()}.` : "Choose the name members see and the state you hunt most."}</Text>
      </View>

      {stage === "account" ? <View style={styles.form}>
        <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" editable={!busy} keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} value={email} />
        <TextInput accessibilityLabel="Create password" autoCapitalize="none" autoComplete="new-password" editable={!busy} onChangeText={setPassword} onSubmitEditing={() => void createAccount()} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} value={password} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: age21Affirmed, disabled: busy }} disabled={busy} onPress={() => setAge21Affirmed((value) => !value)} style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}>
          <View style={[styles.checkbox, age21Affirmed && styles.checkboxChecked]}><Text accessible={false} style={styles.checkmark}>{age21Affirmed ? "✓" : ""}</Text></View>
          <Text style={styles.checkboxLabel}>I affirm that I am 21 or older.</Text>
        </Pressable>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton busy={busy} label="Create Free account" onPress={createAccount} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace("/(auth)/sign-in")} style={styles.linkButton}><Text style={styles.linkText}>Already a member? Sign in</Text></Pressable>
      </View> : null}

      {stage === "verification" ? <View style={styles.form}>
        <TextInput accessibilityLabel="Email verification code" autoCapitalize="none" autoComplete="one-time-code" editable={!busy} keyboardType="number-pad" onChangeText={setCode} onSubmitEditing={() => void verifyEmail()} placeholder="Verification code" placeholderTextColor={colors.muted} style={styles.input} value={code} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton busy={busy} label="Verify email" onPress={verifyEmail} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resendCode()} style={styles.linkButton}><Text style={styles.linkText}>Send a new code</Text></Pressable>
      </View> : null}

      {stage === "onboarding" ? <View style={styles.form}>
        <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Community display name</Text><Text style={styles.fieldHint}>Shown with your separate numbered member tag when you post.</Text>
          <TextInput accessibilityLabel="Community display name" autoCapitalize="words" editable={!busy} maxLength={32} onChangeText={setDisplayName} placeholder="How members will know you" placeholderTextColor={colors.muted} style={styles.input} value={displayName} />
        </View>
        <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>Home state and starting area</Text><Text style={styles.fieldHint}>Your Free account begins with this statewide feed view.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose home state and starting area" disabled={busy || statesLoading} onPress={() => setStatePickerOpen(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]}>
            <Text style={selectedState ? styles.selectText : styles.placeholder}>{statesLoading ? "Loading states…" : selectedState ? `${selectedState.name} (${selectedState.code})` : "Choose a state"}</Text><Text accessible={false} style={styles.chevron}>›</Text>
          </Pressable>
          {!states.length && !statesLoading ? <Pressable accessibilityRole="button" onPress={() => void loadStates()} style={styles.retry}><Text style={styles.linkText}>Try again loading states</Text></Pressable> : null}
        </View>
        <Text style={styles.notice}>Free accounts do not receive alerts. Your home state starts your feed; alert areas and delivery remain off unless you later choose an eligible membership.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton busy={busy} label="Continue Free" onPress={completeOnboarding} />
      </View> : null}
    </ScrollView>

    <Modal animationType="slide" onRequestClose={() => setStatePickerOpen(false)} presentationStyle="pageSheet" visible={statePickerOpen}>
      <View style={styles.modal}><View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.modalTitle}>Choose your state</Text><Pressable accessibilityRole="button" onPress={() => setStatePickerOpen(false)} style={styles.done}><Text style={styles.linkText}>Close</Text></Pressable></View>
        <ScrollView>{states.map((state) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: homeState === state.code }} key={state.code} onPress={() => { setHomeState(state.code); setStatePickerOpen(false); setError(""); }} style={({ pressed }) => [styles.stateRow, pressed && styles.pressed]}><Text style={styles.stateName}>{state.name}</Text><Text style={styles.stateCode}>{state.code}</Text></Pressable>)}</ScrollView>
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}

function PrimaryButton({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void | Promise<void> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void onPress()} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, busy && styles.disabled]}>{busy ? <ActivityIndicator accessibilityLabel={`${label} in progress`} color={colors.background} /> : <Text style={styles.buttonText}>{label}</Text>}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 48, gap: 30 }, brand: { gap: 9 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: "900" }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 }, form: { gap: 14 }, fieldGroup: { gap: 7 },
  fieldLabel: { color: colors.text, fontSize: 15, fontWeight: "800" }, fieldHint: { color: colors.muted, fontSize: 13, lineHeight: 19 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: 16 },
  checkboxRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }, checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent }, checkmark: { color: colors.background, fontSize: 16, fontWeight: "900" }, checkboxLabel: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 21 },
  button: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent }, buttonPressed: { backgroundColor: colors.accentPressed }, buttonText: { color: colors.background, fontSize: 16, fontWeight: "900" }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.72 },
  linkButton: { minHeight: 44, alignItems: "center", justifyContent: "center" }, linkText: { color: colors.accent, fontSize: 14, fontWeight: "800" }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 }, notice: { color: colors.muted, fontSize: 13, lineHeight: 19, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 13 },
  select: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, selectText: { color: colors.text, fontSize: 16 }, placeholder: { color: colors.muted, fontSize: 16 }, chevron: { color: colors.accent, fontSize: 24 }, retry: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  modal: { flex: 1, backgroundColor: colors.background, paddingTop: 22 }, modalHeader: { minHeight: 64, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: "900" }, done: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }, stateRow: { minHeight: 56, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, stateName: { color: colors.text, fontSize: 16 }, stateCode: { color: colors.muted, fontSize: 14, fontWeight: "800" },
});

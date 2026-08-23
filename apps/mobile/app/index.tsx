import { useAuth, useSignIn } from "@clerk/expo";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../src/theme";

type VerificationStrategy = "email_code" | "phone_code" | "totp" | "backup_code";

function clerkMessage(caught: unknown) {
  const clerkError = caught as { errors?: Array<{ longMessage?: string; message?: string }> };
  return clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || "We could not sign you in. Check your details and try again.";
}

export default function SignInScreen() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, fetchStatus } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationStrategy, setVerificationStrategy] = useState<VerificationStrategy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (authLoaded) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [authLoaded]);

  if (!authLoaded && authTimedOut) return <View style={styles.configuration}><Text style={styles.title}>Member access unavailable</Text><Text style={styles.subtitle}>The secure sign-in service could not start. Check your connection and reopen the app.</Text></View>;
  if (!authLoaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  if (isSignedIn) return <Redirect href="/(app)/(tabs)" />;

  async function finalizeIfComplete() {
    if (signIn.status !== "complete") return false;
    const finalized = await signIn.finalize();
    if (finalized.error) throw { errors: [finalized.error] };
    return true;
  }

  async function beginVerification() {
    const supported = new Set(signIn.supportedSecondFactors.map((factor) => factor.strategy));
    const strategy = (["email_code", "phone_code", "totp", "backup_code"] as VerificationStrategy[]).find((candidate) => supported.has(candidate));
    if (!strategy) {
      setError("This account requires a verification method that is not available in this development build.");
      return;
    }
    if (strategy === "email_code") {
      const result = await signIn.mfa.sendEmailCode();
      if (result.error) throw { errors: [result.error] };
    }
    if (strategy === "phone_code") {
      const result = await signIn.mfa.sendPhoneCode();
      if (result.error) throw { errors: [result.error] };
    }
    setVerificationStrategy(strategy);
    setVerificationCode("");
  }

  async function submit() {
    if (!email.trim() || !password || fetchStatus === "fetching") return;
    setSubmitting(true);
    setError("");
    try {
      const attempt = await signIn.password({ emailAddress: email.trim(), password });
      if (attempt.error) throw { errors: [attempt.error] };
      if (await finalizeIfComplete()) return;
      if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") await beginVerification();
      else setError("This account needs another sign-in step. Use the Bourbon Signal website, then try the app again.");
    } catch (caught) {
      setError(clerkMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify() {
    if (!verificationStrategy || !verificationCode.trim() || fetchStatus === "fetching") return;
    setSubmitting(true);
    setError("");
    try {
      const code = verificationCode.trim();
      const result = verificationStrategy === "email_code"
        ? await signIn.mfa.verifyEmailCode({ code })
        : verificationStrategy === "phone_code"
          ? await signIn.mfa.verifyPhoneCode({ code })
          : verificationStrategy === "totp"
            ? await signIn.mfa.verifyTOTP({ code })
            : await signIn.mfa.verifyBackupCode({ code });
      if (result.error) throw { errors: [result.error] };
      if (!(await finalizeIfComplete())) setError("Verification is not complete. Check the code and try again.");
    } catch (caught) {
      setError(clerkMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const verificationLabel = verificationStrategy === "totp"
    ? "Authenticator code"
    : verificationStrategy === "backup_code"
      ? "Backup code"
      : "Verification code";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={styles.brand}><Text style={styles.eyebrow}>MEMBER ACCESS</Text><Text style={styles.title}>Bourbon Signal</Text><Text style={styles.subtitle}>Fresh bourbon availability intelligence, powered by trusted sources and members.</Text></View>
      {verificationStrategy ? (
        <View style={styles.form}>
          <Text style={styles.subtitle}>{verificationStrategy === "email_code" || verificationStrategy === "phone_code" ? "Enter the code Clerk sent to your verified contact." : "Enter the code for this account."}</Text>
          <TextInput autoCapitalize="none" autoComplete="one-time-code" keyboardType={verificationStrategy === "backup_code" ? "default" : "number-pad"} placeholder={verificationLabel} placeholderTextColor={colors.muted} value={verificationCode} onChangeText={setVerificationCode} onSubmitEditing={verify} style={styles.input} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable disabled={submitting} onPress={verify} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? "Verifying…" : "Verify and continue"}</Text></Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={styles.input} />
          <TextInput autoCapitalize="none" autoComplete="current-password" placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} style={styles.input} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable disabled={submitting} onPress={submit} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? "Signing in…" : "Sign in"}</Text></Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", backgroundColor: colors.background, padding: 26, gap: 38 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  configuration: { flex: 1, justifyContent: "center", backgroundColor: colors.background, padding: 28, gap: 12 },
  brand: { gap: 10 }, eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 36, fontWeight: "800" }, subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: 14 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: 16 },
  error: { color: colors.danger, lineHeight: 20 }, button: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.accent },
  buttonPressed: { backgroundColor: colors.accentPressed }, disabled: { opacity: 0.6 }, buttonText: { color: "#1B1208", fontSize: 16, fontWeight: "800" },
});

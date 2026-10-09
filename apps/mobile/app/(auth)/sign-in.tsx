import { useAuth, useSignIn } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, typeScale, fonts } from "../../src/theme";
import { useAccessibleStatus } from "../../src/hooks/useAccessibleStatus";

type VerificationStrategy = "email_code" | "phone_code" | "totp" | "backup_code";

function clerkMessage(caught: unknown) {
  const clerkError = caught as { errors?: Array<{ longMessage?: string; message?: string }> };
  return clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || "We could not sign you in. Check your details and try again.";
}

export default function SignInScreen() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationStrategy, setVerificationStrategy] = useState<VerificationStrategy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetStep, setResetStep] = useState<"email" | "code" | "password" | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useAccessibleStatus(error || notice);

  useEffect(() => {
    if (authLoaded) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [authLoaded]);

  if (!authLoaded && authTimedOut) return <View style={styles.configuration}><Text style={styles.title}>Member access unavailable</Text><Text style={styles.subtitle}>The secure sign-in service could not start. Check your connection and reopen the app.</Text></View>;
  if (!authLoaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  if (isSignedIn) return <Redirect href="/" />;

  async function finalizeIfComplete() {
    if (signIn.status !== "complete") return false;
    const finalized = await signIn.finalize();
    if (finalized.error) throw { errors: [finalized.error] };
    return true;
  }

  async function beginVerification(selected?: VerificationStrategy) {
    const supported = new Set((signIn.supportedSecondFactors || []).map((factor) => factor.strategy));
    const strategy = selected && supported.has(selected) ? selected : (["email_code", "phone_code", "totp", "backup_code"] as VerificationStrategy[]).find((candidate) => supported.has(candidate));
    if (!strategy) {
      setError("This account requires another verification method. Contact support@bourbonsignal.com for help accessing the app.");
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

  async function recoveryAction(action: () => Promise<void>) {
    if (submitting || fetchStatus === "fetching") return;
    setSubmitting(true); setError(""); setNotice("");
    try { await action(); } catch (caught) { setError(clerkMessage(caught)); }
    finally { setSubmitting(false); }
  }

  async function startOver() {
    await recoveryAction(async () => {
      await signIn.reset(); setVerificationStrategy(null); setResetStep(null);
      setVerificationCode(""); setPassword("");
    });
  }

  async function resetPassword() {
    await recoveryAction(async () => {
      if (resetStep === "email") {
        if (!email.trim()) { setError("Enter your account email address."); return; }
        const created = await signIn.create({ identifier: email.trim() });
        if (created.error) throw { errors: [created.error] };
        const sent = await signIn.resetPasswordEmailCode.sendCode();
        if (sent.error) throw { errors: [sent.error] };
        setResetStep("code"); setVerificationCode("");
      } else if (resetStep === "code") {
        const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: verificationCode.trim() });
        if (verified.error) throw { errors: [verified.error] };
        if (signIn.status === "needs_new_password") { setResetStep("password"); setPassword(""); }
        else setError("Password recovery is not complete. Request a new code and try again.");
      } else if (resetStep === "password") {
        const updated = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
        if (updated.error) throw { errors: [updated.error] };
        setResetStep(null); setPassword("");
        if (await finalizeIfComplete()) return;
        if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") await beginVerification();
        else { await signIn.reset(); setNotice("Password updated. Sign in with your new password."); }
      }
    });
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <View style={styles.brand}><Text style={styles.eyebrow}>MEMBER ACCESS</Text><Text style={styles.title}>Bourbon Signal</Text><Text style={styles.subtitle}>Fresh bourbon availability intelligence, powered by trusted sources and members.</Text></View>
      {resetStep ? <View style={styles.form}>
        <Text style={styles.subtitle}>{resetStep === "email" ? "Reset your password using your account email." : resetStep === "code" ? "Enter the reset code sent to your email." : "Choose a new password. Other signed-in sessions will be signed out."}</Text>
        {resetStep === "email" ? <TextInput accessibilityLabel="Recovery email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} /> : resetStep === "code" ? <TextInput accessibilityLabel="Password reset code" autoComplete="one-time-code" keyboardType="number-pad" value={verificationCode} onChangeText={setVerificationCode} placeholder="Reset code" placeholderTextColor={colors.muted} style={styles.input} /> : <TextInput accessibilityLabel="New password" autoCapitalize="none" autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={colors.muted} style={styles.input} />}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.subtitle}>{notice}</Text> : null}
        <Pressable accessibilityRole="button" disabled={submitting} accessibilityState={{ disabled: submitting, busy: submitting }} onPress={() => void resetPassword()} style={[styles.button, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? "Working…" : resetStep === "email" ? "Send reset code" : resetStep === "code" ? "Verify reset code" : "Save new password"}</Text></Pressable>
        {resetStep === "code" ? <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void recoveryAction(async () => { const sent = await signIn.resetPasswordEmailCode.sendCode(); if (sent.error) throw { errors: [sent.error] }; setNotice("A new reset code was sent."); })} style={styles.linkButton}><Text style={styles.linkText}>Resend reset code</Text></Pressable> : null}
        <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void startOver()} style={styles.linkButton}><Text style={styles.linkText}>Back to sign in</Text></Pressable>
      </View> : verificationStrategy ? (
        <View style={styles.form}>
          <Text style={styles.subtitle}>{verificationStrategy === "email_code" ? "Enter the one-time code sent to your email address." : verificationStrategy === "phone_code" ? "Enter the one-time code sent to your phone." : verificationStrategy === "totp" ? "Enter the code from your authenticator app." : "Enter a backup code for your account."}</Text>
          <TextInput accessibilityLabel={verificationLabel} accessibilityHint={error || "Enter your account verification code, then verify and continue."} autoCapitalize="none" autoComplete="one-time-code" keyboardType={verificationStrategy === "backup_code" ? "default" : "number-pad"} placeholder={verificationLabel} placeholderTextColor={colors.muted} value={verificationCode} onChangeText={setVerificationCode} onSubmitEditing={verify} style={styles.input} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting, busy: submitting }} disabled={submitting} onPress={verify} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? "Verifying…" : "Verify and continue"}</Text></Pressable>
          {notice ? <Text style={styles.subtitle}>{notice}</Text> : null}
          {verificationStrategy === "email_code" || verificationStrategy === "phone_code" ? <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void recoveryAction(async () => { await beginVerification(verificationStrategy); setNotice("A new verification code was sent."); })} style={styles.linkButton}><Text style={styles.linkText}>Resend verification code</Text></Pressable> : null}
          {(signIn.supportedSecondFactors || []).filter(factor => factor.strategy !== verificationStrategy && ["email_code", "phone_code", "totp", "backup_code"].includes(factor.strategy)).map(factor => <Pressable key={factor.strategy} accessibilityRole="button" disabled={submitting} onPress={() => void recoveryAction(() => beginVerification(factor.strategy as VerificationStrategy))} style={styles.linkButton}><Text style={styles.linkText}>Use {factor.strategy === "totp" ? "authenticator" : factor.strategy === "backup_code" ? "backup code" : factor.strategy === "phone_code" ? "text message" : "email"}</Text></Pressable>)}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void startOver()} style={styles.linkButton}><Text style={styles.linkText}>Back to sign in</Text></Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput accessibilityLabel="Email address" accessibilityHint={error || "Enter the email address for your member account."} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={styles.input} />
          <TextInput accessibilityLabel="Password" accessibilityHint={error || "Enter your account password."} autoCapitalize="none" autoComplete="current-password" placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} style={styles.input} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.subtitle}>{notice}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting, busy: submitting }} disabled={submitting} onPress={submit} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? "Signing in…" : "Sign in"}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => router.push("/(auth)/sign-up")} style={({ pressed }) => [styles.linkButton, pressed && styles.disabled]}><Text style={styles.linkText}>Create a free account</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { setPassword(""); setError(""); setNotice(""); setResetStep("email"); }} style={styles.linkButton}><Text style={styles.linkText}>Forgot password?</Text></Pressable>
        </View>
      )}
    </ScrollView></KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", backgroundColor: colors.background, padding: 26, gap: 38 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  configuration: { flex: 1, justifyContent: "center", backgroundColor: colors.background, padding: 28, gap: 12 },
  brand: { gap: 10 }, eyebrow: { color: colors.accent, fontSize: typeScale.small, fontWeight: "700", letterSpacing: 1.4 },
  title: {fontFamily: fonts.heading,  color: colors.text, fontSize: typeScale.title, fontWeight: "700" }, subtitle: { color: colors.muted, fontSize: typeScale.input, lineHeight: 24 },
  form: { gap: 14 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: typeScale.input },
  error: { color: colors.danger, lineHeight: 20 }, button: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.accent },
  buttonPressed: { backgroundColor: colors.accentPressed }, disabled: { opacity: 0.6 }, buttonText: { color: "#1B1208", fontSize: typeScale.input, fontWeight: "800" },
  linkButton: { minHeight: 44, alignItems: "center", justifyContent: "center" }, linkText: { color: colors.accent, fontSize: typeScale.input, fontWeight: "800" },
});

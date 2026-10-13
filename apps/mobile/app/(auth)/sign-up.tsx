import { useAuth, useSignUp } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useAccessibleStatus } from '../../src/hooks/useAccessibleStatus';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

function clerkMessage(caught: unknown) {
  const error = caught as { errors?: Array<{ longMessage?: string; message?: string }> };
  return error.errors?.[0]?.longMessage || error.errors?.[0]?.message || 'We could not create your account. Try again.';
}
export default function SignUpScreen() {
  const { isLoaded, isSignedIn } = useAuth(); const { signUp, fetchStatus } = useSignUp(); const router = useRouter();
  const [stage, setStage] = useState<'account' | 'verification' | 'onboarding'>('account');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [age21Affirmed, setAge21Affirmed] = useState(false); const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useAccessibleStatus(error || notice);
  if (!isLoaded) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={colors.accent} /></View>;
  if (isSignedIn) return <Redirect href="/" />;
  async function run(action: () => Promise<void>) {
    if (busy || fetchStatus === 'fetching') return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (caught) { setError(clerkMessage(caught)); } finally { setBusy(false); }
  }
  async function createAccount() {
    if (!email.trim() || !password) { setError('Enter an email address and password.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    if (!age21Affirmed) { setError('You must affirm that you are 21 or older.'); return; }
    await run(async () => {
      const attempt = await signUp.password({ emailAddress: email.trim(), password }); if (attempt.error) throw { errors: [attempt.error] };
      const sent = await signUp.verifications.sendEmailCode(); if (sent.error) throw { errors: [sent.error] };
      setCode(''); setStage('verification');
    });
  }
  async function verifyEmail() {
    if (!code.trim()) { setError('Enter the code sent to your email.'); return; }
    await run(async () => {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() }); if (result.error) throw { errors: [result.error] };
      if (signUp.status !== 'complete') { setError('Email verification is not complete. Check the code and try again.'); return; }
      setStage('onboarding');
      const finalized = await signUp.finalize(); if (finalized.error) { setStage('verification'); throw { errors: [finalized.error] }; }
      router.replace('/');
    });
  }
  const verifying = stage !== 'account';
  return <OnboardingFrame title={verifying ? 'Check your inbox.' : 'Create your account.'}
    description={verifying ? `Enter the code sent to ${email}.` : 'Free to join. No card needed.'} transitionKey={stage}
    footer={<OnboardingButton secondary label={verifying ? 'Use a different email' : 'Already have an account? Log in'} disabled={busy} onPress={() => { if (verifying) { void run(async () => { await signUp.reset(); setStage('account'); setCode(''); }); } else router.replace('/(auth)/sign-in'); }} />}>
    {verifying ? <>
      <Text style={s.label}>Verification code</Text><TextInput accessibilityLabel="Email verification code" autoCapitalize="none" autoComplete="one-time-code" editable={!busy} keyboardType="number-pad" value={code} onChangeText={setCode} onSubmitEditing={() => void verifyEmail()} style={s.input} placeholder="Enter code" placeholderTextColor={colors.muted} />
      <OnboardingButton label="Verify email" busy={busy} onPress={() => void verifyEmail()} />
      <OnboardingButton secondary label="Send a new code" disabled={busy} onPress={() => void run(async () => { const sent = await signUp.verifications.sendEmailCode(); if (sent.error) throw { errors: [sent.error] }; setNotice('A new code was sent.'); })} />
    </> : <>
      <Text style={s.label}>Email address</Text><TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" autoCorrect={false} spellCheck={false} textContentType="emailAddress" keyboardType="email-address" editable={!busy} value={email} onChangeText={setEmail} style={s.input} placeholder="you@example.com" placeholderTextColor={colors.muted} />
      <Text style={s.label}>Password</Text><View style={[s.input, s.row, { paddingVertical: 0, paddingRight: 4 }]}><TextInput accessibilityLabel="Create password" autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="new-password" textContentType="newPassword" secureTextEntry={!showPassword} editable={!busy} value={password} onChangeText={setPassword} onSubmitEditing={() => void createAccount()} style={{ flex: 1, minHeight: 50, color: '#F1E9DC', fontSize: 16 }} placeholder="Create a password" placeholderTextColor={colors.muted} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => setShowPassword(value => !value)} style={{ minHeight: 44, padding: 10, justifyContent: 'center' }}><Text style={s.link}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable></View><Text style={s.small}>At least 8 characters.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: age21Affirmed, disabled: busy }} disabled={busy} onPress={() => setAge21Affirmed(value => !value)} style={[s.row, { minHeight: 48 }]}><View accessible={false} style={[s.selection, s.checkbox, age21Affirmed && s.selectionActive]}>{age21Affirmed ? <Text style={s.selectionCheck}>✓</Text> : null}</View><Text style={[s.copy, { flex: 1 }]}>I affirm that I am 21 or older.</Text></Pressable>
      <OnboardingButton label="Create account" busy={busy} onPress={() => void createAccount()} />
      <Text style={s.small}>By creating an account, you agree to our <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://www.bourbonsignal.com/terms').catch(() => setError('Terms could not open. Try again.'))} style={{ color: colors.accent }}>Terms</Text> and <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://www.bourbonsignal.com/privacy').catch(() => setError('Privacy Policy could not open. Try again.'))} style={{ color: colors.accent }}>Privacy Policy</Text>.</Text>
    </>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}{notice ? <Text accessibilityRole="alert" style={s.success}>{notice}</Text> : null}
  </OnboardingFrame>;
}

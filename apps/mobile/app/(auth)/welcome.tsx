import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
export default function WelcomeScreen() {
  const { isSignedIn } = useAuth(); const router = useRouter();
  if (isSignedIn) return <Redirect href="/" />;
  return <OnboardingFrame largeMark title={'Never miss\na drop.'} footer={<Text style={[s.small, { textAlign: 'center', fontSize: 11 }]}>For members 21 and older.</Text>}>
    <OnboardingButton label="Create account" onPress={() => router.push('/(auth)/sign-up')} />
    <Pressable accessibilityRole="button" accessibilityLabel="Already a member? Log in" onPress={() => router.push('/(auth)/sign-in')} style={({ pressed }) => [styles.login, pressed && s.pressed]}>
      <Text style={styles.loginText}>Already a member? <Text style={styles.loginLink}>Log in →</Text></Text>
    </Pressable>
  </OnboardingFrame>;
}
const styles = StyleSheet.create({
  login: { minHeight: 52, padding: 14, alignItems: 'center', justifyContent: 'center' },
  loginText: { color: '#EAE1D2', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  loginLink: { color: '#DEC393', fontWeight: '700', textDecorationLine: 'underline' },
});

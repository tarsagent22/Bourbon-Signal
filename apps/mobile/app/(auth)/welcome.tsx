import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';

export default function WelcomeScreen() {
  const { isSignedIn } = useAuth(); const router = useRouter();
  if (isSignedIn) return <Redirect href="/" />;
  return <OnboardingFrame largeMark title="Find your next bottle." description="Find bottles, share sightings, and keep track of the whiskies you enjoy."
    footer={<><OnboardingButton label="Create account" onPress={() => router.push('/(auth)/sign-up')} /><OnboardingButton secondary label="Already have an account? Log in" onPress={() => router.push('/(auth)/sign-in')} /><Text style={[s.small, { textAlign: 'center' }]}>For members 21 and older.</Text></>}>
    <View style={{ borderLeftWidth: 2, borderLeftColor: '#D69A4A', paddingLeft: 16, gap: 6 }}><Text style={s.label}>From your first pour to your next find.</Text><Text style={s.small}>A place for beginners, collectors, and bourbon hunters.</Text></View>
  </OnboardingFrame>;
}

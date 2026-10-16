import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
export default function WelcomeScreen() {
  const { isSignedIn } = useAuth(); const router = useRouter();
  if (isSignedIn) return <Redirect href="/" />;
  return <OnboardingFrame largeMark title={'Find your next\nbottle.'} footer={<><OnboardingButton label="Create account" onPress={() => router.push('/(auth)/sign-up')} /><OnboardingButton secondary label="Already have an account? Log in" onPress={() => router.push('/(auth)/sign-in')} /><Text style={[s.small, { textAlign: 'center', fontSize: 11 }]}>For members 21 and older.</Text></>}>
    <Text style={[s.copy, { textAlign: 'center' }]}>Get alerts when bottles you love show up in your area.</Text>
    <Text style={[s.small, { textAlign: 'center', paddingTop: 4 }]}>Let Bourbon Signal do the heavy lifting.</Text>
  </OnboardingFrame>;
}

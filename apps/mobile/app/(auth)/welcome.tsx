import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { ExampleSighting, OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
export default function WelcomeScreen() {
  const { isSignedIn } = useAuth(); const router = useRouter();
  if (isSignedIn) return <Redirect href="/" />;
  return <OnboardingFrame largeMark title={'Find your next\nbottle.'} footer={<><OnboardingButton label="Create account" onPress={() => router.push('/(auth)/sign-up')} /><OnboardingButton secondary label="Already have an account? Log in" onPress={() => router.push('/(auth)/sign-in')} /><Text style={[s.small, { textAlign: 'center', fontSize: 11 }]}>For members 21 and older.</Text></>}>
    <Text style={[s.copy, { textAlign: 'center' }]}>See what other bourbon drinkers are finding.</Text>
    <ExampleSighting compact />
    <View style={{ gap: 5, paddingHorizontal: 8 }}><Text style={s.label}>Keep track of what you enjoy.</Text><Text style={s.small}>Your bottles and ratings, together in My Shelf.</Text></View>
  </OnboardingFrame>;
}

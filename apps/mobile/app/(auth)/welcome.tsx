import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { CellarBottleArtwork } from '../../src/components/CellarBottleArtwork';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
export default function WelcomeScreen() {
  const { isSignedIn } = useAuth(); const router = useRouter();
  if (isSignedIn) return <Redirect href="/" />;
  return <OnboardingFrame largeMark title={'Find your next\nbottle.'} footer={<><OnboardingButton label="Create account" onPress={() => router.push('/(auth)/sign-up')} /><OnboardingButton secondary label="Already have an account? Log in" onPress={() => router.push('/(auth)/sign-in')} /><Text style={[s.small, { textAlign: 'center', fontSize: 11 }]}>For members 21 and older.</Text></>}>
    <Text style={[s.copy, { textAlign: 'center' }]}>{'Explore bottle sightings.\nKeep track of what you enjoy.'}</Text>
    <View style={{ backgroundColor: '#20271D', borderRadius: 20, paddingTop: 10, paddingBottom: 24, gap: 12, borderWidth: 1, borderColor: '#3B4430' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>{[{ id: 'makers-mark', name: "Maker's Mark" }, { id: 'wild-turkey-rare-breed', name: 'Wild Turkey Rare Breed' }, { id: 'woodford-double-oaked', name: 'Woodford Reserve Double Oaked' }].map(bottle => <CellarBottleArtwork key={bottle.id} bottle={{ bottleId: bottle.id, bottleName: bottle.name }} size="grid" />)}</View>
      <Text style={[s.small, { textAlign: 'center', color: '#C2C4AE' }]}>Discover · Share · Collect</Text>
    </View>
  </OnboardingFrame>;
}

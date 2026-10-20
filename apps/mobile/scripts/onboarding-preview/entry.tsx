import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { CommunityTermsGate } from '../../src/components/CommunityTermsGate';
import { PHOTO_PERMISSION_REMINDER } from '../../../../shared/legal-acceptance';
import Welcome from '../../app/(auth)/welcome';
import SignIn from '../../app/(auth)/sign-in';
import SignUp from '../../app/(auth)/sign-up';
import Onboarding from '../../app/(app)/onboarding';
function App() {
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [finished, setFinished] = useState(false);
  useEffect(() => { const done = () => setFinished(true); window.addEventListener('preview-finished', done); return () => window.removeEventListener('preview-finished', done); }, []);
  const screen = new URLSearchParams(location.search).get('screen');
  if (screen === 'community-terms') return <ScrollView style={{ backgroundColor: '#0B0A09' }} contentContainerStyle={{ padding: 16, maxWidth: 520, alignSelf: 'center', width: '100%' }}><Text style={{ color: '#F3ECE2', fontSize: 24 }}>Share a sighting</Text><Text style={{ color: '#B9AA98', lineHeight: 22, marginTop: 16 }}>{PHOTO_PERMISSION_REMINDER}</Text><CommunityTermsGate onAccepted={setLegalAccepted} /><Pressable accessibilityRole="button" accessibilityState={{ disabled: !legalAccepted }} disabled={!legalAccepted} style={{ padding: 20, backgroundColor: legalAccepted ? '#D4B072' : '#29231D', borderRadius: 12, marginTop: 16 }}><Text style={{ color: '#F3ECE2' }}>Post Signal</Text></Pressable></ScrollView>;
  return <View style={{ height: '100%', maxWidth: 520, width: '100%', alignSelf: 'center' }}><Text style={{ color: '#B9AA98', fontSize: 10, textAlign: 'center', padding: 5 }}>LOCAL PREVIEW · SYNTHETIC DATA</Text>{finished ? <Text style={{ color: '#F3ECE2', padding: 30 }}>Setup complete · Feed opened</Text> : screen === 'welcome' ? <Welcome /> : screen === 'sign-in' ? <SignIn /> : screen === 'sign-up' ? <SignUp /> : <Onboarding />}</View>;
}
createRoot(document.getElementById('root')!).render(<App />);

import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import Welcome from '../../app/(auth)/welcome';
import SignIn from '../../app/(auth)/sign-in';
import SignUp from '../../app/(auth)/sign-up';
import Onboarding from '../../app/(app)/onboarding';
function App() {
  const [finished, setFinished] = useState(false);
  useEffect(() => { const done = () => setFinished(true); window.addEventListener('preview-finished', done); return () => window.removeEventListener('preview-finished', done); }, []);
  const screen = new URLSearchParams(location.search).get('screen');
  return <View style={{ height: '100%', maxWidth: 520, width: '100%', alignSelf: 'center' }}><Text style={{ color: '#B9AA98', fontSize: 10, textAlign: 'center', padding: 5 }}>LOCAL PREVIEW · SYNTHETIC DATA</Text>{finished ? <Text style={{ color: '#F3ECE2', padding: 30 }}>Setup complete · Feed opened</Text> : screen === 'welcome' ? <Welcome /> : screen === 'sign-in' ? <SignIn /> : screen === 'sign-up' ? <SignUp /> : <Onboarding />}</View>;
}
createRoot(document.getElementById('root')!).render(<App />);

import React from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import { usePreviewRoute } from './fixture';
import Check from '../../app/(app)/bottle-check';
import ScanPost from '../../app/(app)/scan-post';
import ScanShelf from '../../app/(app)/scan-shelf';
import Post from '../../app/(app)/(tabs)/post';
import Shelf from '../../app/(app)/cellar/add';
import Home from '../../app/(app)/(tabs)/index';
import Radar from '../../app/(app)/(tabs)/radar';
import Membership from '../../app/(app)/account/membership';
import Setup from '../../app/(app)/setup';
import Coverage from '../../app/(app)/account/coverage';
import Support from '../../app/(app)/account/support';
import Feedback from '../../app/(app)/account/feedback';
import Onboarding from '../../app/(app)/onboarding';
import Rewards from '../../app/(app)/account/rewards';
import Account from '../../app/(app)/(tabs)/hq';
import Welcome from '../../app/(auth)/welcome';
import { SignalMotionBackdrop } from '../../src/components/SignalMotionBackdrop';
const screens: Record<string, React.ComponentType> = { '/(auth)/welcome': Welcome, '/(app)/bottle-check': Check, '/(app)/scan-post': ScanPost, '/(app)/scan-shelf': ScanShelf, '/(app)/(tabs)/post': Post, '/(app)/cellar/add': Shelf, '/(app)/(tabs)': Home, '/(app)/(tabs)/radar': Radar, '/(app)/account/membership': Membership, '/(app)/setup': Setup, '/(app)/account/coverage': Coverage, '/(app)/account/support': Support, '/(app)/account/feedback': Feedback, '/(app)/onboarding': Onboarding, '/(app)/account/rewards': Rewards, '/(app)/(tabs)/hq': Account };
function Preview() {
  const route = usePreviewRoute(); const Screen = screens[route.pathname];
  return <View style={{ height: '100%' }}><Text style={{ color: '#D5AD73', fontSize: 11, padding: 5 }}>LOCAL PREVIEW · SYNTHETIC DATA</Text>{route.pathname === '/motion' ? <View style={{ flex: 1, backgroundColor: '#10100E' }}><SignalMotionBackdrop /><Text style={{ color: '#F1E9DC', fontFamily: 'Fraunces_700Bold', fontSize: 36, padding: 30, marginTop: 200 }}>Find your next bottle.</Text></View> : Screen ? <Screen key={route.pathname} /> : <Text style={{ color: '#F1E9DC' }}>{route.pathname}</Text>}</View>;
}
createRoot(document.getElementById('root')!).render(<Preview />);

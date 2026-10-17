import { Linking, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useState } from 'react';
import { workspaceStyles as s, Action } from '../../../src/components/WorkspaceUI';
import { SUPPORT_EMAIL, SUPPORT_INTRO, SUPPORT_TOPICS } from '../../../../../shared/support-content';
import { coverageContext, routeText } from '../../../src/continuity/bottle-handoff';

export default function SupportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ screen?: string; context?: string; state?: string; area?: string }>();
  const [error, setError] = useState('');
  const context = typeof params.context === 'string' ? params.context.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 1000) : '';
  const screen = routeText(params.screen, 100);
  const email = () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Bourbon%20Signal%20support&body=${encodeURIComponent(`App ${Constants.nativeAppVersion || Constants.expoConfig?.version} (build ${Constants.nativeBuildVersion || 'unknown'})\n${screen ? `Screen: ${screen}\n` : ''}${context}\n\nDescribe what happened:\n`)}`).catch(() => setError(`Email couldn't open. Send your message to ${SUPPORT_EMAIL}.`));
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text style={s.title} accessibilityRole="header">How can we help?</Text><Text style={s.copy}>{SUPPORT_INTRO}</Text>
    {screen || context ? <View style={s.card}><Text style={s.heading}>{screen || 'Related details'}</Text>{context ? <Text selectable style={s.copy}>{context}</Text> : null}<Text style={s.copy}>These details are editable in your feedback draft.</Text></View> : null}
    <Action label="Report a problem" onPress={() => router.push({ pathname: '/(app)/account/feedback', params: { kind: 'problem', screen, context } })} />
    <Action label="Suggest an improvement" onPress={() => router.push({ pathname: '/(app)/account/feedback', params: { kind: 'suggestion', screen, context } })} />
    <Action label="Email support" onPress={email} /><Text selectable style={s.success}>{SUPPORT_EMAIL}</Text>
    {error ? <Text accessibilityRole="alert" style={s.copy}>{error}</Text> : null}
    {SUPPORT_TOPICS.map(([title, copy], index) => <View key={title} style={s.card}><Text style={s.heading} accessibilityRole="header">{title}</Text><Text style={s.copy}>{copy}</Text>{index === 1 ? <Action label="Manage membership →" onPress={() => router.push('/(app)/account/membership')} /> : index === 2 ? <Action label="View rewards →" onPress={() => router.push('/(app)/account/rewards')} /> : index === 3 ? <><Action label="Edit profile →" onPress={() => router.push('/(app)/account/profile')} /><Action label="Delete account →" onPress={() => router.push('/(app)/account/delete')} /><Action label="Privacy policy →" onPress={() => router.push('/(app)/account/privacy')} /></> : null}</View>)}
    <View style={s.card}><Text style={s.heading}>Want more coverage?</Text><Text style={s.copy}>Ask us to cover your area or a store you visit.</Text><Action label="Request coverage →" onPress={() => router.push({ pathname: '/(app)/account/coverage', params: coverageContext(params) })} /></View>
  </ScrollView>;
}

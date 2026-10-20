import { Linking, ScrollView, Text, View } from 'react-native';
import { workspaceStyles as s } from './WorkspaceUI';
import { APPLE_EULA_URL, LEGAL_UPDATED } from '../../../../shared/legal-content';

export function LegalDocument({title,intro,sections}:{title:string;intro:string;sections:readonly (readonly [string,readonly string[]])[]}) {
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={s.title}>{title}</Text>
    <Text style={s.success}>Updated {LEGAL_UPDATED}</Text>
    <Text selectable style={s.copy}>{intro}</Text>
    {sections.map(([heading,paragraphs]) => <View style={s.card} key={heading}>
      <Text accessibilityRole="header" style={s.heading}>{heading}</Text>
      {paragraphs.map(p => <Text selectable key={p} style={s.copy}>{p}</Text>)}
    </View>)}
    <Text accessibilityRole="link" style={s.copy} onPress={() => { void Linking.openURL('mailto:support@bourbonsignal.com').catch(() => {}); }}>Contact support@bourbonsignal.com</Text>
    <Text accessibilityRole="link" style={s.copy} onPress={() => { void Linking.openURL(APPLE_EULA_URL).catch(() => {}); }}>Apple standard app license</Text>
  </ScrollView>;
}

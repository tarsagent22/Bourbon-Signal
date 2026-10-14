import { Image, Text, View } from 'react-native';
import { onboardingCoveragePresentation, type OnboardingCoverageState } from '../../../../shared/mobile-onboarding';
import { OnboardingButton, s } from './OnboardingUI';
import { STATE_OUTLINES } from './state-outlines';
export function StateCoverageCard({ coverage, name, onRequest }: { coverage: OnboardingCoverageState; name: string; onRequest: () => void }) {
  const { level, label, description, canRequest } = onboardingCoveragePresentation(coverage);
  return <View style={[s.panel, { padding: 22, gap: 16, marginTop: 6 }]}>
    <View style={s.row}>
      {STATE_OUTLINES[coverage.code] ? <Image accessible={false} source={STATE_OUTLINES[coverage.code]} resizeMode="contain" style={{ width: 110, height: 76 }} /> : null}
      <View style={{ flex: 1, gap: 8 }}><Text style={s.label}>{name}</Text><Text style={[s.link, { fontSize: 16 }]}>{label}</Text></View>
    </View>
    <View accessibilityLabel={`Overall state coverage: ${label}`} style={{ gap: 7 }}>
      <View accessible={false} style={{ flexDirection: 'row', gap: 6 }}>{[1, 2, 3].map(index => <View key={index} style={{ height: 5, flex: 1, borderRadius: 3, backgroundColor: index <= level ? '#C4A371' : '#383D31' }} />)}</View>
      <Text style={s.small}>Overall state coverage</Text>
    </View>
    <Text style={s.copy}>{description}</Text>
    {canRequest ? <OnboardingButton secondary label="Request coverage →" onPress={onRequest} /> : null}
  </View>;
}

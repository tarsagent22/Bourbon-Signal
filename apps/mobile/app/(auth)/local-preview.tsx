import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useConversionTracking } from '../../src/activity/useConversionTracking';
import { discoveryRegion, type DiscoveryRegion } from '../../../../shared/local-discovery';
import { LocalReportCard, RegionFields, regionLabel, useLocalReport } from '../../src/onboarding/LocalPreview';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';

export default function LocalPreviewScreen() {
  const router = useRouter();
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [region, setRegion] = useState<DiscoveryRegion | null>(null);
  const { result, retry } = useLocalReport(region?.state || '', region?.city);
  const track = useConversionTracking();
  useEffect(() => {
    if (region && result?.report) track('local_report_seen', { entry: 'local_preview', coverage: result.report.alertsAvailable ? 'current' : 'limited' });
  }, [region, result, track]);
  const chosen = discoveryRegion(state, city);
  function signUp(intent: 'watch' | 'check' | 'browse') {
    router.push({ pathname: '/(auth)/sign-up', params: {
      state, city, intent, ...(intent === 'watch' && result?.report?.bottleId ? { bottleId: result.report.bottleId, bottle: result.report.bottle } : {}),
    } });
  }
  return <OnboardingFrame title={region ? `Reports in ${regionLabel(region)}` : 'See what’s near you.'}
    onBack={() => region ? setRegion(null) : router.back()}>
    {region ? <>
      {!result ? <Text accessibilityLiveRegion="polite" style={s.copy}>Checking recent reports…</Text> : null}
      {result?.failed ? <OnboardingButton secondary label="Retry reports" onPress={retry} /> : null}
      {result?.report ? <LocalReportCard report={result.report} /> : null}
      {result && !result.failed && !result.report ? <Text style={s.copy}>There’s no recent public report for this area. You can still look up a bottle and check its price.</Text> : null}
      {result?.report?.bottleId ? <OnboardingButton label="Save this bottle" onPress={() => signUp('watch')} /> : null}
      <OnboardingButton secondary={Boolean(result?.report?.bottleId)} label="Check a bottle" onPress={() => signUp('check')} />
      <OnboardingButton secondary label="Create a free account" onPress={() => signUp('browse')} />
    </> : <>
      <RegionFields state={state} city={city} onState={setState} onCity={setCity} />
      <OnboardingButton secondary label={affirmed ? '✓ I’m 21 or older' : 'I’m 21 or older'} onPress={() => setAffirmed(value => !value)} />
      <OnboardingButton label="See recent reports" disabled={!affirmed || !chosen} onPress={() => { if (chosen && affirmed) setRegion(chosen); }} />
    </>}
  </OnboardingFrame>;
}

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { discoveryRegion, type DiscoveryRegion } from '../../../../shared/local-discovery';
import type { MobileOnboardingStatusResponse } from '../../src/api/types';
import { useConversionTracking } from '../../src/activity/useConversionTracking';
import { useMobileApi } from '../../src/hooks/useMobileApi';
import { LocalReportCard, RegionFields, regionLabel, useLocalReport } from '../../src/onboarding/LocalPreview';
import { OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';

export default function FirstRunScreen() {
  const api = useMobileApi();
  const track = useConversionTracking();
  const router = useRouter();
  const [status, setStatus] = useState<MobileOnboardingStatusResponse | null>(null);
  const [affirmed, setAffirmed] = useState(false);
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState<DiscoveryRegion | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const { result, retry } = useLocalReport(affirmed ? region?.state || '' : '', region?.city);
  useEffect(() => {
    let active = true;
    void api.getMobileOnboardingStatus().then(next => {
      if (!active) return;
      if (next.completed) { router.replace('/(app)/(tabs)'); return; }
      const saved = next.discovery || discoveryRegion(next.draft?.homeState);
      if (saved) { setState(saved.state); setCity(saved.city); setRegion(saved); }
      setAffirmed(next.age21Affirmed === true);
      setStatus(next);
    }).catch(() => { if (active) setError('Your setup couldn’t load. Try again.'); });
    return () => { active = false; };
  }, [api, router, attempt]);

  useEffect(() => {
    if (region && result?.report) track('local_report_seen', { entry: 'first_run', coverage: result.report.alertsAvailable ? 'current' : 'limited' });
  }, [region, result, track]);

  const previous = status?.discovery;
  const carried = previous && previous.state === region?.state && previous.city === region?.city ? previous : null;
  const priorWatch = carried?.intent === 'watch' && carried.bottleId && carried.bottle ? carried : null;
  const watchId = priorWatch?.bottleId || result?.report?.bottleId;
  const watchName = priorWatch?.bottle || result?.report?.bottle;

  async function finish(intent: 'watch' | 'check' | 'browse') {
    if (!region || !affirmed || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const saved = await api.completeMobileOnboarding({ homeState: region.state, city: region.city, age21Affirmed: true, action: 'quick_start' });
      if (!saved.completed) throw new Error('Your area couldn’t be saved. Try again.');
      track('area_saved', { entry: 'first_run', coverage: result?.report?.alertsAvailable ? 'current' : result && !result.failed ? 'limited' : 'unknown' });
      if (intent === 'watch' && watchId) {
        router.replace({ pathname: '/(app)/(tabs)/radar', params: {
          section: 'settings', saveBottleId: watchId, watchBottle: watchName,
          state: region.state, city: region.city,
        } });
      } else if (intent === 'check') {
        router.replace({ pathname: '/(app)/bottle-check', params: { state: region.state, area: region.city } });
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your setup couldn’t be saved.');
    } finally { busy.current = false; setSaving(false); }
  }

  const chosen = discoveryRegion(state, city);
  return <OnboardingFrame title={status && !affirmed ? 'Confirm your age' : region ? `Your hunt in ${regionLabel(region)}` : 'Where do you shop?'}
    onBack={affirmed && region ? () => { setError(''); setRegion(null); } : undefined} backDisabled={saving}>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {!status ? error ? <OnboardingButton secondary label="Try again" onPress={() => { setError(''); setAttempt(n => n + 1); }} /> : <Text style={s.copy}>Opening setup…</Text> : null}
    {status && !affirmed ? <OnboardingButton label="I’m 21 or older" onPress={() => setAffirmed(true)} /> : null}
    {status && affirmed && !region ? <>
      <RegionFields state={state} city={city} onState={setState} onCity={setCity} />
      <OnboardingButton label="Continue" disabled={!chosen} onPress={() => { if (chosen) setRegion(chosen); }} />
    </> : null}
    {status && affirmed && region ? <>
      {result?.report ? <LocalReportCard report={result.report} /> : null}
      {result?.failed ? <OnboardingButton secondary label="Retry reports" onPress={retry} /> : null}
      {result && !result.failed && !result.report ? <Text style={s.copy}>There’s no recent public report for this area. Try Bottle Check or browse the community.</Text> : null}
      {watchId && carried?.intent !== 'check' ? <OnboardingButton label={priorWatch ? `Save ${watchName}` : 'Save this bottle'} busy={saving} onPress={() => void finish('watch')} /> : null}
      <OnboardingButton label="Check a bottle" secondary={Boolean(watchId) && carried?.intent !== 'check'} disabled={saving} onPress={() => void finish('check')} />
      <OnboardingButton label="Browse Bourbon Signal" secondary disabled={saving} onPress={() => void finish('browse')} />
    </> : null}
  </OnboardingFrame>;
}

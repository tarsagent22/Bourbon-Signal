import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { COVERAGE_STATES } from '../../../../shared/coverage-states';
import { discoveryRegion, discoveryStateName, type DiscoveryRegion, type LocalReport } from '../../../../shared/local-discovery';
import { useMobileApi } from '../hooks/useMobileApi';
import { colors } from '../theme';
import { Choice, OnboardingButton, s } from './OnboardingUI';

export function RegionFields({ state, city, onState, onCity }: {
  state: string; city: string; onState: (state: string) => void; onCity: (city: string) => void;
}) {
  const [editing, setEditing] = useState(!state);
  const [query, setQuery] = useState('');
  const candidates = COVERAGE_STATES.filter(row => `${row.code} ${row.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <Text style={s.label}>Shopping state</Text>
    {editing ? <>
      <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Search states" placeholder="Search states"
        placeholderTextColor={colors.muted} style={s.input} autoCorrect={false} />
      {candidates.slice(0, 8).map(row => <Choice key={row.code} title={row.name} selected={state === row.code}
        onPress={() => { onState(row.code); setEditing(false); setQuery(''); }} />)}
      {!candidates.length ? <Text style={s.small}>No states match.</Text> : null}
    </> : <OnboardingButton secondary label={discoveryStateName(state)} onPress={() => setEditing(true)} />}
    <Text style={s.label}>City, county, or ZIP (optional)</Text>
    <TextInput accessibilityLabel="City, county, or ZIP" value={city} onChangeText={onCity}
      placeholder="Enter a city, county, or ZIP" placeholderTextColor={colors.muted} style={s.input} maxLength={72} />
  </>;
}

export function LocalReportCard({ report }: { report: LocalReport }) {
  const kind = report.kind === 'inventory' ? 'Retailer inventory report' : report.kind === 'shipment' ? 'Board shipment lead' : 'Release report';
  return <View style={s.panel}>
    <Text style={s.small}>{kind}</Text>
    <Text style={s.label}>{report.bottle}</Text>
    <Text style={s.copy}>{report.location}{report.price === null ? '' : ` · $${report.price.toFixed(2)}`}</Text>
    <Text style={s.small}>{report.source} · {new Date(report.reportedAt).toLocaleString()}</Text>
    <Text style={s.small}>{report.kind === 'inventory' ? 'Confirm availability before you travel.' : report.kind === 'shipment' ? 'Receiving stores unconfirmed.' : 'Check the source before making a trip.'}</Text>
  </View>;
}

export function useLocalReport(state: string, city = '') {
  const api = useMobileApi();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; report: LocalReport | null; failed: boolean }>();
  const key = `${state}:${city}:${attempt}`;
  useEffect(() => {
    const region = discoveryRegion(state, city);
    if (!region) return;
    let current = true;
    void api.getLocalDiscovery(region).then(data => {
      if (current) setResult({ key, report: data.report, failed: false });
    }).catch(() => { if (current) setResult({ key, report: null, failed: true }); });
    return () => { current = false; };
  }, [api, state, city, key]);
  return { result: result?.key === key ? result : undefined, retry: () => setAttempt(n => n + 1) };
}

export function regionLabel(region: DiscoveryRegion) {
  return [region.city, discoveryStateName(region.state)].filter(Boolean).join(', ');
}

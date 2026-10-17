import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { useMobileApi } from '../../../src/hooks/useMobileApi';
import { useScreenRevalidation } from '../../../src/hooks/useScreenRevalidation';
import { ErrorState, LoadingState } from '../../../src/components/MemberScreen';
import { workspaceStyles as s, Action } from '../../../src/components/WorkspaceUI';
import { coverageStatusLabels, type CoverageRequestItem } from '../../../../../shared/coverage-requests';
import { COVERAGE_STATES } from '../../../../../shared/coverage-states';
import { coverageContext } from '../../../src/continuity/bottle-handoff';

export default function CoverageRequestsScreen() {
  const api = useMobileApi();
  const params = useLocalSearchParams<{ state?: string; area?: string; store?: string; address?: string; kind?: string }>();
  const initial = coverageContext(params);
  const [state, setState] = useState(initial.state);
  const [picker, setPicker] = useState(false);
  const [kind, setKind] = useState<'state' | 'city' | 'county' | 'store'>(initial.kind);
  const [area, setArea] = useState(initial.area);
  const [store, setStore] = useState(initial.store);
  const [address, setAddress] = useState(initial.address);
  const [requests, setRequests] = useState<CoverageRequestItem[]>([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const touched = useRef(Boolean(initial.state)); const sequence = useRef(0); const mutation = useRef(false);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [saved, member] = await Promise.allSettled([api.getCoverageRequests(), api.getMemberProfile()]);
      if (request !== sequence.current) return;
      if (saved.status === 'fulfilled') { setRequests(saved.value.requests); setError(''); }
      else setError('Your requests could not be loaded. Try again.');
      if (!touched.current && member.status === 'fulfilled' && member.value.profile.homeState) setState(member.value.profile.homeState);
    } catch { if (request === sequence.current) setError('Your requests could not be loaded. Try again.'); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [api]);
  useScreenRevalidation(load);
  useEffect(() => () => { sequence.current += 1; }, [api]);
  async function submit() {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await api.submitCoverageRequest({ targetType: kind, stateCode: state, manualCity: kind === 'county' ? '' : area, manualCounty: kind === 'county' ? area : '', manualStoreName: kind === 'store' ? store : '', manualAddress: kind === 'store' ? address : '', notificationEnabled: false });
      setMessage('Request received. Follow its progress below.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Request could not be saved.'); }
    finally { mutation.current = false; setBusy(false); }
  }
  const relevant = requests.filter(row => row.stateCode === state);
  const others = requests.filter(row => row.stateCode !== state);
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={s.title}>Request coverage</Text>
    <Text style={s.copy}>Tell us where you hunt. Requests help us decide which areas and stores to cover next.</Text>
    {initial.state ? <Text style={s.copy}>From your selected area: {[initial.store, initial.area, initial.state].filter(Boolean).join(', ')}. You can edit these details.</Text> : null}
    <View style={s.card}><Text style={s.label}>State</Text><Action label={COVERAGE_STATES.find(row => row.code === state)?.name || 'Choose a state'} disabled={busy} onPress={() => setPicker(true)} />
      <Text style={s.label}>What should we cover?</Text><View style={s.wrap}>{(['city', 'county', 'store', 'state'] as const).map(value => <Action key={value} label={value === 'state' ? 'Entire state' : value[0].toUpperCase() + value.slice(1)} disabled={busy} selected={kind === value} onPress={() => setKind(value)} />)}</View>
      {kind !== 'state' ? <><Text style={s.label}>{kind === 'county' ? 'County' : 'City'}</Text><TextInput accessibilityLabel={kind === 'county' ? 'County' : 'City'} editable={!busy} style={s.input} value={area} onChangeText={value => { touched.current = true; setArea(value); }} maxLength={120} /></> : null}
      {kind === 'store' ? <><Text style={s.label}>Store name</Text><TextInput accessibilityLabel="Store name" editable={!busy} style={s.input} value={store} onChangeText={setStore} maxLength={180} /><Text style={s.label}>Address (optional)</Text><TextInput accessibilityLabel="Store address" editable={!busy} style={s.input} value={address} onChangeText={setAddress} maxLength={220} /></> : null}
      <Action label={busy ? 'Submitting…' : 'Submit request'} disabled={busy || !state || (kind !== 'state' && !area.trim()) || (kind === 'store' && !store.trim())} onPress={() => void submit()} />
      <Text style={s.copy}>We’ll show updates here. A request doesn’t guarantee coverage or a launch date.</Text>
    </View>
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}{message ? <Text accessibilityRole="alert" style={s.success}>{message}</Text> : null}
    <Text accessibilityRole="header" style={s.heading}>My coverage requests</Text>
    {loading ? <LoadingState label="Loading requests…" /> : !requests.length ? <Text style={s.copy}>Your requests and their progress will appear here.</Text> : [...relevant, ...others].map(request => <View key={request.id} style={s.card}><Text style={s.heading}>{request.storeName || request.areaLabel}, {request.stateCode}</Text><Text style={s.success}>{coverageStatusLabels[request.status]}</Text>{request.memberUpdate ? <Text style={s.copy}>{request.memberUpdate}</Text> : null}<Text style={s.copy}>Updated {request.updatedAt.slice(0, 10)}</Text></View>)}
    <Modal visible={picker} onRequestClose={() => setPicker(false)} animationType="fade"><ScrollView style={s.screen} contentContainerStyle={s.content}><Text style={s.title}>Choose a state</Text><Action label="Close" onPress={() => setPicker(false)} />{COVERAGE_STATES.map(row => <Action key={row.code} label={row.name} onPress={() => { touched.current = true; if (row.code !== state) { setArea(''); setStore(''); setAddress(''); } setState(row.code); setPicker(false); }} />)}</ScrollView></Modal>
  </ScrollView>;
}

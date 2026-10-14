import { useState } from 'react';
import { Modal, Text, TextInput } from 'react-native';
import { useMobileApi } from '../hooks/useMobileApi';
import { Choice, OnboardingButton, OnboardingFrame, s } from './OnboardingUI';
import { colors } from '../theme';
import { useAccessibleStatus } from '../hooks/useAccessibleStatus';
export function CoverageRequestSheet({ state, visible, onClose }: { state: string; visible: boolean; onClose: () => void }) {
  const api = useMobileApi(); const [kind, setKind] = useState<'city' | 'county' | 'store'>('city');
  const [area, setArea] = useState(''); const [store, setStore] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [sent, setSent] = useState(false);
  useAccessibleStatus(error || (sent ? 'Coverage request received.' : ''));
  async function submit() {
    if (busy || !area.trim() || (kind === 'store' && !store.trim())) return;
    setBusy(true); setError('');
    try { await api.submitCoverageRequest({ targetType: kind, stateCode: state, manualCity: kind !== 'county' ? area.trim() : '', manualCounty: kind === 'county' ? area.trim() : '', manualStoreName: kind === 'store' ? store.trim() : '', notificationEnabled: false }); setSent(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Your request could not be saved. Try again.'); }
    finally { setBusy(false); }
  }
  return <Modal visible={visible} animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <OnboardingFrame title={sent ? 'Request received.' : 'Where should we focus?'} eyebrow={`COVERAGE REQUEST · ${state}`} description={sent ? 'You can follow its progress in Account → Coverage requests.' : 'Tell us which area or store would be useful to you.'}
      footer={<OnboardingButton secondary disabled={busy} label="Back to setup" onPress={onClose} />}>
      {!sent ? <>
        {(['city', 'county', 'store'] as const).map(value => <Choice key={value} title={value === 'city' ? 'City' : value === 'county' ? 'County' : 'Store'} selected={kind === value} onPress={() => setKind(value)} disabled={busy} />)}
        <Text style={s.label}>{kind === 'county' ? 'County' : 'City'}</Text><TextInput accessibilityLabel={kind === 'county' ? 'County to cover' : 'City to cover'} style={s.input} placeholderTextColor={colors.muted} placeholder={kind === 'county' ? 'County name' : 'City name'} maxLength={120} editable={!busy} value={area} onChangeText={setArea} />
        {kind === 'store' ? <><Text style={s.label}>Store name</Text><TextInput accessibilityLabel="Store to cover" style={s.input} placeholderTextColor={colors.muted} placeholder="Store name" maxLength={180} editable={!busy} value={store} onChangeText={setStore} /></> : null}
        <Text style={s.small}>Your request helps us choose where to add coverage.</Text>
        <OnboardingButton label="Submit coverage request" busy={busy} disabled={!area.trim() || (kind === 'store' && !store.trim())} onPress={() => void submit()} />
      </> : <Text accessibilityRole="alert" style={s.success}>We’ve saved your request.</Text>}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    </OnboardingFrame>
  </Modal>;
}

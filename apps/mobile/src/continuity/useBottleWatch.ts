import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import type { MemberPreferences } from '../api/types';
import { useMobileApi } from '../hooks/useMobileApi';
import { bottleWatchMutation } from '../radar/radar-preferences';
import { canonicalBottleKey } from '../interactions/member-interactions';

export function useBottleWatch(preferences: MemberPreferences | null, onSaved: (value: MemberPreferences) => void) {
  const api = useMobileApi(); const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const locked = useRef(false); const current = useRef(api.accountIdentity); current.current = api.accountIdentity;
  useEffect(() => { locked.current = false; setBusy(false); setError(''); }, [api]);
  async function watch(name: string) {
    if (!preferences || locked.current) return;
    const key = canonicalBottleKey(name);
    if (preferences.bottleAlertPreferences.bottleNames.some(value => canonicalBottleKey(value) === key)) return;
    if (preferences.entitlements?.trackedBottleLimit === 0) {
      router.push({ pathname: '/(app)/account/membership', params: { watchBottle: name } }); return;
    }
    if (preferences.mutedBottles?.bottles.some(value => canonicalBottleKey(value.bottleName) === key)) {
      setError('This bottle is muted. Review it in Radar before enabling alerts.');
      router.push({ pathname: '/(app)/(tabs)/radar', params: { section: 'settings', watchBottle: name } }); return;
    }
    locked.current = true; setBusy(true); setError(''); const identity = api.accountIdentity;
    try {
      const saved = await api.updateMemberPreferences({ watchlistMutation: bottleWatchMutation(name, true), alertMode: 'specific_bottles' });
      if (identity === current.current) onSaved(saved);
    } catch (caught) { if (identity === current.current) setError(caught instanceof Error ? caught.message : 'Radar could not save this bottle. Try again.'); }
    finally { if (identity === current.current) { locked.current = false; setBusy(false); } }
  }
  return { watch, busy, error };
}

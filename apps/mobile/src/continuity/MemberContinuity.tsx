import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemberPreferences } from '../api/types';
import { useMobileApi } from '../hooks/useMobileApi';
import { useScreenRevalidation } from '../hooks/useScreenRevalidation';
import { radarPushDeviceId } from '../push/push-registration';
import { colors } from '../theme';

export function MemberContinuity({ paid, onPreferences }: { paid: boolean; onPreferences: (value: MemberPreferences | null) => void }) {
  const api = useMobileApi(); const router = useRouter();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [phoneReady, setPhoneReady] = useState<boolean | null>(null);
  const sequence = useRef(0); const notify = useRef(onPreferences); notify.current = onPreferences;
  const load = useCallback(async () => {
    const request = ++sequence.current;
    const result = await api.getMemberPreferences({ fresh: true }).catch(() => null);
    if (request !== sequence.current) return;
    setPreferences(result); notify.current(result);
    setPhoneReady(null);
    if (paid) {
      const status = await radarPushDeviceId().then(id => api.getPushDeviceStatus(id, { fresh: true })).catch(() => null);
      if (request === sequence.current && status) setPhoneReady(Boolean(status.enabled && status.currentDeviceRegistered && !status.warning));
    }
  }, [api, paid]);
  useEffect(() => { setPreferences(null); notify.current(null); return () => { sequence.current += 1; }; }, [api]);
  useScreenRevalidation(load);
  const previousLoad = useRef(load);
  useEffect(() => { if (previousLoad.current !== load) { previousLoad.current = load; void load(); } }, [load]);
  if (!preferences) return null;
  const setup = paid ? !preferences.monitoringScopes.length ? { label: 'Choose your alert areas', detail: 'Finish setting up where you want bottle alerts.', section: 'settings' }
    : preferences.alertMode === 'specific_bottles' && !preferences.bottleAlertPreferences.bottleNames.length && !preferences.bottleAlertPreferences.bottleKeys.length ? { label: 'Choose bottles to watch', detail: 'Your alert areas are saved. Add the bottles you want to find.', section: 'settings' }
    : phoneReady === false ? { label: 'Set up phone alerts', detail: 'Your Radar preferences are saved. Connect alerts to this phone.', section: 'notifications' } : null : null;
  if (!setup) return null;
  return <View style={s.container}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/(tabs)/radar', params: { section: setup.section, request: Date.now().toString() } })} style={s.setup}><Text style={s.title}>{setup.label} →</Text><Text style={s.copy}>{setup.detail}</Text></Pressable></View>;
}
const s = StyleSheet.create({ container: { paddingVertical: 14 }, setup: { gap: 5, paddingVertical: 10 }, title: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 }, copy: { color: colors.muted, fontSize: 12, lineHeight: 18 } });

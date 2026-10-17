import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OnboardingDraft } from '../../../../shared/mobile-onboarding';
import type { MemberPreferences } from '../api/types';
import { useMobileApi } from '../hooks/useMobileApi';
import { useScreenRevalidation } from '../hooks/useScreenRevalidation';
import { useBottleCatalog } from '../hooks/useBottleCatalog';
import { radarPushDeviceId } from '../push/push-registration';
import { canonicalBottleKey } from '../interactions/member-interactions';
import { tasteDiscovery } from './taste-discovery';
import { useBottleWatch } from './useBottleWatch';
import { colors, fonts } from '../theme';

export function MemberContinuity({ paid, onPreferences }: { paid: boolean; onPreferences: (value: MemberPreferences | null) => void }) {
  const api = useMobileApi(); const router = useRouter(); const catalog = useBottleCatalog();
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [phoneReady, setPhoneReady] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const sequence = useRef(0); const notify = useRef(onPreferences); notify.current = onPreferences;
  const accept = (value: MemberPreferences) => { sequence.current += 1; setPreferences(value); notify.current(value); };
  const watch = useBottleWatch(preferences, accept);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    const results = await Promise.allSettled([api.getMemberPreferences({ fresh: true }), api.getMobileOnboardingStatus()]);
    if (request !== sequence.current) return;
    if (results[0].status === 'fulfilled') { setPreferences(results[0].value); notify.current(results[0].value); }
    else { setPreferences(null); notify.current(null); }
    setDraft(results[1].status === 'fulfilled' ? results[1].value.draft || null : null);
    setPhoneReady(null);
    if (paid) {
      const status = await radarPushDeviceId().then(id => api.getPushDeviceStatus(id, { fresh: true })).catch(() => null);
      if (request === sequence.current && status) setPhoneReady(Boolean(status.enabled && status.currentDeviceRegistered && !status.warning));
    }
  }, [api, paid]);
  useEffect(() => { setPreferences(null); setDraft(null); notify.current(null); return () => { sequence.current += 1; }; }, [api]);
  useScreenRevalidation(load);
  const previousLoad = useRef(load);
  useEffect(() => { if (previousLoad.current !== load) { previousLoad.current = load; void load(); } }, [load]);
  if (!preferences) return null;
  const picks = tasteDiscovery(catalog.catalog, preferences, draft);
  const shown = expanded ? picks : picks.slice(0, 1);
  const setup = paid ? !preferences.monitoringScopes.length ? { label: 'Choose your alert areas', detail: 'Finish setting up where you want bottle alerts.', section: 'settings' }
    : preferences.alertMode === 'specific_bottles' && !preferences.bottleAlertPreferences.bottleNames.length && !preferences.bottleAlertPreferences.bottleKeys.length ? { label: 'Choose bottles to watch', detail: 'Your alert areas are saved. Add the bottles you want to find.', section: 'settings' }
    : phoneReady === false ? { label: 'Set up phone alerts', detail: 'Your Radar preferences are saved. Connect alerts to this phone.', section: 'notifications' } : null : null;
  if (!picks.length && !setup) return null;
  return <View style={s.container}>
    {setup ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/(tabs)/radar', params: { section: setup.section, request: Date.now().toString() } })} style={s.setup}><Text style={s.title}>{setup.label} →</Text><Text style={s.copy}>{setup.detail}</Text></Pressable> : null}
    {picks.length ? <View style={s.picks}><Text accessibilityRole="header" style={s.heading}>{picks.some(pick => pick.source !== 'saved') ? 'Saved & suggested' : 'Saved from setup'}</Text>
      {shown.map(pick => {
        const watched = preferences.bottleAlertPreferences.bottleNames.some(name => canonicalBottleKey(name) === canonicalBottleKey(pick.bottle.name));
        return <View key={pick.bottle.id} style={s.row}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/bottle/[id]', params: { id: pick.bottle.id } })} style={s.bottle}><Text style={s.title}>{pick.bottle.name} →</Text><Text style={s.copy}>{pick.reason}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${watched ? 'Watching' : 'Watch'} ${pick.bottle.name}`} disabled={watch.busy || watched} onPress={() => void watch.watch(pick.bottle.name)} style={s.action}><Text style={s.link}>{watched ? 'Watching' : 'Watch'}</Text></Pressable></View>;
      })}{picks.length > 1 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={s.link}>{expanded ? 'Show less' : `Show ${picks.length - 1} more`}</Text></Pressable> : null}
      {shown.some(pick => pick.source === 'ratings') ? <Text style={s.copy}>Taste suggestions use saved ratings and published tasting cues.</Text> : null}
    </View> : null}
    {watch.error ? <Text accessibilityRole="alert" style={s.copy}>{watch.error}</Text> : null}
  </View>;
}
const s = StyleSheet.create({ container: { gap: 14, paddingVertical: 14 }, setup: { gap: 5, paddingVertical: 10 }, picks: { gap: 8 }, heading: { color: colors.text, fontFamily: fonts.heading, fontSize: 20 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, bottle: { flex: 1, minHeight: 48, paddingVertical: 8, gap: 4 }, title: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 }, copy: { color: colors.muted, fontSize: 12, lineHeight: 18 }, action: { minWidth: 60, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, link: { color: colors.accent, fontSize: 14, fontWeight: '600' } });

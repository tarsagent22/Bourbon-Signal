import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottleProfile } from '../../../../../shared/bottle-profile';
import type { MemberPreferences, Signal } from '../../../src/api/types';
import { useMobileApi } from '../../../src/hooks/useMobileApi';
import { useScreenRevalidation } from '../../../src/hooks/useScreenRevalidation';
import { BottleProfileHero } from '../../../src/components/BottleProfileHero';
import { BottlePriceCheck } from '../../../src/components/BottlePriceCheck';
import { ErrorState } from '../../../src/components/MemberScreen';
import { bottleProfileState, collectionBottleForIdentity } from '../../../src/signals/bottle-profile';
import { bottleWatchMutation } from '../../../src/radar/radar-preferences';
import { colors, fonts } from '../../../src/theme';

export default function BottleProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMobileApi(); const router = useRouter();
  const [bottle, setBottle] = useState<BottleProfile | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [reports, setReports] = useState<Signal[]>([]);
  const [error, setError] = useState(''); const [memberError, setMemberError] = useState('');
  const [reportError, setReportError] = useState(''); const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false); const sequence = useRef(0);
  const load = useCallback(async (fresh = false) => {
    const request = ++sequence.current; setRefreshing(true);
    await Promise.allSettled([
      api.getBottleProfile(id, { fresh }).then(result => { if (request === sequence.current) { setBottle(result.bottle); setError(''); } }).catch(caught => { if (request === sequence.current) setError(caught instanceof Error ? caught.message : 'Bottle details couldn’t load.'); }),
      api.getMemberPreferences({ fresh }).then(result => { if (request === sequence.current) { setPreferences(result); setMemberError(''); } }).catch(() => { if (request === sequence.current) setMemberError('Your shelf and Radar status couldn’t refresh. Pull to retry.'); }),
    ]);
    if (request === sequence.current) setRefreshing(false);
  }, [api, id]);
  useEffect(() => { setBottle(null); setPreferences(null); setReports([]); void load(); return () => { sequence.current += 1; }; }, [load]);
  useScreenRevalidation(load);
  useEffect(() => {
    if (!bottle) return;
    let active = true; setReports([]); setReportError('');
    void api.listSignals({ bottle: bottle.name, limit: 5 }).then(result => { if (active) setReports(result.signals.filter(signal => signal.bottle.id ? signal.bottle.id === bottle.id : signal.bottle.name.toLowerCase() === bottle.name.toLowerCase())); }).catch(() => { if (active) setReportError('Reports couldn’t load. Check Home for availability.'); });
    return () => { active = false; };
  }, [api, bottle]);
  const savedIdentity = preferences?.collectionPreferences.bottles.find(entry => entry.bottleId === id || entry.canonicalKey === id);
  const identity = bottle ? { id: bottle.id, name: bottle.name } : savedIdentity ? { id: savedIdentity.bottleId, name: savedIdentity.bottleName } : null;
  const personal = identity && preferences ? bottleProfileState(identity, preferences) : null;
  const shelfEntry = identity && preferences ? collectionBottleForIdentity(identity, preferences.collectionPreferences.bottles) : null;
  async function toggleWatch() {
    if (!identity || !preferences || !personal || saving) return;
    setSaving(true); setMemberError('');
    try { setPreferences(await api.updateMemberPreferences({ watchlistMutation: bottleWatchMutation(identity.name, !personal.isWatched), ...(!personal.isWatched ? { alertMode: 'specific_bottles' as const } : {}) })); }
    catch (caught) { setMemberError(caught instanceof Error ? caught.message : 'Radar couldn’t save.'); }
    finally { setSaving(false); }
  }
  return <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing && Boolean(identity)} onRefresh={() => void load(true)} tintColor={colors.accent} />}>
    <Stack.Screen options={{ title: 'Bottle Profile' }} />
    {!identity && !error ? <ActivityIndicator color={colors.accent} /> : null}
    {error && !identity ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
    {identity ? <>
      <BottleProfileHero identity={identity} details={bottle} personal={personal} />
      <View style={s.actions}>
        <Action label={personal?.inCellar ? 'Edit your shelf' : preferences?.collectionAccess.canAdd === false ? 'Free shelf is full' : 'Add to My Shelf'} disabled={!preferences || (!personal?.inCellar && !preferences.collectionAccess.canAdd)} primary onPress={() => personal?.inCellar ? router.push({ pathname: '/(app)/(tabs)/cellar', params: { editBottleId: shelfEntry?.bottleId || identity.id } }) : router.push({ pathname: '/(app)/cellar/add', params: { bottleId: identity.id } })} />
        {bottle ? <Action label={saving ? 'Saving…' : personal?.isWatched ? 'Remove from Radar' : 'Watch in Radar'} disabled={!preferences || saving} onPress={() => void toggleWatch()} /> : null}
        {bottle ? <Action label="Post a Sighting" onPress={() => router.push({ pathname: '/(app)/(tabs)/post', params: { scanBottleId: identity.id } })} /> : null}
      </View>
      {memberError ? <Text accessibilityRole="alert" style={s.copy}>{memberError}</Text> : null}
      <BottlePriceCheck key={identity.id} msrp={bottle?.msrp ?? null} />
      {bottle ? <View style={s.reports}><Text accessibilityRole="header" style={s.section}>Reported availability</Text><Text style={s.copy}>Source reports and member observations. Check with the store before driving.</Text>
        {reports.map(report => <Pressable key={report.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/signal/[id]', params: { id: report.id } })} style={s.report}><View style={{ flex: 1, gap: 4 }}><Text style={s.reportName}>{report.location.store?.name || report.location.label || report.source.label}</Text><Text style={s.note}>{[report.location.store?.city, report.location.state].filter(Boolean).join(', ')} · Reported {new Date(report.timing.displayAt).toLocaleDateString()}</Text></View><Text style={s.price}>{report.availability?.price != null ? `$${report.availability.price.toFixed(2)}` : 'View →'}</Text></Pressable>)}
        {!reports.length ? <Text style={s.copy}>{reportError || 'No reports to show here. This does not establish whether the bottle is available locally.'}</Text> : null}
      </View> : null}
      {!bottle ? <Text style={s.copy}>Catalog details aren’t available for this saved entry. Your shelf details remain editable.</Text> : null}
    </> : null}
  </ScrollView>;
}
function Action({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.action, primary && s.primary, disabled && { opacity: 0.45 }]}><Text style={[s.actionText, primary && { color: colors.background }]}>{label}</Text></Pressable>; }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, content: { padding: 22, gap: 24, paddingBottom: 48 }, actions: { gap: 10 }, action: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border }, primary: { backgroundColor: colors.accent, borderColor: colors.accent }, actionText: { color: colors.accent, fontSize: 14, fontWeight: '700' }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21 }, reports: { gap: 14, paddingTop: 20, borderTopWidth: 1, borderColor: colors.border }, section: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 }, report: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }, reportName: { color: colors.text, fontSize: 15 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, price: { color: colors.accent, fontSize: 16 } });

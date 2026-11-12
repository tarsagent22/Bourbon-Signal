import { nearestMappedBoardMember, nearestMappedReport } from '../../../src/nearby/map-feed';
import { rememberReport } from '../../../src/signals/report-preview';
import { reportDateTime } from '../../../src/signals/store-contact';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottleProfile } from '../../../../../shared/bottle-profile';
import type { MemberPreferences, Signal } from '../../../src/api/types';
import { useMobileApi } from '../../../src/hooks/useMobileApi';
import { useScreenRevalidation } from '../../../src/hooks/useScreenRevalidation';
import { BottleProfileHero, BottleProfileRating } from '../../../src/components/BottleProfileHero';
import { ProfileBackButton } from '../../../src/components/ProfileBackButton';
import { BottlePriceCheck } from '../../../src/components/BottlePriceCheck';
import { ErrorState } from '../../../src/components/MemberScreen';
import { bottleProfileState, collectionBottleForIdentity } from '../../../src/signals/bottle-profile';
import { bottleWatchMutation } from '../../../src/radar/radar-preferences';
import { colors, fonts } from '../../../src/theme';
import { supportContext } from '../../../src/continuity/bottle-handoff';

export default function BottleProfileScreen() {
  const { id, name, tier } = useLocalSearchParams<{ id: string; name?: string; tier?: string }>();
  const api = useMobileApi(); const router = useRouter();
  const [bottle, setBottle] = useState<BottleProfile | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [reports, setReports] = useState<Signal[]>([]);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [allReports, setAllReports] = useState(false);
  const [reportsBusy, setReportsBusy] = useState(false);
  const reportSequence = useRef(0);
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
  const loadReports = useCallback(async (cursor: string | null = null) => {
    const request = ++reportSequence.current;
    setReportsBusy(true); setReportError('');
    try {
      const page = await api.listSignals({ timeline: { mode: 'bottle', bottleId: id }, cursor, limit: 100 });
      if (request !== reportSequence.current) return;
      setReports(current => cursor ? [...current, ...page.signals] : page.signals);
      setReportCursor(page.nextCursor);
    } catch (caught) {
      if (request === reportSequence.current) {
        setReportCursor(null);
        setReportError(caught instanceof Error ? caught.message : 'Reports couldn’t load.');
      }
    } finally {
      if (request === reportSequence.current) setReportsBusy(false);
    }
  }, [api, id]);
  useEffect(() => {
    setReports([]); setAllReports(false); setReportCursor(null);
    void loadReports();
    return () => { reportSequence.current += 1; };
  }, [loadReports]);
  const savedIdentity = preferences?.collectionPreferences.bottles.find(entry => entry.bottleId === id || entry.canonicalKey === id);
  const identity = bottle ? { id: bottle.id, name: bottle.name } : savedIdentity ? { id: savedIdentity.bottleId, name: savedIdentity.bottleName } : name && id ? { id, name } : null;
  const personal = identity && preferences ? bottleProfileState(identity, preferences) : null;
  const shelfEntry = identity && preferences ? collectionBottleForIdentity(identity, preferences.collectionPreferences.bottles) : null;
  const reportRows = [...new Map(reports.map(report => [report.id, report])).values()]
    .map(report => ({ report, distance: report.shipment
      ? nearestMappedBoardMember(api, report.shipment.boardId) : nearestMappedReport(api, [report]) }))
    .sort((left, right) => (left.distance ?? Infinity) - (right.distance ?? Infinity) || Date.parse(right.report.timing.displayAt) - Date.parse(left.report.timing.displayAt));
  async function toggleWatch() {
    if (!identity || !preferences || !personal || saving) return;
    setSaving(true); setMemberError('');
    try { setPreferences(await api.updateMemberPreferences({ watchlistMutation: bottleWatchMutation(identity.name, !personal.isWatched), ...(!personal.isWatched ? { alertMode: 'specific_bottles' as const } : {}) })); }
    catch (caught) { setMemberError(caught instanceof Error ? caught.message : 'Radar couldn’t save.'); }
    finally { setSaving(false); }
  }
  return <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing && Boolean(identity)} onRefresh={() => { void load(true); void loadReports(); }} tintColor={colors.accent} />}>
    <Stack.Screen options={{ title: 'Bottle Profile', headerLeft: () => <ProfileBackButton /> }} />
    {!identity && !error ? <View style={s.reports}><Text style={s.note}>Loading bottle profile…</Text><ActivityIndicator color={colors.accent} /></View> : null}
    {error && !identity ? <ErrorState message={error} onRetry={() => void load(true)} /> : null}
    {identity ? <>
      <BottleProfileHero identity={identity} details={bottle} tier={tier} />
      <View style={s.actions}>
        {bottle ? <Action primary={!personal?.isWatched} label={saving ? 'Saving…' : personal?.isWatched ? 'Remove from Radar' : 'Watch in Radar'} disabled={!preferences || saving} onPress={() => void toggleWatch()} /> : null}
        <Action label={personal?.inCellar ? 'Edit your shelf' : preferences?.collectionAccess.canAdd === false ? 'Free shelf is full' : 'Add to My Shelf'} disabled={!preferences || (!personal?.inCellar && !preferences.collectionAccess.canAdd)} onPress={() => personal?.inCellar ? router.push({ pathname: '/(app)/(tabs)/cellar', params: { editBottleId: shelfEntry?.bottleId || identity.id } }) : router.push({ pathname: '/(app)/cellar/add', params: { bottleId: identity.id } })} />
        {bottle ? <Action label="Post a Sighting" onPress={() => router.push({ pathname: '/(app)/(tabs)/post', params: { scanBottleId: identity.id } })} /> : null}
      </View>
      {memberError ? <Text accessibilityRole="alert" style={s.copy}>{memberError}</Text> : null}
      <View style={s.reports}><Text accessibilityRole="header" style={s.section}>Bottle reports</Text>
        {(allReports ? reportRows : reportRows.slice(0, 10)).map(({ report, distance }) => {
          const type = report.source.type === 'member' ? 'Member sighting'
            : report.shipment ? 'ABC shipment' : report.kind === 'release' ? 'Release'
            : report.location.scope === 'online' ? 'Online report' : report.historical ? 'Historical report' : 'Store report';
          return <Pressable key={report.id} accessibilityRole="button" onPress={() => {
            rememberReport(api, report);
            router.push({ pathname: '/(app)/signal/[id]', params: { id: report.id } });
          }} style={s.report}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.reportName}>{report.location.store?.name || report.location.label || report.source.label}</Text>
              <Text style={s.note}>{[type, reportDateTime(report.shipment?.reportedAt || report.timing.displayAt), distance != null ? Math.round(distance) + ' mi' : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={s.price}>{report.availability?.price != null && !report.shipment ? '$' + report.availability.price.toFixed(2) : 'View →'}</Text>
          </Pressable>;
        })}
        {!reportRows.length || reportError ? <Text style={s.copy}>{reportError || (reportsBusy ? 'Finding bottle reports…' : 'No recent reports for this bottle.')}</Text> : null}
        {!allReports && (reportRows.length > 10 || reportCursor) ? <Action label="Show all reports" onPress={() => setAllReports(true)} /> : null}
        {allReports && reportCursor ? <Action disabled={reportsBusy} label={reportsBusy ? 'Loading reports…' : 'More reports'} onPress={() => void loadReports(reportCursor)} /> : null}
      </View>
      <BottlePriceCheck key={identity.id} msrp={bottle?.msrp ?? null} />
      <BottleProfileRating personal={personal} onRate={preferences && (personal?.inCellar || preferences.collectionAccess.canAdd) ? () => personal?.inCellar ? router.push({ pathname: '/(app)/(tabs)/cellar', params: { editBottleId: shelfEntry?.bottleId || identity.id } }) : router.push({ pathname: '/(app)/cellar/add', params: { bottleId: identity.id } }) : undefined} />
      {!bottle ? <Text style={s.copy}>Catalog details aren’t available for this saved entry. Your shelf details remain editable.</Text> : null}
      <Action footer label="Get help with this bottle" onPress={() => router.push({ pathname: '/(app)/account/support', params: supportContext({ screen: 'Bottle Profile', bottle: identity.name }) })} />
    </> : null}
  </ScrollView>;
}
function Action({ label, onPress, primary = false, disabled = false, footer = false }: { footer?: boolean; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.action, primary && s.primary, footer && s.footer, disabled && { opacity: 0.45 }]}><Text style={[s.actionText, primary && { color: colors.background }]}>{label}</Text></Pressable>; }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, content: { padding: 22, gap: 24, paddingBottom: 48 }, actions: { gap: 10 }, action: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border }, footer: { borderWidth: 0, alignItems: "flex-start" }, primary: { backgroundColor: colors.accent, borderColor: colors.accent }, actionText: { color: colors.accent, fontSize: 14, fontWeight: '700' }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21 }, reports: { gap: 14, paddingTop: 20, borderTopWidth: 1, borderColor: colors.border }, section: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 }, report: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }, reportName: { color: colors.text, fontSize: 15 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, price: { color: colors.accent, fontSize: 16 } });

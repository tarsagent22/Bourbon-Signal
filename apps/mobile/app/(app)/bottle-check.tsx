import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottleProfile } from '../../../../shared/bottle-profile';
import { COVERAGE_STATES } from '../../../../shared/coverage-states';
import { useBottleCatalog } from '../../src/hooks/useBottleCatalog';
import { useMobileApi } from '../../src/hooks/useMobileApi';
import { NativeBottleScanner } from '../../src/scanner/NativeBottleScanner';
import { buyingScore, type BuyingScope } from '../../src/scanner/buying-score';
import type { MemberPreferences, MemberProfile, RadarBottleOption, Signal } from '../../src/api/types';
import { CellarBottleArtwork } from '../../src/components/CellarBottleArtwork';
import { colors, fonts } from '../../src/theme';

const HELP_KEY = 'bottle-check-guidance-v2';
export default function BottleCheckScreen() {
  const router = useRouter(); const api = useMobileApi(); const catalog = useBottleCatalog();
  const [mode, setMode] = useState<'scan' | 'search'>('scan');
  const [query, setQuery] = useState(''); const [matches, setMatches] = useState<RadarBottleOption[]>([]);
  const [focused, setFocused] = useState(false); const [help, setHelp] = useState(false);
  const helpTouched = useRef(false);
  const [profile, setProfile] = useState<MemberProfile['profile'] | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [profileError, setProfileError] = useState('');
  const [scope, setScope] = useState<BuyingScope>({ state: '', area: '' }); const locationTouched = useRef(false);
  const [editingRegion, setEditingRegion] = useState(false); const [statePicker, setStatePicker] = useState(false);
  const [cityOptions, setCityOptions] = useState<Array<{value: string; label: string}>>([]);
  const [draftState, setDraftState] = useState(''); const [draftArea, setDraftArea] = useState('');
  const [selected, setSelected] = useState<RadarBottleOption | null>(null);
  const [details, setDetails] = useState<BottleProfile | null>(null); const [reports, setReports] = useState<Signal[]>([]);
  const [askingPrice, setAskingPrice] = useState(''); const [loading, setLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(''); const [reportError, setReportError] = useState(''); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(HELP_KEY).then(value => { if (active && !helpTouched.current) setHelp(value !== 'dismissed'); }).catch(() => { if (active && !helpTouched.current) setHelp(true); });
    void api.getMemberProfile().then(result => { if (!active) return; setProfile(result.profile); setProfileError(''); if (!locationTouched.current) setScope({ state: result.profile.homeState || '', area: '' }); }).catch(() => { if (active) setProfileError('Home state couldn’t load. Choose your reference state below.'); });
    void api.getMemberPreferences().then(result => { if (active) setPreferences(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);
  useEffect(() => {
    let active = true; setDetails(null); setDetailsError('');
    if (!selected) return;
    void api.getBottleProfile(selected.id).then(result => { if (active) setDetails(result.bottle); }).catch(() => { if (active) setDetailsError('Using saved bottle details. MSRP could not refresh.'); });
    return () => { active = false; };
  }, [api, selected?.id, retry]);
  useEffect(() => {
    let active = true; setReports([]); setReportError(''); setLoading(false);
    if (!selected || !scope.state) return;
    setLoading(true);
    void api.listSignals({ bottle: selected.name, state: scope.state, area: scope.area, limit: 100, fresh: true }).then(result => {
      if (!active) return;
      if (result.degraded || result.access?.marketDetailsLocked || result.access?.previewLocked) setReportError('Local price evidence is limited for this lookup.');
      else setReports(result.signals);
    }).catch(() => { if (active) setReportError('Local prices couldn’t load. This estimate uses available bottle details.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, selected?.id, scope.state, scope.area, retry]);
  useEffect(() => {
    let active = true; setCityOptions([]);
    if (editingRegion && draftState) void api.getSignalAreaOptions(draftState).then(options => { if (active) setCityOptions(options); }).catch(() => undefined);
    return () => { active = false; };
  }, [api, editingRegion, draftState]);
  const bottle: BottleProfile | null = (details?.id === selected?.id ? details : null) || (selected ? { id: selected.id, name: selected.name, producer: selected.producer || null, category: '', proof: selected.proof || null, age: selected.ageStatement || null, msrp: null, rarity: { label: selected.rarity || 'Under review', tier: selected.nationalTier || '', pending: selected.rarityPending !== false && !selected.nationalTier, reviewedAt: null } } : null);
  const decision = bottle ? buyingScore({ bottle, askingPrice, reports, scope, collection: preferences?.collectionPreferences.bottles }) : null;
  const results = useMemo(() => selected ? [] : mode === 'search' ? query.trim().length >= 2 ? catalog.search(query, 12) : [] : matches, [selected, mode, query, catalog.search, matches]);
  const regionName = COVERAGE_STATES.find(state => state.code === scope.state)?.name;
  const areaOptions = cityOptions;
  const dismissHelp = () => { helpTouched.current = true; setHelp(false); void SecureStore.setItemAsync(HELP_KEY, 'dismissed').catch(() => undefined); };
  const selectBottle = (item: RadarBottleOption) => { Keyboard.dismiss(); setSelected(item); setAskingPrice(''); setMatches([]); };
  return <View style={s.page}>
    <Stack.Screen options={{ title: 'Bottle Check', presentation: 'modal', headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Close Bottle Check" onPress={() => router.back()} style={s.iconButton}><MaterialCommunityIcons name="close" size={23} color={colors.text} /></Pressable>, headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Bottle Check help" onPress={() => { helpTouched.current = true; setHelp(value => !value); }} style={s.iconButton}><MaterialCommunityIcons name="help-circle-outline" size={22} color={colors.muted} /></Pressable> }} />
    <FlatList keyboardShouldPersistTaps="handled" data={results} keyExtractor={item => item.id} contentContainerStyle={s.content}
      ListHeaderComponent={<View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change Bottle Check reference region" accessibilityState={{ expanded: editingRegion }} onPress={() => { setDraftState(scope.state); setDraftArea(scope.area); setStatePicker(false); setEditingRegion(value => !value); }} style={s.region}><MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.accent} /><Text style={s.regionText}>{scope.area ? `${scope.area}, ${scope.state}` : regionName || 'Choose a reference state'}</Text>{scope.state && scope.state === profile?.homeState && !scope.area ? <Text style={s.note}>Home state</Text> : null}<MaterialCommunityIcons name="chevron-down" size={18} color={colors.muted} /></Pressable>
        {editingRegion ? <View style={s.regionEditor}>
          <Pressable accessibilityRole="button" accessibilityLabel="Select reference state" accessibilityState={{ expanded: statePicker }} onPress={() => setStatePicker(value => !value)} style={s.field}><Text style={s.copy}>{COVERAGE_STATES.find(state => state.code === draftState)?.name || 'Select state'}</Text><MaterialCommunityIcons name="chevron-down" size={18} color={colors.muted} /></Pressable>
          {statePicker ? <ScrollView nestedScrollEnabled style={s.stateList}>{COVERAGE_STATES.map(state => <Pressable key={state.code} accessibilityRole="button" accessibilityLabel={`Use ${state.name}`} onPress={() => { setDraftState(state.code); setDraftArea(''); setStatePicker(false); }} style={s.stateOption}><Text style={s.copy}>{state.name}</Text>{draftState === state.code ? <MaterialCommunityIcons name="check" color={colors.accent} size={18} /> : null}</Pressable>)}</ScrollView> : null}
          <TextInput accessibilityLabel="Reference city or area" value={draftArea} onChangeText={setDraftArea} placeholder="City (optional)" placeholderTextColor={colors.muted} maxLength={120} style={s.input} />
          {draftArea ? <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>{areaOptions.filter(area => area.label.toLowerCase().includes(draftArea.toLowerCase())).slice(0, 6).map(area => <Pressable key={area.value} accessibilityRole="button" onPress={() => setDraftArea(area.value)} style={s.areaChip}><Text style={s.note}>{area.label}</Text></Pressable>)}</ScrollView> : null}
          <Pressable accessibilityRole="button" disabled={!draftState} accessibilityState={{ disabled: !draftState }} onPress={() => { locationTouched.current = true; setScope({ state: draftState, area: draftArea.trim() }); setEditingRegion(false); Keyboard.dismiss(); }} style={[s.primary, !draftState && { opacity: 0.4 }]}><Text style={s.primaryText}>Use this region</Text></Pressable>
          {profile?.homeState ? <Pressable accessibilityRole="button" onPress={() => { locationTouched.current = true; setScope({ state: profile.homeState!, area: '' }); setEditingRegion(false); }} style={s.textButton}><Text style={s.link}>Reset to home state</Text></Pressable> : null}
        </View> : null}
        {profileError && !scope.state ? <Text style={s.note}>{profileError}</Text> : null}
        {help ? <View style={s.help}><View style={s.helpCopy}><Text style={s.helpTitle}>{selected ? 'Read the score' : 'Point. Confirm. Compare.'}</Text><Text style={s.note}>{selected ? 'Add the shelf price. The score weighs price, proof or your rating, and recent prices in your selected region. It’s a guide, not a tasting score.' : 'Center one front label, then choose the exact bottle. Search works too. Add the shelf price for a buying score. Photos aren’t saved or posted.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Dismiss Bottle Check tips" onPress={dismissHelp} style={s.iconButton}><MaterialCommunityIcons name="close" size={20} color={colors.muted} /></Pressable></View> : null}
        {selected && bottle && decision ? <>
          <Pressable accessibilityRole="button" onPress={() => { setSelected(null); setDetails(null); setReports([]); setAskingPrice(''); }} style={s.textButton}><Text style={s.link}>← Check another bottle</Text></Pressable>
          <View style={s.bottleHeading}><View style={s.bottleArt}><CellarBottleArtwork bottle={{ bottleId: bottle.id, bottleName: bottle.name }} size="showcase" /></View><View style={s.bottleCopy}><Text style={s.eyebrow}>BUYING GUIDE</Text><Text accessibilityRole="header" style={s.bottleName}>{bottle.name}</Text><Text style={s.note}>{[bottle.proof ? `${bottle.proof} proof` : '', bottle.age?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean).join(' · ')}</Text></View></View>
          <View style={s.priceEntry}><Text style={s.inputLabel}>Shelf price</Text><View style={s.priceInput}><Text style={s.currency}>$</Text><TextInput accessibilityLabel="Bottle Check shelf price in US dollars" keyboardType="decimal-pad" value={askingPrice} onChangeText={setAskingPrice} placeholder="Enter price" placeholderTextColor={colors.muted} maxLength={12} style={s.priceText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} /></View></View>
          <View style={s.scoreCard} accessibilityLiveRegion="polite"><View style={s.scoreLine}><View style={s.scoreCircle}><Text style={s.score}>{decision.score}</Text><Text style={s.scoreOutOf}>/ 100</Text></View><View style={s.verdictCopy}><Text style={s.eyebrow}>{decision.preliminary ? 'PRELIMINARY SCORE' : 'BUY SCORE'}</Text><Text accessibilityRole="header" style={s.verdict}>{decision.verdict}</Text><Text style={s.note}>{decision.confidence}</Text></View></View>
            <View style={s.factorRow}>{decision.factors.map(factor => <View key={factor.label} style={s.factor}><Text style={s.factorLabel}>{factor.label}</Text><View style={s.factorTrack}><View style={[s.factorFill, { width: `${factor.points / factor.max * 100}%` }]} /></View><Text style={s.note}>{factor.points}/{factor.max}</Text></View>)}</View>
            {decision.adjustment ? <Text style={s.note}>{decision.adjustment}</Text> : null}
          </View>
          <Text accessibilityRole="header" style={s.section}>Why this score</Text>
          {decision.reasons.map((reason, index) => <View key={index} style={s.reason}><MaterialCommunityIcons name={index === 0 ? 'tag-outline' : index === 1 ? 'glass-tulip' : 'map-marker-outline'} color={colors.accent} size={19} /><Text style={[s.copy, { flex: 1 }]}>{reason}</Text></View>)}
          {bottle.rarity && !bottle.rarity.pending ? <Text style={s.note}>National classification: {bottle.rarity.label}. Rarity does not raise the buying score.</Text> : null}
          {loading ? <View style={s.reason}><ActivityIndicator size="small" color={colors.accent} /><Text style={s.note}>Checking prices in your region…</Text></View> : null}
          {detailsError || reportError ? <View><Text style={s.note}>{[detailsError, reportError].filter(Boolean).join(' ')}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={s.textButton}><Text style={s.link}>Retry lookup</Text></Pressable></View> : null}
          <Text style={s.note}>Rule-based guidance · Price 60%, beginner fit or your rating 30%, local price 10%. Reported prices are a sample, not live stock or a resale forecast.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/bottle/[id]', params: { id: bottle.id } })} style={s.secondary}><Text style={s.link}>Bottle details & shelf actions →</Text></Pressable>
        </> : <>
          <View accessibilityRole="radiogroup" accessibilityLabel="Bottle lookup method" style={s.modes}>{(['scan', 'search'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} onPress={() => { setMode(value); setMatches([]); }} style={[s.mode, mode === value && s.selected]}><MaterialCommunityIcons name={value === 'scan' ? 'line-scan' : 'magnify'} size={18} color={mode === value ? colors.accent : colors.muted} /><Text style={mode === value ? s.link : s.copy}>{value === 'scan' ? 'Scan a bottle' : 'Search by name'}</Text></Pressable>)}</View>
          {mode === 'scan' ? <NativeBottleScanner active={focused && !selected && !editingRegion} catalog={catalog.catalog} onMatches={setMatches} /> : <TextInput accessibilityLabel="Search bottles" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Bottle, producer, or expression" placeholderTextColor={colors.muted} style={s.input} />}
          {catalog.error ? <View><Text style={s.note}>{catalog.error}</Text><Pressable accessibilityRole="button" onPress={catalog.retry} style={s.textButton}><Text style={s.link}>Refresh catalog</Text></Pressable></View> : null}
          {results.length ? <Text accessibilityRole="header" style={s.section}>{mode === 'scan' ? 'Confirm your bottle' : 'Choose your bottle'}</Text> : null}
        </>}
      </View>}
      ListEmptyComponent={!selected ? <Text style={s.note}>{mode === 'scan' ? 'Hold one front label inside the frame.' : query.trim().length >= 2 ? 'No matching bottles. Try the brand or expression.' : 'Search for the exact release to check its buying score.'}</Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Check ${item.name}`} onPress={() => selectBottle(item)} style={({ pressed }) => [s.result, pressed && { opacity: 0.7 }]}><CellarBottleArtwork bottle={{ bottleId: item.id, bottleName: item.name }} size="list" /><View style={s.resultCopy}><Text style={s.resultName}>{item.name}</Text><Text style={s.note}>{[item.proof ? `${item.proof} proof` : '', item.ageStatement?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean).join(' · ') || 'Check this release'}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} /></Pressable>}
    />
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 48 }, header: { gap: 16, marginBottom: 12 }, copy: { color: colors.text, fontSize: 14, lineHeight: 21 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, link: { color: colors.accent, fontSize: 14, fontWeight: '600' }, eyebrow: { color: colors.accent, letterSpacing: 1.5, fontSize: 10, fontWeight: '700' }, iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  region: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, regionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }, regionEditor: { gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14 }, field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }, stateList: { maxHeight: 240 }, stateOption: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }, areaChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, input: { backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 15, borderRadius: 10, padding: 14, minHeight: 48 }, primary: { backgroundColor: colors.accent, borderRadius: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, primaryText: { color: colors.background, fontSize: 14, fontWeight: '700' }, textButton: { minHeight: 44, justifyContent: 'center' }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  help: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: 12 }, helpCopy: { flex: 1, gap: 6 }, helpTitle: { color: colors.text, fontSize: 15, fontWeight: '700' }, modes: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.accent }, section: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, resultCopy: { flex: 1, gap: 5 }, resultName: { color: colors.text, fontSize: 16, lineHeight: 22 }, bottleHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 }, bottleArt: { width: 88, height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 44 }, bottleCopy: { flex: 1, gap: 8 }, bottleName: { color: colors.text, fontFamily: fonts.heading, fontSize: 24, lineHeight: 30 },
  priceEntry: { gap: 8 }, inputLabel: { color: colors.muted, fontSize: 13 }, priceInput: { minHeight: 56, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }, currency: { color: colors.accent, fontSize: 24 }, priceText: { flex: 1, color: colors.text, fontSize: 22, paddingVertical: 10 }, scoreCard: { padding: 18, gap: 20, backgroundColor: '#211A12', borderRadius: 20, borderWidth: 1, borderColor: '#584027' }, scoreLine: { flexDirection: 'row', alignItems: 'center', gap: 16 }, scoreCircle: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, score: { color: colors.text, fontFamily: fonts.heading, fontSize: 38, lineHeight: 44 }, scoreOutOf: { color: colors.muted, fontSize: 12 }, verdictCopy: { flex: 1, gap: 7 }, verdict: { color: colors.text, fontFamily: fonts.heading, fontSize: 23, lineHeight: 28 }, factorRow: { flexDirection: 'row', gap: 12 }, factor: { flex: 1, gap: 6 }, factorLabel: { color: colors.text, fontSize: 11 }, factorTrack: { height: 4, backgroundColor: '#42382E', borderRadius: 2, overflow: 'hidden' }, factorFill: { height: 4, backgroundColor: colors.accent }, reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});

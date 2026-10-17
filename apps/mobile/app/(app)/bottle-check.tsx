import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, BackHandler, FlatList, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { bottleHandoffParams, handoffPrice, regionContext } from '../../src/continuity/bottle-handoff';
import { homeBrowsingStorageKey, loadHomeBrowsingPreferences } from '../../src/signals/home-browsing-preferences';
import { personalTasteNote } from '../../src/continuity/taste-discovery';
import { useBottleWatch } from '../../src/continuity/useBottleWatch';
import { bottleProfileState } from '../../src/signals/bottle-profile';

const HELP_KEY = 'bottle-check-guidance-v2';
export default function BottleCheckRoute() {
  const params = useLocalSearchParams<{ returnTo?: string; state?: string; area?: string; price?: string }>();
  if (params.returnTo === 'post' || params.returnTo === 'shelf') return <FormScannerRedirect purpose={params.returnTo} state={params.state} area={params.area} price={params.price} />;
  return <BottleCheckScreen />;
}
function FormScannerRedirect({ purpose, state, area, price }: { purpose: 'post' | 'shelf'; state?: string; area?: string; price?: string }) {
  const router = useRouter(); const redirected = useRef(false);
  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace({ pathname: purpose === 'post' ? '/(app)/scan-post' : '/(app)/scan-shelf', params: { ...regionContext(state, area), price: handoffPrice(price) } });
  }, [router, purpose, state, area, price]);
  return <View style={s.page}><ActivityIndicator accessibilityLabel={`Opening ${purpose} scanner`} color={colors.accent} /></View>;
}
function BottleCheckScreen() {
  const router = useRouter(); const api = useMobileApi(); const catalog = useBottleCatalog();
  const [showSources, setShowSources] = useState(false);
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ state?: string; area?: string }>();
  const initialRegion = regionContext(params.state, params.area);
  const [mode, setMode] = useState<'scan' | 'search'>('scan');
  const [query, setQuery] = useState(''); const [matches, setMatches] = useState<RadarBottleOption[]>([]);
  const [scanSession, setScanSession] = useState(0);
  const [focused, setFocused] = useState(false); const [help, setHelp] = useState(false);
  const helpTouched = useRef(false);
  const [profile, setProfile] = useState<MemberProfile['profile'] | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [profileError, setProfileError] = useState('');
  const [scope, setScope] = useState<BuyingScope>(initialRegion); const locationTouched = useRef(Boolean(initialRegion.state));
  const [editingRegion, setEditingRegion] = useState(false); const [statePicker, setStatePicker] = useState(false);
  const [cityOptions, setCityOptions] = useState<Array<{value: string; label: string}>>([]);
  const [draftState, setDraftState] = useState(''); const [draftArea, setDraftArea] = useState('');
  const [selected, setSelected] = useState<RadarBottleOption | null>(null);
  const list = useRef<FlatList<RadarBottleOption>>(null);
  const [details, setDetails] = useState<BottleProfile | null>(null); const [reports, setReports] = useState<Signal[]>([]);
  const [askingPrice, setAskingPrice] = useState(''); const [loading, setLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(''); const [reportError, setReportError] = useState(''); const [retry, setRetry] = useState(0);
  const watch = useBottleWatch(preferences, setPreferences);
  useFocusEffect(useCallback(() => {
    let active = true; setFocused(true);
    void api.getMemberPreferences({ fresh: true }).then(value => { if (active) setPreferences(value); }).catch(() => { if (active) setPreferences(null); });
    return () => { active = false; setFocused(false); };
  }, [api]));
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(HELP_KEY).then(value => { if (active && !helpTouched.current) setHelp(value !== 'dismissed'); }).catch(() => { if (active && !helpTouched.current) setHelp(true); });
    void Promise.all([api.getMemberProfile(), loadHomeBrowsingPreferences(homeBrowsingStorageKey(userId))]).then(([result, browsing]) => {
      if (!active) return; setProfile(result.profile); setProfileError('');
      if (!locationTouched.current) { const filters = browsing?.filtersByView[browsing.view]; setScope(regionContext(filters?.state || result.profile.homeState, filters?.area)); }
    }).catch(() => { if (active) setProfileError('Home state couldn’t load. Choose your reference state below.'); });
    return () => { active = false; };
  }, [api, userId]);
  useEffect(() => {
    let active = true; setDetails(null); setDetailsError('');
    if (!selected) return;
    void api.getBottleProfile(selected.id, { state: scope.state }).then(result => { if (active) setDetails(result.bottle); }).catch(() => { if (active) setDetailsError('Using saved bottle details. MSRP could not refresh.'); });
    return () => { active = false; };
  }, [api, selected?.id, scope.state, retry]);
  useEffect(() => {
    let active = true; setReports([]); setReportError(''); setLoading(false);
    if (!selected || !scope.state) return;
    setLoading(true);
    void api.listSignals({ bottle: selected.name, state: scope.state, limit: 100, fresh: true }).then(result => {
      if (!active) return;
      if (result.degraded || result.access?.marketDetailsLocked || result.access?.previewLocked) setReportError('Local price evidence is limited for this lookup.');
      else setReports(result.signals);
    }).catch(() => { if (active) setReportError('Local prices couldn’t load. This estimate uses available bottle details.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, selected?.id, scope.state, retry]);
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
  const handoff = (item: { id: string; name: string }, destination: 'post' | 'shelf', price = askingPrice) => {
    if (!userId) return;
    router.dismissTo({ pathname: destination === 'post' ? '/(app)/(tabs)/post' : '/(app)/cellar/add', params: bottleHandoffParams({ owner: userId, id: Crypto.randomUUID(), bottleId: item.id, bottleName: item.name, price, ...scope, store: '' }) });
  };
  const selectBottle = (item: RadarBottleOption) => {
    Keyboard.dismiss();
    setSelected(item); setMatches([]); setShowSources(false);
    requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
  };
  const resetCheck = useCallback((newLookup: boolean) => {
    Keyboard.dismiss(); setSelected(null); setDetails(null); setReports([]); setMatches([]);
    setDetailsError(''); setReportError(''); setShowSources(false); setLoading(false);
    setScanSession(value => value + 1); setEditingRegion(false);
    if (newLookup) { setQuery(''); setAskingPrice(''); }
    requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
  }, []);
  useEffect(() => {
    if (!focused || !selected) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { resetCheck(false); return true; });
    return () => subscription.remove();
  }, [focused, Boolean(selected), resetCheck]);
  const tasteNote = bottle ? personalTasteNote(bottle, preferences).replace('You rated this ', 'Your rating ').replace('You’d buy again', 'Buy again') : '';
  const personal = bottle && preferences ? bottleProfileState({ id: bottle.id, name: bottle.name }, preferences) : null;
  return <View style={s.page}>
    <SafeAreaView edges={['top']} style={s.topSafe}><View style={s.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel={selected ? mode === 'search' ? 'Back to bottle search' : 'Back to scanner' : 'Close Bottle Check'} onPress={() => selected ? resetCheck(false) : router.back()} style={s.iconButton}><MaterialCommunityIcons name={selected ? 'chevron-left' : 'close'} size={24} color={colors.text} /></Pressable>
      <Text accessibilityRole="header" style={s.topTitle}>Bottle Check</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={selected ? 'Close Bottle Check' : 'Bottle Check help'} onPress={() => { if (selected) router.back(); else { helpTouched.current = true; setHelp(value => !value); } }} style={s.iconButton}><MaterialCommunityIcons name={selected ? 'close' : 'help-circle-outline'} size={23} color={colors.accent} /></Pressable>
    </View></SafeAreaView>
    <FlatList ref={list} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" data={results} keyExtractor={item => item.id} contentContainerStyle={s.content}
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
        {editingRegion ? <Text style={s.note}>Reference for this check. Radar alert areas stay as saved.</Text> : null}
        {help && !selected ? <View style={s.help}><View style={s.helpCopy}><Text style={s.helpTitle}>Point. Confirm. Compare.</Text><Text style={s.note}>Center the label, then choose your bottle. You can also search by name.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Dismiss Bottle Check tips" onPress={dismissHelp} style={s.iconButton}><MaterialCommunityIcons name="close" size={20} color={colors.muted} /></Pressable></View> : null}
        {selected && bottle && decision ? <>
          <View style={s.bottleHeading}><View style={s.bottleArt}><CellarBottleArtwork bottle={{ bottleId: bottle.id, bottleName: bottle.name }} size="showcase" /></View><View style={s.bottleCopy}><Text accessibilityRole="header" style={s.bottleName}>{bottle.name}</Text><Text style={s.note}>{[bottle.proof ? `${bottle.proof} proof` : '', bottle.age?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean).join(' · ')}</Text>{decision.releaseLabel ? <Text style={s.releaseTag}>{decision.releaseLabel}</Text> : null}</View></View>
          {tasteNote ? <Text style={s.link}>{tasteNote}</Text> : null}
          <View style={s.scoreCard} accessibilityLiveRegion="polite">
            <View style={s.scoreLine}><View style={s.verdictCopy}><Text style={s.scoreTitle}>Signal Score</Text><Text accessibilityRole="header" style={s.verdict}>{decision.findVerdict}</Text><Text style={s.note}>{decision.evidenceScope}</Text></View><View style={s.scoreValue}><Text testID="bottle-assessment-score" style={[s.score, decision.scoreRange && { fontSize: 30 }]}>{decision.score ?? (decision.scoreRange ? `${decision.scoreRange.low}–${decision.scoreRange.high}` : '—')}</Text><Text style={s.scoreOutOf}>/ 100</Text></View></View>
            {decision.score == null ? <Text style={s.note}>{decision.scoreRange ? 'Range until reviews are verified' : 'Release research pending'}</Text> : null}
          </View>
          <View style={s.priceEntry}><View style={s.priceLabelRow}><Text style={s.inputLabel}>Shelf price</Text>{decision.reference != null ? <Text style={s.note}>${decision.reference.toFixed(2)} reference</Text> : null}</View><View style={s.priceInput}><Text style={s.currency}>$</Text><TextInput accessibilityLabel="Bottle Check shelf price in US dollars" keyboardType="decimal-pad" value={askingPrice} onChangeText={setAskingPrice} placeholder="Enter price to compare" placeholderTextColor={colors.muted} maxLength={12} style={s.priceText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} /></View>
            {decision.priceVerdict ? <View accessibilityLiveRegion="polite"><Text style={s.priceVerdict}>{decision.priceVerdict}</Text><Text style={s.note}>{decision.priceNote}{!askingPrice && decision.price != null ? ` · Recent ${scope.area && !decision.stateFallback ? scope.area : scope.state} median` : ''}</Text></View> : null}
          </View>
          {decision.reviewStats.expert != null || decision.reviewStats.consumer != null ? <View style={s.reviews}>
            <Text accessibilityRole="header" style={s.reviewHeading}>Published reviews</Text>
            <View style={s.reviewRow}>{decision.reviewStats.expert != null ? <View style={s.reviewItem}><Text style={s.note}>Expert</Text><Text style={s.reviewValue}>{decision.reviewStats.expert.toFixed(0)}<Text style={s.note}> / 100</Text></Text></View> : null}{decision.reviewStats.consumer != null ? <View style={s.reviewItem}><Text style={s.note}>Consumers</Text><Text style={s.reviewValue}>{decision.reviewStats.consumer.toFixed(2)}<Text style={s.note}> / 5</Text></Text><Text style={s.note}>{decision.reviewStats.count.toLocaleString()} ratings</Text></View> : null}</View>
          </View> : null}
          {loading ? <View style={s.reason}><ActivityIndicator size="small" color={colors.accent} /><Text style={s.note}>Checking prices in your region…</Text></View> : null}
          {detailsError || reportError ? <View><Text style={s.note}>{[detailsError, reportError].filter(Boolean).join(' ')}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={s.textButton}><Text style={s.link}>Retry lookup</Text></Pressable></View> : null}
          <View style={s.actionRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={personal?.isWatched ? 'Watching bottle' : 'Watch bottle'} disabled={!preferences || watch.busy || personal?.isWatched} onPress={() => void watch.watch(bottle.name)} style={s.smallAction}><MaterialCommunityIcons name="radar" size={19} color={colors.accent} /><Text style={s.smallActionText}>{personal?.isWatched ? 'Watching' : watch.busy ? 'Saving…' : 'Watch'}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Post sighting" onPress={() => handoff(bottle, 'post')} style={s.smallAction}><MaterialCommunityIcons name="map-marker-plus-outline" size={19} color={colors.accent} /><Text style={s.smallActionText}>Post sighting</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="View bottle details" onPress={() => router.push({ pathname: '/(app)/bottle/[id]', params: { id: bottle.id } })} style={s.smallAction}><MaterialCommunityIcons name="bottle-wine-outline" size={19} color={colors.accent} /><Text style={s.smallActionText}>Details</Text></Pressable>
          </View>
          {watch.error ? <Text accessibilityRole="alert" style={s.note}>{watch.error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSources }} onPress={() => setShowSources(value => !value)} style={s.textButton}><Text style={s.link}>Why this score? {showSources ? '\u2212' : '+'}</Text></Pressable>
          {showSources ? <View style={s.methodology}>
            {decision.reasons.map((reason, index) => <Text key={index} style={s.note}>{reason}</Text>)}
            <Text style={s.note}>{decision.reviewPublishers ? `${decision.reviewPublishers} · ${decision.reviewConfidence.toLowerCase()}.` : 'Published reviews not yet verified.'}</Text>
            <Text style={s.note}>{decision.adjustment}</Text><Text style={s.note}>Catalog prices are references, not observed shelf prices. A local median needs three distinct stores within seven days. City samples fall back to state evidence when available. Standard-release context does not guarantee local stock.</Text>
            {decision.notes.map((note, index) => <Text key={index} style={s.note}>{note}</Text>)}
            {decision.producerFacts ? <Text style={s.note}>Producer facts: {[decision.producerFacts.proof ? `${decision.producerFacts.proof} proof` : '', decision.producerFacts.ageYears ? `${decision.producerFacts.ageYears} years` : '', decision.producerFacts.process || ''].filter(Boolean).join(' · ')}</Text> : null}
            <Text style={s.note}>Expert scores retain their published scale. Consumer stars are converted only inside the weighted model. Each publisher counts once per group; consumer samples need 100 ratings. Source checks expire after a year. Reviews on one platform do not establish independent publisher consensus.</Text>
            {decision.sources.map((source, index) => <Pressable key={`${source.url}-${index}`} accessibilityRole="link" accessibilityLabel={`Open ${source.label}`} onPress={() => { void Linking.openURL(source.url).catch(() => undefined); }} style={s.textButton}><Text style={s.link}>{source.label}</Text><Text style={s.note}>Checked {source.checkedAt}</Text></Pressable>)}
          </View> : null}
        </> : <>
          <View accessibilityRole="radiogroup" accessibilityLabel="Bottle lookup method" style={s.modes}>{(['scan', 'search'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} onPress={() => { setMode(value); setMatches([]); setScanSession(session => session + 1); }} style={[s.mode, mode === value && s.selected]}><MaterialCommunityIcons name={value === 'scan' ? 'line-scan' : 'magnify'} size={18} color={mode === value ? colors.accent : colors.muted} /><Text style={mode === value ? s.link : s.copy}>{value === 'scan' ? 'Scan a bottle' : 'Search by name'}</Text></Pressable>)}</View>
          {mode === 'scan' ? <NativeBottleScanner key={scanSession} active={focused && !selected && !editingRegion} catalog={catalog.catalog} onMatches={setMatches} /> : <TextInput accessibilityLabel="Search bottles" value={query} onChangeText={setQuery} autoFocus autoCapitalize="none" autoCorrect={false} placeholder="Bottle, producer, or expression" placeholderTextColor={colors.muted} style={s.input} />}
          {catalog.error ? <View><Text style={s.note}>{catalog.error}</Text><Pressable accessibilityRole="button" onPress={catalog.retry} style={s.textButton}><Text style={s.link}>Refresh catalog</Text></Pressable></View> : null}
          {mode === 'scan' && matches.length ? <Pressable accessibilityRole="button" onPress={() => { setMatches([]); setScanSession(value => value + 1); }} style={s.secondary}><Text style={s.link}>Scan another</Text></Pressable> : null}
          {results.length ? <Text accessibilityRole="header" style={s.section}>{mode === 'scan' ? 'Confirm your bottle' : 'Choose your bottle'}</Text> : null}
        </>}
      </View>}
      ListEmptyComponent={!selected && mode === 'search' && query.trim().length >= 2 ? <Text style={s.note}>No matches. Try the brand or expression.</Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Check ${item.name}`} onPress={() => selectBottle(item)} style={({ pressed }) => [s.result, pressed && { opacity: 0.7 }]}><CellarBottleArtwork bottle={{ bottleId: item.id, bottleName: item.name }} size="list" /><View style={s.resultCopy}><Text style={s.resultName}>{item.name}</Text><Text style={s.note}>{[item.proof ? `${item.proof} proof` : '', item.ageStatement?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean).join(' · ') || 'Check this release'}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} /></Pressable>}
    />
    {selected && bottle ? <SafeAreaView edges={['bottom']} style={s.dockSafe}><View style={s.dock}>
      <Pressable accessibilityRole="button" onPress={() => resetCheck(true)} style={[s.primary, s.dockAction]}><Text style={s.primaryText}>{mode === 'search' ? 'Search another' : 'Scan another'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!preferences} onPress={() => handoff(bottle, 'shelf')} style={[s.secondary, s.dockAction]}><Text style={s.link}>Add to My Shelf</Text></Pressable>
    </View></SafeAreaView> : null}
  </View>;
}
const s = StyleSheet.create({
  dockSafe: { backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, dock: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 12 }, dockAction: { flex: 1, paddingHorizontal: 8 },
  priceLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, priceVerdict: { color: colors.accent, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  actionRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingBottom: 8 }, smallAction: { flex: 1, minHeight: 52, gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }, smallActionText: { color: colors.accent, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  topSafe: { backgroundColor: colors.background }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, topTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  scoreTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 }, scoreValue: { alignItems: 'center', minWidth: 66 }, pendingCard: { paddingVertical: 14, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  releaseTag: { color: colors.accent, fontSize: 12, fontWeight: '600' }, priceContext: { gap: 4 }, contextTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' }, shortReasons: { gap: 9 },
  reviews: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 14 }, reviewHeading: { color: colors.text, fontSize: 17, fontWeight: '600' }, reviewRow: { flexDirection: 'row', gap: 24, marginVertical: 3 }, reviewItem: { flex: 1, gap: 3 }, reviewValue: { color: colors.text, fontSize: 25, fontWeight: '600' }, methodology: { gap: 10 },

  page: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingTop: 8, paddingBottom: 36 }, header: { gap: 14, marginBottom: 8 }, copy: { color: colors.text, fontSize: 14, lineHeight: 21 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, link: { color: colors.accent, fontSize: 14, fontWeight: '600' }, eyebrow: { color: colors.accent, letterSpacing: 1.5, fontSize: 10, fontWeight: '700' }, iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  region: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, regionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }, regionEditor: { gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14 }, field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }, stateList: { maxHeight: 240 }, stateOption: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }, areaChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, input: { backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 15, borderRadius: 10, padding: 14, minHeight: 48 }, primary: { backgroundColor: colors.accent, borderRadius: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, primaryText: { color: colors.background, fontSize: 14, fontWeight: '700' }, textButton: { minHeight: 44, justifyContent: 'center' }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  help: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: 12 }, helpCopy: { flex: 1, gap: 6 }, helpTitle: { color: colors.text, fontSize: 15, fontWeight: '700' }, modes: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.accent }, section: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, resultCopy: { flex: 1, gap: 5 }, resultName: { color: colors.text, fontSize: 16, lineHeight: 22 }, bottleHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 }, bottleArt: { width: 88, height: 148, alignItems: 'center', justifyContent: 'center' }, bottleCopy: { flex: 1, gap: 6 }, bottleName: { color: colors.text, fontFamily: fonts.heading, fontSize: 23, lineHeight: 28 },
  priceEntry: { gap: 8 }, inputLabel: { color: colors.muted, fontSize: 13 }, priceInput: { minHeight: 56, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }, currency: { color: colors.accent, fontSize: 24 }, priceText: { flex: 1, color: colors.text, fontSize: 18, paddingVertical: 10 }, scoreCard: { padding: 16, gap: 10, backgroundColor: '#211A12', borderRadius: 20, borderWidth: 1, borderColor: '#584027' }, scoreLine: { flexDirection: 'row', alignItems: 'center', gap: 16 }, score: { color: colors.text, fontFamily: fonts.heading, fontSize: 48, lineHeight: 54 }, scoreOutOf: { color: colors.muted, fontSize: 12 }, verdictCopy: { flex: 1, gap: 7 }, verdict: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' }, reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});

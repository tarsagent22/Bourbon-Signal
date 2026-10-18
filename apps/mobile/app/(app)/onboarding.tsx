import { useAuth } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Keyboard, Linking, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { COVERAGE_STATES } from '../../../../shared/coverage-states';
import { normalizeCommunityDisplayName } from '../../../../shared/community-display-name';
import { EMPTY_ONBOARDING, FLAVOR_OPTIONS, INTEREST_OPTIONS, PROOF_OPTIONS, beginnerPath, communityAlertsIncluded, normalizeOnboardingDraft, onboardingFlavorSelections, type OnboardingCoverageState, type OnboardingDraft } from '../../../../shared/mobile-onboarding';
import type { GeographySearchResponse, MemberPreferences, MemberProfile, MonitoringScope, MonitoringScopeType, OnboardingDiscovery, RadarBottleOption, SignalRewardItem } from '../../src/api/types';
import { BrandLoading } from '../../src/components/BrandLoading';
import { CellarBottleArtwork } from '../../src/components/CellarBottleArtwork';
import { draftKey, readDraft, writeDraft } from '../../src/drafts/form-draft';
import { useAccessibleStatus } from '../../src/hooks/useAccessibleStatus';
import { useBottleCatalog } from '../../src/hooks/useBottleCatalog';
import { useMobileApi } from '../../src/hooks/useMobileApi';
import { OnboardingShelfSheet } from '../../src/onboarding/OnboardingShelfSheet';
import { StateCoverageCard } from '../../src/onboarding/StateCoverageCard';
import { canonicalBottleKey, upsertCollectionBottle } from '../../src/interactions/member-interactions';
import { productIdFor } from '../../src/membership/purchases';
import { usePurchases } from '../../src/membership/PurchasesProvider';
import { CoverageRequestSheet } from '../../src/onboarding/CoverageRequestSheet';
import { Choice, FlavorChip, ExampleSighting, OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
import { enableRadarPush, radarPushPermission, radarPushDeviceId } from '../../src/push/push-registration';
import { bottleWatchMutation, watchedBottleCount } from '../../src/radar/radar-preferences';
import { colors } from '../../src/theme';

export default function OnboardingScreen() {
  const { userId } = useAuth(); return userId ? <MemberOnboarding key={userId} owner={userId} /> : <BrandLoading />;
}
function MemberOnboarding({ owner }: { owner: string }) {
  const api = useMobileApi(); const router = useRouter(); const catalog = useBottleCatalog(); const purchases = usePurchases();
  const [draft, setDraft] = useState<OnboardingDraft>({ ...EMPTY_ONBOARDING });
  const [profile, setProfile] = useState<MemberProfile['profile'] | null>(null);
  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [statePicker, setStatePicker] = useState(false); const [stateQuery, setStateQuery] = useState(''); const [coverageRequest, setCoverageRequest] = useState(false);
  const [coverage, setCoverage] = useState<OnboardingCoverageState | null>(null); const [coverageLoading, setCoverageLoading] = useState(false); const [coverageError, setCoverageError] = useState(''); const [coverageAttempt, setCoverageAttempt] = useState(0);
  const [bottleQuery, setBottleQuery] = useState(''); const [discovery, setDiscovery] = useState<OnboardingDiscovery | null>(null); const [discovering, setDiscovering] = useState(false);
  const [tasteAdvanced, setTasteAdvanced] = useState(false);
  const [tasteStage, setTasteStage] = useState<'bottle' | 'flavors'>('bottle');
  const [selectedPick, setSelectedPick] = useState<OnboardingDiscovery['suggestions'][number] | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false); const [shelfBottle, setShelfBottle] = useState<RadarBottleOption | null>(null); const [shelfMessage, setShelfMessage] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'barrel'>('barrel');
  const [reward, setReward] = useState<SignalRewardItem | null>(null);
  const [localAreas, setLocalAreas] = useState(false); const [areaLevel, setAreaLevel] = useState<MonitoringScopeType>('city'); const [areaQuery, setAreaQuery] = useState('');
  const [areas, setAreas] = useState<GeographySearchResponse['results']>([]); const [areaLoading, setAreaLoading] = useState(false); const [areaError, setAreaError] = useState(''); const [areaOffset, setAreaOffset] = useState(0); const [areaHasMore, setAreaHasMore] = useState(false); const [areaAttempt, setAreaAttempt] = useState(0);
  const [selectedScopes, setSelectedScopes] = useState<MonitoringScope[]>([]); const [mode, setMode] = useState<MemberPreferences['alertMode']>('anything_notable');
  const [community, setCommunity] = useState(false); const [pushReady, setPushReady] = useState(false); const [permissionDenied, setPermissionDenied] = useState(false);
  const [storageError, setStorageError] = useState(''); const finished = useRef(false); const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useRef(draft); current.current = draft;
  const storageKey = draftKey(owner, 'onboarding-v2');
  const paid = Boolean(profile?.membership.paid); const communityIncluded = communityAlertsIncluded(profile?.membership.tier || 'free');
  const purchaseBusy = ['purchasing', 'restoring'].includes(purchases.status);
  const working = busy || purchaseBusy; const stateName = COVERAGE_STATES.find(state => state.code === draft.homeState)?.name || draft.homeState;
  const watched = new Set([...(preferences?.bottleAlertPreferences.bottleNames || []), ...(preferences?.bottleAlertPreferences.bottleKeys || [])].map(canonicalBottleKey));
  const shelfBottles = preferences?.collectionPreferences.bottles || [];
  const areaLimit = preferences?.entitlements?.alertAreaLimit; const bottleLimit = preferences?.entitlements?.trackedBottleLimit;
  useAccessibleStatus(error || storageError);

  const refreshMember = useCallback(async () => {
    if (!mounted.current) throw new Error('This setup session has closed.');
    const [member, prefs] = await Promise.all([api.getMemberProfile({ fresh: true }), api.getMemberPreferences({ fresh: true })]);
    if (!mounted.current) throw new Error('This setup session has closed.');
    setProfile(member.profile); setPreferences(prefs); return { member: member.profile, prefs };
  }, [api]);
  async function load() {
    setError('');
    try {
      const [status, member, prefs, local] = await Promise.all([api.getMobileOnboardingStatus({ fresh: true }), api.getMemberProfile({ fresh: true }), api.getMemberPreferences({ fresh: true }), readDraft(SecureStore, storageKey, { ...EMPTY_ONBOARDING }).catch(() => null)]);
      if (!mounted.current) return;
      if (status.completed) { router.replace('/(app)/(tabs)'); return; }
      const saved = normalizeOnboardingDraft(local) || normalizeOnboardingDraft(status.draft) || { ...EMPTY_ONBOARDING };
      const step = !member.profile.membership.paid && saved.step > 4 ? 4 : saved.step;
      setDraft({ ...saved, flavors: onboardingFlavorSelections(saved.flavors), step }); setProfile(member.profile); setPreferences(prefs); setMode(prefs.alertMode);
      setCommunity(communityAlertsIncluded(member.profile.membership.tier) && prefs.notificationPreferences.sightings.enabled);
      setSelectedScopes(prefs.monitoringScopes); setLocalAreas(prefs.monitoringScopes.some(scope => scope.type !== 'state'));
      if (member.profile.membership.paid && step === 8) {
        const push = await api.getPushDeviceStatus(await radarPushDeviceId(), { fresh: true }).catch(() => null);
        setPushReady(Boolean(push?.enabled && push.currentDeviceRegistered && !push.warning));
      }
      setReady(true);
    } catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'Setup could not load. Try again.'); }
  }
  useEffect(() => { void load(); }, [api, owner]);
  useFocusEffect(useCallback(() => { if (ready) void refreshMember().catch(() => setError('Your account could not refresh. Try again before continuing.')); }, [ready, refreshMember]));
  useEffect(() => {
    if (!ready || finished.current) return;
    const fields = { ...draft };
    const save = () => { if (!finished.current) void writeDraft(SecureStore, storageKey, fields).catch(() => setStorageError('Your progress could not save on this device. Continue to save it to your account.')); };
    const timer = setTimeout(save, 300); const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { clearTimeout(timer); save(); } });
    return () => { clearTimeout(timer); subscription.remove(); save(); };
  }, [draft, ready, storageKey]);
  useEffect(() => {
    if (!ready || draft.step !== 3) return;
    let live = true;
    void api.getSignalPoints().then(result => { if (live) setReward(result.catalog.find(item => item.key === 'glencairn' && item.inventoryRemaining !== 0) || null); }).catch(() => undefined);
    return () => { live = false; };
  }, [api, ready, draft.step]);
  const refreshPurchases = purchases.refresh;
  useEffect(() => { if (ready && draft.step === 4 && !paid) void refreshPurchases(); }, [ready, draft.step, paid, refreshPurchases]);
  useEffect(() => {
    if (purchases.profile) setProfile(purchases.profile);
  }, [purchases.profile]);
  useEffect(() => {
    if (!ready || !draft.homeState || (draft.step !== 1 && draft.step !== 5)) return;
    let live = true; setCoverage(null); setCoverageLoading(true); setCoverageError('');
    void api.getCoverageSummary().then(result => {
      if (live) setCoverage(result.states.find(row => row.code === draft.homeState) || null);
    }).catch(() => { if (live) setCoverageError('Coverage details could not load.'); }).finally(() => { if (live) setCoverageLoading(false); });
    return () => { live = false; };
  }, [api, ready, draft.homeState, draft.step, coverageAttempt]);
  useEffect(() => {
    if (draft.step !== 5 || !localAreas || !draft.homeState) return;
    let live = true; setAreaLoading(true); setAreaError('');
    const timer = setTimeout(() => {
      void api.searchMonitoringGeography({ state: draft.homeState, levels: [areaLevel], query: areaQuery, offset: areaOffset, limit: 20, fresh: true }).then(result => {
        if (live) { setAreas(previous => areaOffset ? [...previous, ...result.results.filter(row => !previous.some(old => old.id === row.id))] : result.results); setAreaHasMore(result.hasMore); }
      }).catch(() => { if (live) setAreaError('Areas could not load. Try again.'); }).finally(() => { if (live) setAreaLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [api, draft.step, draft.homeState, localAreas, areaLevel, areaQuery, areaOffset, areaAttempt]);

  function edit(patch: Partial<OnboardingDraft>) { if (lock.current || purchaseBusy) return; setError(''); setDiscovery(null); setDraft(value => ({ ...value, ...patch })); }
  function persist(next: OnboardingDraft) {
    const promise = saveQueue.current.catch(() => undefined).then(() => { if (!mounted.current) throw new Error('This setup session has closed.'); return api.saveOnboardingDraft(next); });
    saveQueue.current = promise; return promise;
  }
  async function run(action: () => Promise<void>) {
    if (lock.current || purchaseBusy) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'That could not be saved. Try again.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function go(step: number) {
    const next = { ...current.current, step }; await persist(next); if (!mounted.current) return; setBottleQuery(''); setDraft(next);
  }
  async function finish() {
    await saveQueue.current.catch(() => undefined);
    if (!mounted.current) return;
    await api.completeMobileOnboarding({ displayName: draft.displayName, homeState: draft.homeState, age21Affirmed: true, action: 'complete', draft });
    if (!mounted.current) return;
    finished.current = true;
    await writeDraft(SecureStore, storageKey, null).catch(() => undefined);
    router.replace('/(app)/(tabs)');
  }
  async function next() {
    await run(async () => {
      if (draft.step === 0) { const name = normalizeCommunityDisplayName(draft.displayName); if (!name.ok) throw new Error(name.error); await go(1); }
      else if (draft.step === 1) {
        if (!draft.homeState) throw new Error('Choose your home state.');
        const nextDraft = { ...draft, step: 2 };
        await saveQueue.current.catch(() => undefined);
        await api.completeMobileOnboarding({ displayName: draft.displayName, homeState: draft.homeState, age21Affirmed: true, action: 'profile', draft: nextDraft });
        await refreshMember(); setDraft(nextDraft);
      } else if (draft.step === 4) {
        const latest = await refreshMember();
        if (latest.member.membership.paid) { await go(5); } else await finish();
      } else if (draft.step === 5) {
        const scope: MonitoringScope = { type: 'state', id: `state:${draft.homeState}`, state: draft.homeState, label: stateName };
        const scopes = localAreas ? selectedScopes.filter(row => row.type !== 'state' || row.state !== draft.homeState) : [...selectedScopes.filter(row => row.state !== draft.homeState), scope];
        if (!scopes.some(row => row.state === draft.homeState)) throw new Error('Choose an area, or select the whole state.');
        const saved = await api.updateMemberPreferences({ monitoringScopes: scopes }); setPreferences(saved); setSelectedScopes(saved.monitoringScopes); await go(6);
      } else if (draft.step === 6) {
        if (mode === 'specific_bottles' && !watchedBottleCount(preferences!)) throw new Error('Choose at least one bottle to watch.');
        const saved = await api.updateMemberPreferences({ alertMode: mode, notificationPreferences: { rarityTiers: ['limited', 'allocated', 'unicorn'] } }); setPreferences(saved); await go(7);
      } else if (draft.step === 8) await finish();
      else await go(draft.step + 1);
    });
  }
  async function showSuggestions() {
    await run(async () => { setDiscovering(true); try { const nextDraft = { ...draft, budget: 'No preference' as const }; await persist(nextDraft); setDraft(nextDraft); setDiscovery(await api.getOnboardingDiscovery()); } finally { setDiscovering(false); } });
  }
  async function watchBottle(name: string, enabled: boolean) {
    await run(async () => { const saved = await api.updateMemberPreferences({ watchlistMutation: bottleWatchMutation(name, enabled) }); setPreferences(saved); });
  }
  async function purchase(tier: 'standard' | 'barrel') {
    await run(async () => {
      await persist(draft); const id = productIdFor(tier, 'monthly');
      if (!id) throw new Error('This membership could not load. Try again.');
      if (purchases.status !== 'ready' || !purchases.products.some(product => product.productId === id) || !purchases.eligibleProductIds.includes(id)) { await purchases.refresh(); return; }
      await purchases.purchase(id); const latest = await refreshMember(); if (latest.member.membership.paid) await go(5);
    });
  }
  async function enableNotifications() {
    await run(async () => {
      try {
        const status = await enableRadarPush(api);
        if (!status.enabled || !status.currentDeviceRegistered || status.warning) throw new Error('Notifications could not finish setting up. Try again or choose Maybe later.');
        setPushReady(true);
        const saved = await api.updateMemberPreferences({ notificationPreferences: { sightings: { enabled: communityIncluded && community } } });
        setPreferences(saved); setPushReady(true); setPermissionDenied(false); await go(8);
      } catch (caught) { setPermissionDenied(await radarPushPermission().catch(() => 'undetermined') === 'denied'); throw caught; }
    });
  }
  function changeAreaSearch(patch: { level?: MonitoringScopeType; query?: string }) {
    if (patch.level) setAreaLevel(patch.level); if (patch.query !== undefined) setAreaQuery(patch.query); setAreaOffset(0); setAreas([]);
  }
  function toggleScope(row: GeographySearchResponse['results'][number]) {
    setSelectedScopes(scopes => scopes.some(scope => scope.id === row.id) ? scopes.filter(scope => scope.id !== row.id) : [...scopes, { id: row.id, type: row.level, state: row.state, label: row.name }]);
  }
  if (!ready || !profile || !preferences) return error ? <OnboardingFrame title="Let's try that again." description={error}><OnboardingButton label="Retry setup" onPress={() => void load()} /></OnboardingFrame> : <BrandLoading label="Opening account setup" />;
  const tasting = draft.step === 2 && beginnerPath(draft.interest);
  const titles = ['A little about you.', 'Where do you shop?', tasting ? discovery ? 'Bottles you might like.' : tasteStage === 'bottle' ? 'Is there a bottle you already like?' : 'Which flavors do you enjoy?' : 'What’s on your shelf?', 'See what others are finding.', 'Get alerts for bottles you love.', 'Where do you want alerts?', 'What are you looking for?', 'Turn on notifications.', 'Your alert preferences are saved.'];
  const descriptions = ['Choose the name members will see on your sightings.', 'Choose the state you shop in most.', tasting ? discovery ? draft.likedBottleName || draft.flavors.length ? undefined : 'A few different styles to try. You don’t need to know your preferences yet.' : tasteStage === 'bottle' ? undefined : 'Pick as many as you like, or leave this open.' : 'Add bottles you own or whiskies you’ve tried. Ratings are optional.', `Find bottles worth the trip, shared by bourbon drinkers${stateName ? ` in ${stateName}` : ' near you'}.`, 'Let Bourbon Signal do the heavy lifting. Choose your bottles and areas, and get an alert when a matching sighting comes in.', undefined, undefined, 'Allow Bourbon Signal to send alerts to this phone.', 'You can change these in Radar.'];
  const canSkip = (draft.step === 2 && !shelfBottles.length) || draft.step === 5 || draft.step === 6;
  const shelfStart = draft.step === 2 && !beginnerPath(draft.interest) && !shelfBottles.length && preferences.collectionAccess.canAdd;
  const continueLabel = shelfStart ? 'Add a bottle' : tasting && !discovery ? tasteStage === 'bottle' ? 'Choose flavors' : 'See recommendations' : draft.step === 4 ? paid ? 'Set up my alerts' : 'Continue without alerts →' : draft.step === 8 ? 'Open Bourbon Signal' : 'Continue';
  async function primary() {
    if (shelfStart) openShelf(null);
    else if (tasting && !discovery) { if (tasteStage === 'bottle') { setBottleQuery(''); setTasteStage('flavors'); } else await showSuggestions(); }
    else await next();
  }
  function back() {
    if (tasting && discovery) { setDiscovery(null); setTasteStage('flavors'); }
    else if (tasting && tasteStage === 'flavors') setTasteStage('bottle');
    else void run(() => go(draft.step - 1));
  }
  function openShelf(bottle: RadarBottleOption | null) { setError(''); setShelfMessage(''); setShelfBottle(bottle); setShelfOpen(true); Keyboard.dismiss(); }
  async function saveShelf(bottle: RadarBottleOption, kind: 'sealed' | 'opened' | 'just_tasted', rating?: number) {
    await run(async () => {
      const { prefs } = await refreshMember();
      const existing = prefs.collectionPreferences.bottles.some(row => row.bottleId === bottle.id || canonicalBottleKey(row.bottleName) === canonicalBottleKey(bottle.name));
      if (!existing && !prefs.collectionAccess.canAdd) throw new Error('Your shelf is full. You can continue onboarding and manage it in My Shelf.');
      const bottles = upsertCollectionBottle(prefs.collectionPreferences.bottles, bottle, { kind, quantity: 1, rating, isRated: rating !== undefined }, new Date().toISOString(), { reconcilePendingCustom: true });
      try {
        const saved = await api.updateMemberPreferences({ collectionPreferences: { bottles, version: prefs.collectionPreferences.version } });
        if (!mounted.current) return; setPreferences(saved); setShelfOpen(false); setShelfMessage(kind === 'just_tasted' ? `Tasting saved for ${bottle.name}.` : `${bottle.name} added to My Shelf.`);
      } catch (caught) { await refreshMember().catch(() => undefined); throw caught; }
    });
  }
  const product = purchases.products.find(item => item.productId === productIdFor(selectedPlan, 'monthly'));
  const eligible = Boolean(product && purchases.eligibleProductIds.includes(product.productId));
  return <>
    <OnboardingFrame obscured={pickOpen || shelfOpen || statePicker || coverageRequest} title={titles[draft.step]} description={descriptions[draft.step]} step={draft.step} context={tasting ? discovery ? 'Recommendations' : tasteStage === 'bottle' ? 'Taste · 1 of 2' : 'Taste · 2 of 2' : undefined} transitionKey={`${draft.step}-${tasteStage}-${Boolean(discovery)}`} onBack={draft.step > 0 ? back : undefined} backDisabled={working}

      footer={<>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}{storageError ? <Text accessibilityRole="alert" style={s.error}>{storageError}</Text> : null}
        {draft.step === 7 ? <><OnboardingButton label="Enable notifications" busy={working} onPress={() => void enableNotifications()} /><OnboardingButton secondary label="Maybe later" disabled={working} onPress={() => void run(async () => { const status = await api.getPushDeviceStatus(await radarPushDeviceId(), { fresh: true }).catch(() => null); setPushReady(Boolean(status?.enabled && status.currentDeviceRegistered && !status.warning)); await go(8); })} /></> : draft.step === 4 && !paid ? <>
          <OnboardingButton label={eligible && purchases.status === 'ready' ? `Get ${'Barrel Proof'} · ${product!.localizedPrice}/${product!.localizedPeriod}` : 'Check purchase options'} busy={working} disabled={purchases.status === 'unsupported'} onPress={() => void purchase(selectedPlan)} />
          <OnboardingButton secondary label="Continue without alerts →" disabled={working} onPress={() => void next()} />
        </> : <><OnboardingButton label={continueLabel} busy={working || discovering} disabled={(draft.step === 0 && !draft.displayName.trim()) || (draft.step === 1 && !draft.homeState)} onPress={() => void primary()} />
        {canSkip && !discovery ? <OnboardingButton secondary label={draft.step === 2 ? 'Skip for now' : 'Set up alerts later'} disabled={working} onPress={() => void run(async () => { if (draft.step === 2) await go(3); else await finish(); })} /> : null}</>}
      </>}>
      {draft.step === 0 ? <>
        <Text style={s.label}>Display name</Text><TextInput accessibilityLabel="Community display name" autoCapitalize="words" maxLength={32} value={draft.displayName} onChangeText={displayName => edit({ displayName })} placeholder="Your name or handle" placeholderTextColor={colors.muted} style={s.input} editable={!working} />
        <Text style={[s.label, { marginTop: 10 }]}>Which sounds most like you?</Text>
        {INTEREST_OPTIONS.map(option => <Choice key={option.key} title={option.title} detail={option.detail} selected={draft.interest === option.key} onPress={() => edit({ interest: option.key })} disabled={working} />)}

      </> : null}
      {draft.step === 1 || draft.step === 5 ? <>
        <Text style={s.label}>Shopping state</Text><Pressable accessibilityRole="button" accessibilityLabel={stateName ? `Shopping state: ${stateName}` : 'Choose a state'} disabled={working} onPress={() => { setStateQuery(''); setStatePicker(true); }} style={[s.input, s.row, { justifyContent: 'space-between' }]}><Text style={s.label}>{stateName || 'Choose a state'}</Text><Text style={s.link}>⌄</Text></Pressable>
        {coverageLoading ? <Text style={s.small}>Loading coverage…</Text> : coverageError ? <><Text style={s.small}>{coverageError}</Text><OnboardingButton secondary label="Retry coverage check" onPress={() => setCoverageAttempt(value => value + 1)} /></> : draft.homeState && coverage ? <StateCoverageCard coverage={coverage} name={stateName} onRequest={() => setCoverageRequest(true)} /> : null}
      </> : null}
      {tasting ? <>
        {!discovery ? tasteStage === 'bottle' ? <>
          <TextInput accessibilityLabel="Search for a whiskey you enjoyed" placeholder="Bottle or distillery name" placeholderTextColor={colors.muted} style={s.input} value={bottleQuery || draft.likedBottleName} autoCorrect={false} spellCheck={false} onChangeText={value => { setBottleQuery(value); edit({ likedBottleId: '', likedBottleName: '' }); }} editable={!working} />
          {bottleQuery.trim() ? catalog.search(bottleQuery, 4).map(bottle => <Choice key={bottle.id} bottleId={bottle.id} title={bottle.name} selected={draft.likedBottleId === bottle.id} onPress={() => { edit({ likedBottleId: bottle.id, likedBottleName: bottle.name }); setBottleQuery(''); Keyboard.dismiss(); }} />) : null}
          {bottleQuery.trim() && !catalog.search(bottleQuery, 4).length ? <Text style={s.small}>No matches. Try a brand or choose flavors instead.</Text> : null}
          {catalog.error ? <OnboardingButton secondary label="Retry bottle search" onPress={catalog.retry} /> : null}
          <OnboardingButton secondary label={draft.likedBottleId ? 'Choose by flavors instead' : 'I’m new to bourbon'} onPress={() => { setBottleQuery(''); edit({ likedBottleId: '', likedBottleName: '' }); setTasteStage('flavors'); }} />
          {draft.likedBottleId ? <View style={[s.row, { paddingVertical: 6 }]}><CellarBottleArtwork bottle={{ bottleId: draft.likedBottleId, bottleName: draft.likedBottleName }} size="feed" /><Text style={[s.small, { flex: 1 }]}>We’ll use this to help choose your recommendations.</Text></View> : <View style={{ gap: 12, marginTop: 6 }}><Text style={s.small}>Or start with a familiar bottle</Text>{catalog.catalog.filter(bottle => ['makers-mark', 'buffalo-trace', 'woodford-reserve'].includes(bottle.id)).slice(0, 3).map(bottle => <Pressable key={bottle.id} accessibilityRole="button" accessibilityLabel={`I enjoyed ${bottle.name}`} onPress={() => edit({ likedBottleId: bottle.id, likedBottleName: bottle.name })} style={[s.row, { minHeight: 66, borderBottomWidth: 1, borderColor: '#2E3229' }]}><CellarBottleArtwork bottle={{ bottleId: bottle.id, bottleName: bottle.name }} size="list" /><Text style={s.label}>{bottle.name}</Text><Text style={s.link}>+</Text></Pressable>)}</View>}
        </> : <>
          {draft.likedBottleName ? <Text style={s.small}>You enjoyed {draft.likedBottleName}.</Text> : null}
          <View style={s.chipGrid}>{FLAVOR_OPTIONS.map(flavor => <FlavorChip key={flavor} title={flavor} selected={draft.flavors.includes(flavor)} disabled={working} onPress={() => edit({ flavors: draft.flavors.includes(flavor) ? draft.flavors.filter(value => value !== flavor) : [...draft.flavors, flavor] })} />)}</View>
          <OnboardingButton secondary label={draft.flavors.length ? "Clear flavors" : "No preference"} onPress={() => edit({ flavors: [] })} />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: tasteAdvanced }} onPress={() => setTasteAdvanced(value => !value)} style={[s.row, { minHeight: 48, justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#35392F', marginTop: 12 }]}><Text style={s.label}>Strength preference</Text><Text style={s.link}>{tasteAdvanced ? '−' : '+ Optional'}</Text></Pressable>
          {tasteAdvanced ? <>{PROOF_OPTIONS.map(option => <Choice key={option.key} title={option.title} detail={option.detail} selected={draft.proof === option.key} onPress={() => edit({ proof: option.key })} />)}</> : null}
        </> : <>
          {discovery.suggestions.length ? discovery.suggestions.map((bottle, index) => <Pressable key={bottle.id} accessibilityRole="button" accessibilityLabel={`View ${bottle.name}`} disabled={working} onPress={() => { setShelfMessage(''); setSelectedPick(bottle); setPickOpen(true); }} style={[s.panel, { backgroundColor: index === 0 ? '#252D20' : '#191E17', paddingVertical: index === 0 ? 22 : 14 }]}>
            <View style={s.row}><CellarBottleArtwork bottle={{ bottleId: bottle.id, bottleName: bottle.name }} size={index === 0 ? "showcase" : "feed"} /><View style={{ flex: 1, gap: 10 }}><Text style={[s.label, { fontSize: 18, lineHeight: 24 }]}>{bottle.name}</Text><Text style={s.small}>{bottle.description || bottle.reason}</Text>{bottle.description && bottle.reason ? <Text style={s.link}>{bottle.reason}</Text> : null}{bottle.proof ? <Text style={s.small}>{bottle.proof} proof · {bottle.proof / 2}% ABV</Text> : null}<Text style={s.link}>View bottle →</Text></View></View>
          </Pressable>) : <><Text style={s.copy}>No bottles match that strength yet. Try another preference.</Text></>}
          {discovery.signals.length ? <><Text style={s.label}>Spotted in {stateName}</Text>{discovery.signals.map(signal => <View key={signal.id} style={s.panel}><Text style={s.label}>{signal.bottle.name}</Text><Text style={s.small}>{signal.location.store?.name || signal.location.label || signal.location.state}</Text><Text style={s.small}>Reported {new Date(signal.timing.displayAt).toLocaleString()}</Text></View>)}</> : null}
          <OnboardingButton secondary label="Change preferences" onPress={() => { setDiscovery(null); setTasteStage('flavors'); }} />
        </>}
      </> : null}
      {draft.step === 2 && !beginnerPath(draft.interest) ? <>
        {shelfBottles.length ? <View style={{ gap: 12 }}>{shelfBottles.slice(0, 6).map(bottle => <View key={bottle.bottleId} style={[s.row, { borderBottomWidth: 1, borderColor: '#30352B', paddingVertical: 8 }]}><CellarBottleArtwork bottle={bottle} size="list" /><View style={{ flex: 1 }}><Text style={s.label}>{bottle.bottleName}</Text><Text style={s.small}>{bottle.tastedOnly ? 'Tried' : 'On your shelf'}{bottle.isRated ? ` · ${(bottle.rating / 10).toFixed(1)}/10` : ''}</Text></View></View>)}</View> : <View style={{ gap: 12, paddingVertical: 10 }}><Text style={s.label}>Your bottles and ratings, together.</Text><Text style={s.copy}>Keep track of what you own, what you’ve tried, and what you’d buy again.</Text></View>}
        {shelfMessage ? <Text accessibilityLiveRegion="polite" style={s.success}>{shelfMessage}</Text> : null}
        {!shelfStart ? <OnboardingButton secondary label="Add another bottle" disabled={working || !preferences.collectionAccess.canAdd} onPress={() => openShelf(null)} /> : null}
        {!preferences.collectionAccess.canAdd ? <Text style={s.small}>Your shelf is full. You can continue setup.</Text> : null}
      </> : null}
      {draft.step === 3 ? <>
        <ExampleSighting state={draft.homeState} />
        <View style={{ gap: 6 }}><Text style={s.label}>Found something worth sharing?</Text><Text style={s.small}>Post the bottle, store, price, and a photo. Earn Signal Points for eligible sightings.</Text></View>
        {reward ? <View style={[s.panel, s.row, { backgroundColor: '#29251C' }]}><Image accessible={false} source={require('../../assets/rewards/glencairn.png')} style={{ width: 44, height: 58 }} resizeMode="contain" /><View style={{ flex: 1, gap: 6 }}><Text style={s.small}>Redeem with Barrel Proof</Text><Text style={s.label}>{reward.name}</Text><Text style={s.link}>{reward.points.toLocaleString()} Signal Points</Text></View></View> : <Text style={s.small}>Everyone can earn points. Paid members can redeem them for glassware and other rewards.</Text>}
      </> : null}
      {draft.step === 4 ? <>
        {paid ? <View style={s.panel}><Text style={s.label}>{profile.membership.label} is active.</Text><Text style={s.copy}>Next: choose your areas, bottles, and notifications.</Text></View> : <>
          <ExampleSighting notification state={draft.homeState} />
          <View style={{ flexDirection: 'row', gap: 8 }}>{(['barrel'] as const).map(tier => {
            const planProduct = purchases.products.find(item => item.productId === productIdFor(tier, 'monthly'));
            return <Pressable key={tier} accessibilityRole="radio" accessibilityLabel={'Barrel Proof membership'} accessibilityState={{ checked: selectedPlan === tier, disabled: working }} disabled={working} onPress={() => setSelectedPlan(tier)} style={[s.choice, { flex: 1, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 6, padding: 12 }, selectedPlan === tier && s.choiceSelected]}><View style={[s.row, { width: '100%', gap: 4, justifyContent: 'space-between' }]}><Text style={[s.label, { fontSize: 13, flex: 1 }]}>{'Barrel Proof'}</Text><View accessible={false} style={[s.selection, selectedPlan === tier && s.selectionActive]}>{selectedPlan === tier ? <Text style={s.selectionCheck}>✓</Text> : null}</View></View><Text style={s.label}>{planProduct?.localizedPrice || 'See store price'}</Text><Text style={s.small}>{planProduct ? `per ${planProduct.localizedPeriod}` : 'Monthly'}</Text><Text style={s.small}>{'Unlimited areas and bottles'}</Text>{tier === 'barrel' ? <Text style={[s.link, { fontSize: 11 }]}>+ Community alerts</Text> : null}</Pressable>;
          })}</View>
          <View style={{ gap: 10 }}>
            {(['Unlimited alert areas and watched bottles', 'Community sighting alerts', 'Full Intel feed · Advanced filters', 'Unlimited My Shelf · Bourbon DNA and recommendations', 'Redeem Signal Points for rewards']).map(benefit => <View key={benefit} style={s.row}><Text style={s.link}>✓</Text><Text style={[s.small, { flex: 1, color: '#D8D3C5' }]}>{benefit}</Text></View>)}
          </View>
          <Text style={s.small}>Billed monthly. Renews until canceled. Cancel in your app store.</Text>
          {purchases.message && purchases.status !== 'ready' ? <Text accessibilityRole="alert" style={s.small}>{purchases.message}</Text> : null}
          <View style={[s.row, { justifyContent: 'center', flexWrap: 'wrap', gap: 0 }]}><OnboardingButton secondary label="Restore purchases" disabled={working || !purchases.restoreAvailable} onPress={() => void run(async () => { await persist(draft); await purchases.restore(); const latest = await refreshMember(); if (latest.member.membership.paid) await go(5); })} /><OnboardingButton secondary label="Terms" onPress={() => router.push('/(app)/account/terms')} /><OnboardingButton secondary label="Privacy" onPress={() => router.push('/(app)/account/privacy')} /></View>
        </>}
      </> : null}
      {draft.step === 5 ? <>
        <Choice title="Whole state" detail="Watch matching reports across your state" selected={!localAreas} onPress={() => setLocalAreas(false)} disabled={working} /><Choice title="Specific areas or stores" detail="Choose the places where you shop" selected={localAreas} onPress={() => setLocalAreas(true)} disabled={working} />
        {localAreas ? <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{(['city', 'county', ...(draft.homeState === 'NC' ? ['board'] : []), 'store'] as MonitoringScopeType[]).map(level => <OnboardingButton secondary key={level} label={level === 'board' ? 'ABC boards' : `${level[0].toUpperCase()}${level.slice(1)}s`} onPress={() => changeAreaSearch({ level })} disabled={working || level === areaLevel} />)}</View>
          <Text style={s.label}>Search {areaLevel === 'board' ? 'ABC boards' : `${areaLevel}s`}</Text><TextInput accessibilityLabel="Search alert areas or stores" value={areaQuery} onChangeText={query => changeAreaSearch({ query })} placeholder="Search by name" placeholderTextColor={colors.muted} style={s.input} editable={!working} />
          <Text style={s.small}>{selectedScopes.length} selected{typeof areaLimit === 'number' ? ` · ${areaLimit} areas included` : ''}</Text>
          {selectedScopes.map(scope => <OnboardingButton key={scope.id} secondary label={`Remove ${scope.label} (${scope.state})`} disabled={working} onPress={() => setSelectedScopes(scopes => scopes.filter(row => row.id !== scope.id))} />)}
          {areas.map(row => { const selected = selectedScopes.some(scope => scope.id === row.id); return <Choice multiple key={row.id} title={row.displayName || row.name} detail={[row.subtitle, row.address, null].filter(Boolean).join(' · ')} selected={selected} disabled={working || (!selected && typeof areaLimit === 'number' && selectedScopes.length >= areaLimit)} onPress={() => toggleScope(row)} />; })}
          {areaLoading ? <ActivityIndicator color={colors.accent} /> : areaError ? <><Text style={s.error}>{areaError}</Text><OnboardingButton secondary label="Retry area search" onPress={() => setAreaAttempt(value => value + 1)} /></> : !areas.length ? <Text style={s.small}>No matching {areaLevel}s are available to select. Try another name or choose the whole state.</Text> : null}
          {areaHasMore && !areaLoading ? <OnboardingButton secondary label="More areas" onPress={() => setAreaOffset(areas.length)} /> : null}
          <Text style={s.small}>Choose a city or ABC board if your store isn’t listed.</Text>
        </> : null}
      </> : null}
      {draft.step === 6 ? <>
        <Choice title="Anything notable in my areas" detail="Limited releases and allocated bottles" selected={mode === 'anything_notable'} onPress={() => setMode('anything_notable')} disabled={working} /><Choice title="Only specific bottles" detail="Alerts for the bottles you choose below" selected={mode === 'specific_bottles'} onPress={() => setMode('specific_bottles')} disabled={working} />
        {mode === 'specific_bottles' ? <>
          <TextInput accessibilityLabel="Search bottles to watch" value={bottleQuery} onChangeText={setBottleQuery} placeholder="Search bottles" placeholderTextColor={colors.muted} style={s.input} editable={!working} />
          <Text style={s.small}>{watchedBottleCount(preferences)} watched{typeof bottleLimit === 'number' ? ` · ${bottleLimit} included` : ''}</Text>
          {(bottleQuery.trim() ? catalog.search(bottleQuery, 8) : catalog.catalog.filter(row => watched.has(canonicalBottleKey(row.name)))).map(bottle => <Choice multiple key={bottle.id} bottleId={bottle.id} title={bottle.name} selected={watched.has(canonicalBottleKey(bottle.name))} disabled={working || (!watched.has(canonicalBottleKey(bottle.name)) && typeof bottleLimit === 'number' && watchedBottleCount(preferences) >= bottleLimit)} onPress={() => void watchBottle(bottle.name, !watched.has(canonicalBottleKey(bottle.name)))} />)}
          {bottleQuery && !catalog.search(bottleQuery, 8).length ? <Text style={s.small}>No bottles match. Try another name.</Text> : null}
          {catalog.error ? <><Text style={s.small}>{catalog.error}</Text><OnboardingButton secondary label="Refresh bottle catalog" onPress={catalog.retry} /></> : null}
        </> : null}
      </> : null}
      {draft.step === 7 ? <>
        <ExampleSighting notification state={draft.homeState} />
        {communityIncluded ? <View style={[s.panel, s.row]}><View style={{ flex: 1, gap: 8 }}><Text style={s.label}>Community sighting alerts</Text><Text style={s.small}>Include matching finds shared by members. Included with Barrel Proof.</Text></View><Switch accessibilityLabel="Community sighting alerts" value={community} disabled={working} onValueChange={setCommunity} trackColor={{ true: colors.accent, false: colors.border }} /></View> : <Text style={s.small}>Bottle alerts are included with Barrel Proof.</Text>}
        {permissionDenied ? <><Text style={s.error}>Notifications are off in your phone settings. You can allow them now or set up alerts later in Radar.</Text><OnboardingButton secondary label="Open phone settings" onPress={() => void Linking.openSettings().catch(() => setError('Open your phone Settings to allow notifications.'))} /></> : null}
      </> : null}
      {draft.step === 8 ? <>
        <View style={s.panel}><Text style={s.label}>Your alert areas</Text><Text style={s.copy}>{preferences.monitoringScopes.map(scope => `${scope.label} (${scope.state})`).join(', ') || 'Set up later in Radar'}</Text><Text style={s.label}>Your bottle alerts</Text><Text style={s.copy}>{preferences.alertMode === 'anything_notable' ? 'Anything notable in your selected areas' : preferences.bottleAlertPreferences.bottleNames.join(', ') || 'No watched bottles yet'}</Text><Text style={s.label}>Notifications</Text><Text style={pushReady ? s.success : s.small}>{pushReady ? 'Enabled on this phone' : 'Set up later in Radar'}</Text>{communityIncluded ? <Text style={s.small}>Community alerts: {preferences.notificationPreferences.sightings.enabled ? 'On' : 'Off'}</Text> : null}</View>
      </> : null}
    </OnboardingFrame>
    <Modal visible={pickOpen} animationType="fade" onRequestClose={() => { if (!working) { if (shelfOpen) { setShelfOpen(false); setError(''); } else setPickOpen(false); } }}>
      {selectedPick ? shelfOpen ? <OnboardingShelfSheet embedded visible bottle={shelfBottle} busy={working} error={error} onClose={() => { if (!working) { setShelfOpen(false); setError(''); } }} onSave={saveShelf} /> : <OnboardingFrame title={selectedPick.name} onBack={() => { if (!working) setPickOpen(false); }} backDisabled={working}
        footer={<>{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<OnboardingButton label="Add to My Shelf" disabled={working || !preferences.collectionAccess.canAdd} onPress={() => { openShelf({ id: selectedPick.id, name: selectedPick.name, proof: selectedPick.proof }); }} /><Text style={[s.small, { textAlign: 'center', paddingVertical: 6 }]}>For bottles you own or whiskies you’ve tried.</Text></>}>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}><CellarBottleArtwork bottle={{ bottleId: selectedPick.id, bottleName: selectedPick.name }} size="detail" /></View>
        {selectedPick.proof ? <Text style={[s.small, { textAlign: 'center' }]}>{selectedPick.proof} proof · {selectedPick.proof / 2}% ABV</Text> : null}
        {selectedPick.description ? <Text style={s.copy}>{selectedPick.description}</Text> : null}
        {selectedPick.reason ? <View style={{ gap: 6 }}><Text style={s.label}>Why this bottle</Text><Text style={s.copy}>{selectedPick.reason}</Text></View> : null}
        {selectedPick.notes?.length ? <View style={s.chipGrid}>{selectedPick.notes.map(note => <View key={note} style={s.chip}><Text style={s.chipText}>{note}</Text></View>)}</View> : null}
        {shelfMessage ? <Text accessibilityLiveRegion="polite" style={s.success}>{shelfMessage}</Text> : null}
        <OnboardingButton secondary label={draft.savedBottleIds?.includes(selectedPick.id) ? 'Remove from saved picks' : 'Save for later'} disabled={working} onPress={() => void run(async () => {
          const ids = draft.savedBottleIds || []; const nextDraft = { ...draft, savedBottleIds: ids.includes(selectedPick.id) ? ids.filter(id => id !== selectedPick.id) : [...ids, selectedPick.id].slice(0, 15) };
          await persist(nextDraft); if (mounted.current) { setDraft(nextDraft); setShelfMessage(nextDraft.savedBottleIds.includes(selectedPick.id) ? 'Saved in your setup preferences.' : 'Removed from saved picks.'); }
        })} />
        {paid ? <OnboardingButton secondary label={watched.has(canonicalBottleKey(selectedPick.name)) ? 'Stop watching this bottle' : 'Watch for this bottle'} disabled={working || (!watched.has(canonicalBottleKey(selectedPick.name)) && typeof bottleLimit === 'number' && watchedBottleCount(preferences) >= bottleLimit)} onPress={() => void watchBottle(selectedPick.name, !watched.has(canonicalBottleKey(selectedPick.name)))} /> : null}
      </OnboardingFrame> : null}
    </Modal>
    <OnboardingShelfSheet visible={shelfOpen && !pickOpen} bottle={shelfBottle} busy={working} error={error} onClose={() => { if (!working) { setShelfOpen(false); setError(''); } }} onSave={saveShelf} />
    <Modal visible={statePicker} animationType="fade" onRequestClose={() => setStatePicker(false)}><OnboardingFrame title="Choose your state." eyebrow="SHOPPING STATE" footer={<OnboardingButton secondary label="Close" onPress={() => setStatePicker(false)} />}><TextInput accessibilityLabel="Search states" value={stateQuery} onChangeText={setStateQuery} style={s.input} placeholder="Search states" placeholderTextColor={colors.muted} />{COVERAGE_STATES.filter(state => `${state.name} ${state.code}`.toLowerCase().includes(stateQuery.toLowerCase())).map(state => <Choice key={state.code} title={state.name} selected={draft.homeState === state.code} onPress={() => { edit({ homeState: state.code }); setAreaOffset(0); setAreas([]); setAreaQuery(''); setStatePicker(false); }} />)}</OnboardingFrame></Modal>
    {coverageRequest ? <CoverageRequestSheet key={draft.homeState} state={draft.homeState} visible onClose={() => setCoverageRequest(false)} /> : null}
  </>;
}

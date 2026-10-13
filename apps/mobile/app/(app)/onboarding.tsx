import { useAuth } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { COVERAGE_STATES } from '../../../../shared/coverage-states';
import { normalizeCommunityDisplayName } from '../../../../shared/community-display-name';
import { BUDGET_OPTIONS, EMPTY_ONBOARDING, FLAVOR_OPTIONS, INTEREST_OPTIONS, PROOF_OPTIONS, beginnerPath, communityAlertsIncluded, normalizeOnboardingDraft, usefulOnboardingCoverage, type OnboardingCoverageState, type OnboardingDraft } from '../../../../shared/mobile-onboarding';
import type { GeographySearchResponse, MemberPreferences, MemberProfile, MonitoringScope, MonitoringScopeType, OnboardingDiscovery } from '../../src/api/types';
import { BrandLoading } from '../../src/components/BrandLoading';
import { CellarBottleArtwork } from '../../src/components/CellarBottleArtwork';
import { draftKey, readDraft, writeDraft } from '../../src/drafts/form-draft';
import { useAccessibleStatus } from '../../src/hooks/useAccessibleStatus';
import { useBottleCatalog } from '../../src/hooks/useBottleCatalog';
import { useMobileApi } from '../../src/hooks/useMobileApi';
import { canonicalBottleKey } from '../../src/interactions/member-interactions';
import { productIdFor } from '../../src/membership/purchases';
import { usePurchases } from '../../src/membership/PurchasesProvider';
import { CoverageRequestSheet } from '../../src/onboarding/CoverageRequestSheet';
import { Choice, OnboardingButton, OnboardingFrame, s } from '../../src/onboarding/OnboardingUI';
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
  const owned = (preferences?.collectionPreferences.bottles || []).filter(bottle => !bottle.tastedOnly);
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
      setDraft({ ...saved, step }); setProfile(member.profile); setPreferences(prefs); setMode(prefs.alertMode);
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
    await run(async () => { setDiscovering(true); try { await persist(draft); setDiscovery(await api.getOnboardingDiscovery()); } finally { setDiscovering(false); } });
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
  const titles = ['What should we call you?', 'Where do you usually shop?', beginnerPath(draft.interest) ? 'Find your kind of whiskey.' : 'Make yourself at home.', 'A good find is worth sharing.', 'Get the next signal.', 'Choose your alert areas.', 'What are you looking for?', 'Get alerts on your phone.', 'You’re ready to explore.'];
  const descriptions = ['Other members will see this name when you post bottle sightings.', 'Choose your home state. You can change it later.', beginnerPath(draft.interest) ? 'Tell us a little about what you enjoy. It’s fine if you’re still figuring it out.' : 'Start your shelf with a bottle you own. Ratings are optional.', 'Community sightings help everyone see what’s showing up in stores.', 'Get push notifications when matching bottles are found in your selected areas.', 'Your state is already selected. Cover it all, or choose specific places.', 'Choose broad alerts or build a list of bottles you want.', 'Your phone will ask for permission after you tap Enable notifications.', 'Here’s what you’ve set up. You can change it later in Radar.'];
  const canSkip = draft.step === 2 || draft.step === 5 || draft.step === 6;
  const continueLabel = draft.step === 4 ? (paid ? 'Set up my alerts' : 'Continue without alerts →') : draft.step === 8 ? 'Open Bourbon Signal' : 'Continue';
  return <>
    <OnboardingFrame title={titles[draft.step]} description={descriptions[draft.step]} step={draft.step} transitionKey={`${draft.step}-${Boolean(discovery)}`} eyebrow={draft.step >= 5 && draft.step <= 7 ? `ALERT SETUP · ${draft.step - 4} OF 3` : draft.step === 8 ? 'WELCOME TO BOURBON SIGNAL' : `GETTING STARTED · ${draft.step + 1} OF 5`}
      footer={<>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}{storageError ? <Text accessibilityRole="alert" style={s.error}>{storageError}</Text> : null}
        {draft.step === 7 ? <><OnboardingButton label="Enable notifications" busy={working} onPress={() => void enableNotifications()} /><OnboardingButton secondary label="Maybe later" disabled={working} onPress={() => void run(async () => { const status = await api.getPushDeviceStatus(await radarPushDeviceId(), { fresh: true }).catch(() => null); setPushReady(Boolean(status?.enabled && status.currentDeviceRegistered && !status.warning)); await go(8); })} /></> : <OnboardingButton label={continueLabel} secondary={draft.step === 4 && !paid} busy={working} disabled={(draft.step === 0 && !draft.displayName.trim()) || (draft.step === 1 && !draft.homeState)} onPress={() => void next()} />}
        {canSkip ? <OnboardingButton secondary label={draft.step === 2 ? 'Do this later' : 'Set up alerts later'} disabled={working} onPress={() => void run(async () => { if (draft.step === 2) await go(3); else await finish(); })} /> : null}
        {draft.step > 0 ? <OnboardingButton secondary label="Back" disabled={working} onPress={() => void run(() => go(draft.step - 1))} /> : null}
      </>}>
      {draft.step === 0 ? <>
        <Text style={s.label}>Display name</Text><TextInput accessibilityLabel="Community display name" autoCapitalize="words" maxLength={32} value={draft.displayName} onChangeText={displayName => edit({ displayName })} placeholder="How members will know you" placeholderTextColor={colors.muted} style={s.input} editable={!working} />
        <Text style={[s.label, { marginTop: 10 }]}>Which sounds most like you?</Text>
        {INTEREST_OPTIONS.map(option => <Choice key={option.key} title={option.title} detail={option.detail} selected={draft.interest === option.key} onPress={() => edit({ interest: option.key })} disabled={working} />)}
        <Text style={s.small}>This helps us tailor your introduction. You can explore every part of the app.</Text>
      </> : null}
      {draft.step === 1 || draft.step === 5 ? <>
        <Text style={s.label}>Home state</Text><OnboardingButton label={stateName || 'Choose a state'} onPress={() => { setStateQuery(''); setStatePicker(true); }} disabled={working} />
        {coverageLoading ? <Text style={s.small}>Checking tracking coverage…</Text> : coverageError ? <><Text style={s.small}>{coverageError}</Text><OnboardingButton secondary label="Retry coverage check" onPress={() => setCoverageAttempt(value => value + 1)} /></> : coverage ? <View style={s.panel}>
          <Text style={s.label}>{usefulOnboardingCoverage(coverage) ? `Explore bottle activity in ${stateName}` : coverage.coverageStrength === 'strong' || coverage.coverageStrength === 'moderate' ? 'Tracking updates are limited right now.' : 'Tracking coverage is growing here.'}</Text>
          <Text style={s.copy}>{usefulOnboardingCoverage(coverage) ? 'See bottles tracked by Bourbon Signal alongside sightings shared by members.' : 'Help us improve coverage in your state by letting us know what areas to focus on.'}</Text>
          {usefulOnboardingCoverage(coverage) ? <Text style={s.small}>{coverage.customerSummary || coverage.summary}</Text> : <OnboardingButton secondary label="Request coverage →" onPress={() => setCoverageRequest(true)} />}
        </View> : draft.homeState ? <><Text style={s.small}>We don’t have a coverage summary for this state yet.</Text><OnboardingButton secondary label="Request coverage →" onPress={() => setCoverageRequest(true)} /></> : null}
        {draft.step === 1 ? <Text style={s.small}>Free Intel previews show recent signals across all states. A paid membership lets you choose a state.</Text> : null}
      </> : null}
      {draft.step === 2 && beginnerPath(draft.interest) ? <>
        {!discovery ? <>
        <Text style={s.label}>Tried a whiskey you liked?</Text><TextInput accessibilityLabel="Search for a whiskey you enjoyed" placeholder="Search a bottle, or leave this blank" placeholderTextColor={colors.muted} style={s.input} value={bottleQuery || draft.likedBottleName} onChangeText={value => { setBottleQuery(value); edit({ likedBottleId: '', likedBottleName: '' }); }} editable={!working} />
        {bottleQuery.trim() ? catalog.search(bottleQuery, 4).map(bottle => <Choice key={bottle.id} title={bottle.name} selected={draft.likedBottleId === bottle.id} onPress={() => { edit({ likedBottleId: bottle.id, likedBottleName: bottle.name }); setBottleQuery(''); }} />) : null}
        <OnboardingButton secondary label="Not yet / clear choice" onPress={() => { setBottleQuery(''); edit({ likedBottleId: '', likedBottleName: '' }); }} />
        <Text style={s.label}>What flavors sound appealing?</Text>{FLAVOR_OPTIONS.map(flavor => <Choice multiple key={flavor} title={flavor} selected={draft.flavors.includes(flavor)} onPress={() => edit({ flavors: draft.flavors.includes(flavor) ? draft.flavors.filter(value => value !== flavor) : [...draft.flavors, flavor] })} />)}
        <OnboardingButton secondary label="I’m not sure" onPress={() => edit({ flavors: [] })} />
        <OnboardingButton secondary label={tasteAdvanced ? 'Hide strength and budget' : 'Strength and budget (optional)'} onPress={() => setTasteAdvanced(value => !value)} />
        {tasteAdvanced ? <><Text style={s.label}>Preferred strength</Text><Text style={s.small}>Proof is twice the alcohol percentage. Choose No preference if you’re unsure.</Text>{PROOF_OPTIONS.map(option => <Choice key={option.key} title={option.title} detail={option.detail} selected={draft.proof === option.key} onPress={() => edit({ proof: option.key })} />)}
        <Text style={s.label}>Bottle budget</Text>{BUDGET_OPTIONS.map(budget => <Choice key={budget} title={budget} selected={draft.budget === budget} onPress={() => edit({ budget })} />)}<Text style={s.small}>Budget uses known MSRP. Local prices and availability vary.</Text>
        </> : null}
        <OnboardingButton label="Show my starting suggestions" busy={discovering || working} onPress={() => void showSuggestions()} />
        </> : <OnboardingButton secondary label="Change my answers" disabled={working} onPress={() => setDiscovery(null)} />}
        {discovery ? <>
          <Text accessibilityRole="header" style={s.label}>A few bottles to explore</Text><Text style={s.small}>These are starting suggestions, not a complete taste profile. Your ratings can shape Bourbon DNA with Barrel Proof.</Text>
          {!discovery.suggestions.length ? <Text style={s.copy}>No starting bottles match those options with the price and proof information we have. Try No preference.</Text> : discovery.suggestions.map(bottle => <View key={bottle.id} style={s.panel}><View style={s.row}><CellarBottleArtwork bottle={{ bottleId: bottle.id, bottleName: bottle.name }} size="list" /><View style={{ flex: 1, gap: 6 }}><Text style={s.label}>{bottle.name}</Text><Text style={s.small}>{bottle.reason}</Text>{bottle.proof ? <Text style={s.small}>{bottle.proof} proof · {bottle.proof / 2}% ABV</Text> : null}{bottle.msrp ? <Text style={s.small}>MSRP ${bottle.msrp.toFixed(2)}</Text> : null}</View></View></View>)}
          <Text style={s.label}>Recent signals in {stateName}</Text>
          {discovery.signalsUnavailable ? <Text style={s.small}>Recent signals could not load. Your bottle suggestions are still available.</Text> : !discovery.signals.length ? <Text style={s.small}>No recent matching signals were found. That doesn’t mean these bottles are unavailable in stores.</Text> : discovery.signals.map(signal => <View key={signal.id} style={s.panel}><Text style={s.label}>{signal.bottle.name}</Text><Text style={s.copy}>{signal.location.store?.name || signal.location.label || signal.location.state}</Text><Text style={s.small}>Reported {new Date(signal.timing.displayAt).toLocaleString()}{signal.availability?.price !== undefined ? ` · $${signal.availability.price.toFixed(2)}` : ''}</Text><Text style={s.small}>Availability can change. Check before making a trip.</Text></View>)}
        </> : null}
      </> : null}
      {draft.step === 2 && !beginnerPath(draft.interest) ? <>
        {owned.length ? <View style={s.panel}><Text style={s.label}>Your shelf is taking shape.</Text><ScrollView horizontal contentContainerStyle={{ gap: 18 }} showsHorizontalScrollIndicator={false}>{owned.slice(0, 6).map(bottle => <View key={bottle.bottleId} style={{ width: 92, gap: 8, alignItems: 'center' }}><CellarBottleArtwork bottle={bottle} size="grid" /><Text style={[s.small, { textAlign: 'center' }]}>{bottle.bottleName}</Text></View>)}</ScrollView></View> : <View style={s.panel}><CellarBottleArtwork bottle={{ bottleName: '' }} size="grid" /><Text style={s.copy}>One bottle is enough to start. You can add more whenever you like.</Text></View>}
        <OnboardingButton label={owned.length ? 'Add another bottle' : 'Add your first bottle'} disabled={working || !preferences.collectionAccess.canAdd} onPress={() => void run(async () => { await persist(draft); router.push('/(app)/cellar/add'); })} />
        {!preferences.collectionAccess.canAdd ? <Text style={s.small}>Your current shelf allowance is full. You can continue setup.</Text> : null}<Text style={s.small}>Add bottles you own here. You’ll choose bottles to watch separately during alert setup.</Text>
      </> : null}
      {draft.step === 3 ? <>
        <View style={s.panel}><Text style={s.eyebrow}>COMMUNITY SIGHTINGS</Text><Text style={s.label}>Bottle · Store · Price · Time</Text><Text style={s.copy}>A sighting tells other members what you found and where. A photo adds useful detail.</Text></View>
        <Text style={s.label}>Share a find. Earn Signal Points.</Text><Text style={s.copy}>Earn points for eligible sightings and other contributions. Free members can collect points; paid members can redeem them for rewards.</Text>
        <View style={[s.panel, s.row]}><Image accessible={false} source={require('../../assets/rewards/glencairn.png')} style={{ width: 70, height: 78 }} resizeMode="contain" /><View style={{ flex: 1, gap: 6 }}><Text style={s.label}>Glasses, stickers, and more</Text><Text style={s.small}>See the current rewards and point requirements in Account → Rewards & Badges.</Text></View></View>
        <Text style={s.small}>You don’t need to post now. When you do, share accurate details and check when a sighting was reported before making a trip.</Text>
      </> : null}
      {draft.step === 4 ? <>
        {paid ? <View style={s.panel}><Text style={s.label}>{profile.membership.label} is active.</Text><Text style={s.copy}>Your membership includes bottle alerts. Let’s choose where and what to watch.</Text></View> : <>
          {(['standard', 'barrel'] as const).map(tier => {
            const id = productIdFor(tier, 'monthly'); const product = purchases.products.find(item => item.productId === id);
            const eligible = Boolean(id && product && purchases.eligibleProductIds.includes(id));
            return <View key={tier} style={[s.panel, tier === 'barrel' && { borderColor: colors.accent }]}><Text style={s.eyebrow}>{tier === 'standard' ? 'STANDARD' : 'BARREL PROOF'}</Text><Text style={s.label}>{product ? `${product.localizedPrice} / ${product.localizedPeriod}` : 'Monthly membership'}</Text><Text style={s.copy}>{tier === 'standard' ? 'Push alerts for 5 areas and 15 bottles. Full Intel feed, unlimited shelf bottles, and reward redemption.' : 'Everything in Standard, plus unlimited areas and watched bottles, advanced feed filters, Community push alerts, and Bourbon DNA.'}</Text><Text style={s.small}>Billed monthly. Automatically renews until canceled. Cancel anytime through your app store.</Text><OnboardingButton label={eligible && purchases.status === 'ready' ? `Choose ${tier === 'standard' ? 'Standard' : 'Barrel Proof'}` : 'Check purchase options'} busy={working} disabled={purchases.status === 'unsupported'} onPress={() => void purchase(tier)} /></View>;
          })}
          {purchases.message && purchases.status !== 'ready' ? <Text accessibilityRole="alert" style={s.small}>{purchases.message}</Text> : null}
          <OnboardingButton secondary label="Restore purchases" disabled={working || !purchases.restoreAvailable} onPress={() => void run(async () => { await persist(draft); await purchases.restore(); const latest = await refreshMember(); if (latest.member.membership.paid) await go(5); })} />
          <View style={s.row}><OnboardingButton secondary label="Terms" onPress={() => router.push('/(app)/account/terms')} /><OnboardingButton secondary label="Privacy" onPress={() => router.push('/(app)/account/privacy')} /></View>
        </>}
      </> : null}
      {draft.step === 5 ? <>
        <Choice title="Whole state" detail="Watch matching reports across your state" selected={!localAreas} onPress={() => setLocalAreas(false)} disabled={working} /><Choice title="Specific areas or stores" detail="Choose the places where you shop" selected={localAreas} onPress={() => setLocalAreas(true)} disabled={working} />
        {localAreas ? <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{(['city', 'county', ...(draft.homeState === 'NC' ? ['board'] : []), 'store'] as MonitoringScopeType[]).map(level => <OnboardingButton secondary key={level} label={level === 'board' ? 'ABC boards' : `${level[0].toUpperCase()}${level.slice(1)}s`} onPress={() => changeAreaSearch({ level })} disabled={working || level === areaLevel} />)}</View>
          <Text style={s.label}>Search {areaLevel === 'board' ? 'ABC boards' : `${areaLevel}s`}</Text><TextInput accessibilityLabel="Search alert areas or stores" value={areaQuery} onChangeText={query => changeAreaSearch({ query })} placeholder="Search by name" placeholderTextColor={colors.muted} style={s.input} editable={!working} />
          <Text style={s.small}>{selectedScopes.length} selected{typeof areaLimit === 'number' ? ` · ${areaLimit} areas included` : ''}</Text>
          {selectedScopes.map(scope => <OnboardingButton key={scope.id} secondary label={`Remove ${scope.label} (${scope.state})`} disabled={working} onPress={() => setSelectedScopes(scopes => scopes.filter(row => row.id !== scope.id))} />)}
          {areas.map(row => { const selected = selectedScopes.some(scope => scope.id === row.id); return <Choice multiple key={row.id} title={row.displayName || row.name} detail={[row.subtitle, row.address, row.coverage.engine.status === 'expanding' ? 'Tracking coverage is growing here' : row.message].filter(Boolean).join(' · ')} selected={selected} disabled={working || (!selected && typeof areaLimit === 'number' && selectedScopes.length >= areaLimit)} onPress={() => toggleScope(row)} />; })}
          {areaLoading ? <ActivityIndicator color={colors.accent} /> : areaError ? <><Text style={s.error}>{areaError}</Text><OnboardingButton secondary label="Retry area search" onPress={() => setAreaAttempt(value => value + 1)} /></> : !areas.length ? <Text style={s.small}>No matching {areaLevel}s are available to select. Try another name or choose the whole state.</Text> : null}
          {areaHasMore && !areaLoading ? <OnboardingButton secondary label="More areas" onPress={() => setAreaOffset(areas.length)} /> : null}
          <Text style={s.small}>Store choices appear only where the directory supports them. A listed store doesn’t guarantee tracked inventory.</Text>
        </> : null}
      </> : null}
      {draft.step === 6 ? <>
        <Choice title="Anything notable in my areas" detail="Limited, allocated, and unicorn bottle reports" selected={mode === 'anything_notable'} onPress={() => setMode('anything_notable')} disabled={working} /><Choice title="Only specific bottles" detail="Alerts for the bottles you choose below" selected={mode === 'specific_bottles'} onPress={() => setMode('specific_bottles')} disabled={working} />
        {mode === 'specific_bottles' ? <>
          <TextInput accessibilityLabel="Search bottles to watch" value={bottleQuery} onChangeText={setBottleQuery} placeholder="Search bottles" placeholderTextColor={colors.muted} style={s.input} editable={!working} />
          <Text style={s.small}>{watchedBottleCount(preferences)} watched{typeof bottleLimit === 'number' ? ` · ${bottleLimit} included` : ''}</Text>
          {(bottleQuery.trim() ? catalog.search(bottleQuery, 8) : catalog.catalog.filter(row => watched.has(canonicalBottleKey(row.name)))).map(bottle => <Choice multiple key={bottle.id} title={bottle.name} selected={watched.has(canonicalBottleKey(bottle.name))} disabled={working || (!watched.has(canonicalBottleKey(bottle.name)) && typeof bottleLimit === 'number' && watchedBottleCount(preferences) >= bottleLimit)} onPress={() => void watchBottle(bottle.name, !watched.has(canonicalBottleKey(bottle.name)))} />)}
          {bottleQuery && !catalog.search(bottleQuery, 8).length ? <Text style={s.small}>No bottles match. Try another name.</Text> : null}
          {catalog.error ? <><Text style={s.small}>{catalog.error}</Text><OnboardingButton secondary label="Refresh bottle catalog" onPress={catalog.retry} /></> : null}
        </> : null}
      </> : null}
      {draft.step === 7 ? <>
        <View style={s.panel}><Text style={s.label}>Bottle alerts</Text><Text style={s.copy}>{mode === 'anything_notable' ? 'Matching notable bottles' : 'Your watched bottles'} in your saved alert areas.</Text></View>
        {communityIncluded ? <View style={[s.panel, s.row]}><View style={{ flex: 1, gap: 8 }}><Text style={s.label}>Community sighting alerts</Text><Text style={s.small}>Include matching finds shared by members. Included with Barrel Proof.</Text></View><Switch accessibilityLabel="Community sighting alerts" value={community} disabled={working} onValueChange={setCommunity} trackColor={{ true: colors.accent, false: colors.border }} /></View> : <Text style={s.small}>Community sighting alerts are included with Barrel Proof. Standard includes tracked bottle alerts.</Text>}
        {permissionDenied ? <><Text style={s.error}>Notifications are off in your phone settings. You can allow them now or set up alerts later in Radar.</Text><OnboardingButton secondary label="Open phone settings" onPress={() => void Linking.openSettings().catch(() => setError('Open your phone Settings to allow notifications.'))} /></> : null}
      </> : null}
      {draft.step === 8 ? <>
        <View style={s.panel}><Text style={s.label}>Your alert areas</Text><Text style={s.copy}>{preferences.monitoringScopes.map(scope => `${scope.label} (${scope.state})`).join(', ') || 'Set up later in Radar'}</Text><Text style={s.label}>Your bottle alerts</Text><Text style={s.copy}>{preferences.alertMode === 'anything_notable' ? 'Anything notable in your selected areas' : preferences.bottleAlertPreferences.bottleNames.join(', ') || 'No watched bottles yet'}</Text><Text style={s.label}>Notifications</Text><Text style={pushReady ? s.success : s.small}>{pushReady ? 'Enabled on this phone' : 'Set up later in Radar'}</Text>{communityIncluded ? <Text style={s.small}>Community alerts: {preferences.notificationPreferences.sightings.enabled ? 'On' : 'Off'}</Text> : null}</View>
      </> : null}
    </OnboardingFrame>
    <Modal visible={statePicker} animationType="fade" onRequestClose={() => setStatePicker(false)}><OnboardingFrame title="Choose your state." eyebrow="HOME STATE" footer={<OnboardingButton secondary label="Close" onPress={() => setStatePicker(false)} />}><TextInput accessibilityLabel="Search states" value={stateQuery} onChangeText={setStateQuery} style={s.input} placeholder="Search states" placeholderTextColor={colors.muted} />{COVERAGE_STATES.filter(state => `${state.name} ${state.code}`.toLowerCase().includes(stateQuery.toLowerCase())).map(state => <Choice key={state.code} title={state.name} selected={draft.homeState === state.code} onPress={() => { edit({ homeState: state.code }); setAreaOffset(0); setAreas([]); setAreaQuery(''); setStatePicker(false); }} />)}</OnboardingFrame></Modal>
    {coverageRequest ? <CoverageRequestSheet key={draft.homeState} state={draft.homeState} visible onClose={() => setCoverageRequest(false)} /> : null}
  </>;
}

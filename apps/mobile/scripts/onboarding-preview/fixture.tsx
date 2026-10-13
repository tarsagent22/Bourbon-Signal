import { useEffect } from 'react';
import { View } from 'react-native';
import { preferencesFixture, profileFixture } from '../../src/api/astra-fixtures';
import { EMPTY_ONBOARDING } from '../../../../shared/mobile-onboarding';
const query = new URLSearchParams(location.search);
let tier = query.get('tier') || 'free';
let draft = { ...EMPTY_ONBOARDING, step: Number(query.get('step') || 0), displayName: Number(query.get('step')) > 0 ? 'Oak Street' : '', homeState: 'NC', interest: query.get('interest') || 'starting' };
let completed = false;
let prefs = preferencesFixture({ alertMode: 'anything_notable', monitoringScopes: [], entitlements: { alertAreaLimit: tier === 'standard' ? 5 : null, trackedBottleLimit: tier === 'standard' ? 15 : null }, collectionAccess: { canRead: true, canEditExisting: true, canAdd: true, limit: 10, remaining: 10, showCapacityNotice: false } });
const bottles = [{ id: 'makers-mark', name: "Maker's Mark", proof: 90 }, { id: 'woodford-double-oaked', name: 'Woodford Reserve Double Oaked', proof: 90.4 }, { id: 'stagg', name: 'Stagg', rarity: 'unicorn' }];
function profile() { return profileFixture({ homeState: draft.homeState, membership: { tier: tier as any, label: tier === 'barrel' ? 'Barrel Proof' : tier === 'standard' ? 'Standard' : 'Free', paid: tier !== 'free', hasBetaAccess: false } }); }
export const api = {
  async getMemberProfile() { return profile(); }, async getMemberPreferences() { return structuredClone(prefs); },
  async getCoverageSummary() { return { states: [{ code: 'NC', coverageStrength: query.get('coverage') === 'weak' ? 'sparse' : 'strong', coverageStatus: 'available', health: 'current', summary: 'Tracking covers selected ABC boards and stores, with coverage varying by area.' }, { code: 'AK', coverageStrength: 'none', coverageStatus: 'not-available', health: 'no-recent-update', summary: 'Tracking coverage is growing here.' }] }; },
  async getMobileOnboardingStatus() { return { completed, draft: structuredClone(draft) }; },
  async saveOnboardingDraft(next: any) { draft = structuredClone(next); return { completed: false, draft }; },
  async completeMobileOnboarding(body: any) { draft = body.draft; completed = body.action === 'complete'; return { completed }; },
  async listBottleCatalog() { return bottles; },
  async updateMemberPreferences(patch: any) {
    if (patch.monitoringScopes) prefs.monitoringScopes = patch.monitoringScopes;
    if (patch.alertMode) prefs.alertMode = patch.alertMode;
    if (patch.watchlistMutation) { const m = patch.watchlistMutation; prefs.bottleAlertPreferences.bottleNames = prefs.bottleAlertPreferences.bottleNames.filter(name => name !== m.bottleName); if (m.watched) prefs.bottleAlertPreferences.bottleNames.push(m.bottleName); }
    if (patch.notificationPreferences) for (const [key, value] of Object.entries(patch.notificationPreferences)) (prefs.notificationPreferences as any)[key] = Array.isArray(value) ? value : { ...(prefs.notificationPreferences as any)[key], ...(value as object) };
    if (patch.collectionPreferences) prefs.collectionPreferences = patch.collectionPreferences;
    return structuredClone(prefs);
  },
  async searchMonitoringGeography(input: any) {
    const expanding = query.get('coverage') === 'weak' || input.state === 'AK';
    const row = { state: input.state || 'NC', coverage: { engine: { status: expanding ? 'expanding' : 'active' }, community: { active: false, recentSightings: 0, windowDays: 30 } }, message: null };
    return { results: input.levels[0] === 'state' ? [{ ...row, id: `state:${input.state}`, name: 'North Carolina', level: 'state' }] : [{ ...row, id: `${input.levels[0]}:raleigh`, name: 'Raleigh', level: input.levels[0] }, { ...row, id: `${input.levels[0]}:durham`, name: 'Durham', level: input.levels[0] }], states: [], hasMore: false };
  },
  async getOnboardingDiscovery() { return { suggestions: bottles.slice(0, 2).map(bottle => ({ ...bottle, reason: 'A starting suggestion for sweet and caramel flavors.', msrp: 35 })), signals: [], signalsUnavailable: false }; },
  async submitCoverageRequest(body: any) { (window as any).coverageSubmitted = body; return { request: { id: 'preview-request' } }; },
  async getPushDeviceStatus() { return { enabled: false, currentDeviceRegistered: false }; },
};
export function useMobileApi() { return api; }
export function useAuth() { return { isLoaded: true, isSignedIn: !['welcome', 'sign-in', 'sign-up'].includes(query.get('screen') || ''), userId: 'preview-user' }; }
const signUp = { status: 'complete', async password() { return {}; }, verifications: { async sendEmailCode() { return {}; }, async verifyEmailCode() { return {}; } }, async finalize() { location.href = '?screen=onboarding'; return {}; }, async reset() {} };
export function useSignUp() { return { signUp, fetchStatus: 'idle' }; }
const signIn = { status: 'complete', supportedSecondFactors: [], async password() { return {}; }, async finalize() { return {}; }, async reset() {}, mfa: {}, resetPasswordEmailCode: {} };
export function useSignIn() { return { signIn, fetchStatus: 'idle' }; }
export function useAccessibleStatus() {}
export function useFocusEffect(callback: () => unknown) { useEffect(() => { const clean = callback(); const refocus = () => { callback(); }; window.addEventListener('preview-shelf', refocus); return () => { window.removeEventListener('preview-shelf', refocus); if (typeof clean === 'function') clean(); }; }, [callback]); }
export function useRouter() { return router; }
export function Redirect() { return null; }
const router = { push(route: any) { if (String(route).includes('cellar/add')) { prefs.collectionPreferences.bottles.push({ bottleId: 'makers-mark', bottleName: "Maker's Mark", tastedOnly: false } as any); window.dispatchEvent(new Event('preview-shelf')); } else navigate(route); }, replace: navigate };
function navigate(route: any) { const value = typeof route === 'string' ? route : route.pathname; if (value.includes('sign-in')) location.href = '?screen=sign-in'; else if (value.includes('sign-up')) location.href = '?screen=sign-up'; else { (window as any).completedRoute = value; window.dispatchEvent(new Event('preview-finished')); } }
export function useSafeAreaInsets() { return { top: 10, bottom: 10, left: 0, right: 0 }; }
export const SafeAreaView = View;
const storage = new Map<string, string>();
export async function getItemAsync(key: string) { return storage.get(key) || null; }
export async function setItemAsync(key: string, value: string) { storage.set(key, value); }
export async function deleteItemAsync(key: string) { storage.delete(key); }
const purchaseState: any = { status: 'ready', message: '', products: ['standard', 'barrel'].map(value => ({ tier: value, productId: `com.bourbonsignal.app.${value}.monthly`, localizedPrice: value === 'standard' ? '$2.99' : '$5.99', localizedPeriod: 'month' })), eligibleProductIds: ['com.bourbonsignal.app.standard.monthly', 'com.bourbonsignal.app.barrel.monthly'], restoreAvailable: true, profile: null,
  async refresh() {}, async restore() {}, async purchase(id: string) { if (query.get('purchase') === 'cancelled' || query.get('purchase') === 'pending') { purchaseState.status = query.get('purchase'); purchaseState.message = query.get('purchase') === 'cancelled' ? 'Purchase canceled. You haven’t been charged.' : 'Your app store is processing the purchase.'; return; } tier = id.includes('barrel') ? 'barrel' : 'standard'; purchaseState.profile = profile().profile; },
};
if (query.get('purchase') === 'loading') purchaseState.status = 'configuring';
export function usePurchases() { return purchaseState; }
export async function radarPushDeviceId() { return 'preview'; }
export async function radarPushPermission() { return query.get('push') === 'denied' ? 'denied' : 'granted'; }
export async function enableRadarPush() { if (query.get('push') === 'denied') throw new Error('Notifications are off in your phone settings.'); return { enabled: true, currentDeviceRegistered: true }; }

import { useEffect } from 'react';
const query = new URLSearchParams(location.search);
const bottle = { id: 'eagle-rare-10', name: 'Eagle Rare 10 Year', producer: 'Buffalo Trace Distillery', category: 'bourbon', proof: 90, age: '10 years', msrp: 40, rarity: { label: 'Allocated', tier: 'allocated', pending: false, reviewedAt: '2026-10-05' } };
const owned = query.get('owned') === '1';
const prefs: any = { collectionAccess: { canRead: true, canAdd: true }, bottleAlertPreferences: { bottleNames: [], bottleKeys: [] }, collectionPreferences: { version: 1, bottles: owned ? [{ bottleId: bottle.id, bottleName: bottle.name, canonicalKey: 'eagle rare 10 year', rating: 87, isRated: true, sealedQuantity: 2, openedQuantity: 1 }] : [] } };
const report: any = { id: 'fixture-report', kind: 'availability', historical: true, source: { type: 'trusted_source', label: 'Trusted source' }, bottle: { id: bottle.id, name: bottle.name }, location: { scope: 'exact_store', state: 'FL', store: { name: "Big Daddy’s Wine & Liquors", address: '9494 Harding Ave', city: 'Surfside', state: 'FL', zip: '33154' } }, timing: { displayAt: '2026-10-16T04:51:04Z', lastCheckedAt: '2026-10-16T13:32:33Z', firstSpottedAt: '2026-10-16T04:51:04Z' }, availability: { status: 'unknown', price: 47.97, quantity: 22, caveat: 'Last-known source evidence only; current availability is stale and not alertable.' }, evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true }, alertEligibility: { inventory: false, watch: false }, actions: ['watch_bottle'] };
const api = { accountIdentity: 'fixture', async getBottleProfile() { return { bottle }; }, async getMemberPreferences() { return structuredClone(prefs); }, async listSignals() { return { signals: [report] }; }, async listBottleCatalog() { return [{ ...bottle, aliases: [] }, { id: 'heaven-hill-bottled-in-bond', name: 'Heaven Hill Bottled-in-Bond', proof: 100, ageStatement: '7 years' }]; }, async updateMemberPreferences(body: any) { (window as any).previewMutation = body; prefs.bottleAlertPreferences.bottleNames = ['Eagle Rare 10 Year']; return structuredClone(prefs); }, async getSignal() { return { signal: report }; }, async getHuntOutcome() { return { outcome: null }; } };
export function useMobileApi() { return api; }
export function useScreenRevalidation() {}
export function useLocalSearchParams() { return { id: query.get('screen') === 'report' ? report.id : bottle.id }; }
function navigate(route: any) { (window as any).lastRoute = route; }
export const router = { push: navigate, setParams() {} };
export function useRouter() { return router; }
export function useFocusEffect(callback: () => (() => void) | void) { useEffect(callback, [callback]); }
export const Stack = { Screen() { return null; } };
export async function getItemAsync() { return null; }
export async function setItemAsync() {}

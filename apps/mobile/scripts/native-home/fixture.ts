// Diagnostic-only synthetic identity and API. Never imported by the application entry.
import type { MemberProfile, Signal, SignalFeedPage } from '../../src/api/types';

export function useAuth() { return { userId: 'native_smoke_fixture' }; }
const profile: MemberProfile = {
  contractVersion: 'bourbon-signal/mobile-api@1',
  profile: {
    identity: { kind: 'member', number: 1, label: 'Member #1' },
    displayName: 'Native fixture', customDisplayName: null,
    feedAreas: { states: [{ code: 'NC', label: 'North Carolina', areaLabel: 'Board', options: [{ value: 'Wake County', label: 'Wake County' }] }] },
    membership: { tier: 'standard', label: 'Standard', paid: true, hasBetaAccess: true },
    entitlements: { fullFeed: true, canSubmitSignals: true },
  },
};
function signal(id: string, name: string, minutes: number): Signal {
  return {
    contractVersion: 'bourbon-signal/signal@1', id, kind: 'availability',
    source: { type: 'trusted_source', label: 'Synthetic native test fixture' },
    bottle: { name, rarity: 'allocated' },
    location: { scope: 'exact_store', state: 'NC', store: { name: 'Fixture Store / Raleigh / NC / 100 Test Street', address: '100 Test Street', city: 'Raleigh', state: 'NC' } },
    timing: { displayAt: new Date(Date.now() - minutes * 60_000).toISOString() },
    evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true },
    strength: 'best', availability: { status: 'available_now', quantity: 2, price: 49.99 },
    alertEligibility: { inventory: false, watch: false }, actions: [],
  };
}
const rows = [signal('fixture-a', '1792 Sweet Wheat', 12), signal('fixture-b', 'Eagle Rare 10 Year', 25)];
const api = {
  async getMemberProfile() { return profile; },
  async getSignalAreaOptions() { return [{ value: 'Wake County', label: 'Wake County' }]; },
  async listSignals(): Promise<SignalFeedPage> {
    return { contractVersion: 'bourbon-signal/signal@1', view: 'market', signals: rows, marketSummaries: [], total: rows.length, nextCursor: null, hasMore: false, degraded: false,
      access: { previewLocked: false, requiresAccountForFullFeed: false, memberSignalsAvailable: true, marketDetailsLocked: false } };
  },
};
export function useMobileApi() { return api; }

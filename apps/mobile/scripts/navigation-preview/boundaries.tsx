export * from '../continuity-preview/fixture';
import { useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useMobileApi as useFixtureApi } from '../continuity-preview/fixture';
import seed from '../../src/cellar/bottle-catalog-seed.json';
const query = new URLSearchParams(location.search);
const extra = { id: 'fixture-unreviewed', name: 'Unreviewed Fixture Bourbon', proof: 100 };
export function useMobileApi() {
  const base = useFixtureApi();
  return useMemo(() => ({ ...base,
    listBottleCatalog: async () => [...seed, extra],
    async getBottleProfile(id: string, options?: { state?: string }) {
      (window as any).assessmentRequests = ((window as any).assessmentRequests || 0) + 1;
      const row = [...seed, extra].find(item => item.id === id)!;
      if (query.get('slowProfile') === '1') await new Promise(resolve => setTimeout(resolve, 300));
      const rarity = id === 'eagle-rare-10' ? { label: 'Allocated', tier: 'allocated', pending: false, reviewedAt: '2026-10-16' } : { label: 'Under review', tier: '', pending: true, reviewedAt: null };
      return { bottle: { id, name: row.name, producer: 'Synthetic preview', category: 'bourbon', proof: row.proof || null, age: 'ageStatement' in row ? row.ageStatement : null,
        msrp: id === 'blantons-gold-bourbon' ? 149.95 : id === 'buffalo-trace-bourbon' ? 33.95 : 40, rarity,
        marketRarity: options?.state === 'AL' && id === 'eagle-rare-10' ? { state: 'AL', tier: 'unicorn', label: 'Unicorn', reason: 'Synthetic state fixture', reviewedAt: '2026-10-16', sources: [] } : null } };
    },
    listSignals: async () => ({ signals: [], degraded: false, access: { marketDetailsLocked: false, previewLocked: false } }),
  }), [base]);
}
export function NativeBottleScanner({ active, onMatches }: any) {
  const [session] = useState(() => (window as any).scannerMounts = ((window as any).scannerMounts || 0) + 1);
  return <Pressable accessibilityRole="button" accessibilityLabel="Simulate label match" disabled={!active} onPress={() => onMatches([seed.find(row => row.id === 'makers-mark')])}><Text>Scanner session {session}</Text></Pressable>;
}
export const PushMaintenance = () => null;
export function useMobileActivity() {}

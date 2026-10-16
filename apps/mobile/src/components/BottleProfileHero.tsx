import { StyleSheet, Text, View } from 'react-native';
import { CellarBottleArtwork } from './CellarBottleArtwork';
import { colors, fonts } from '../theme';
import type { BottleProfile } from '../../../../shared/bottle-profile';
import type { bottleProfileState } from '../signals/bottle-profile';

export function BottleProfileHero({ identity, details, personal }: {
  identity: { id?: string; name: string }; details?: BottleProfile | null;
  personal?: ReturnType<typeof bottleProfileState> | null;
}) {
  const facts = [details?.category, details?.proof ? `${details.proof} proof` : '', details?.age?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean);
  return <View accessibilityLabel="Bottle Profile" style={s.hero}>
    <View style={s.artStage}><View pointerEvents="none" style={s.glow} /><CellarBottleArtwork bottle={{ bottleId: identity.id, bottleName: identity.name }} size="detail" /></View>
    {details?.producer ? <Text style={s.producer}>{details.producer}</Text> : null}
    <Text accessibilityRole="header" style={s.name}>{identity.name}</Text>
    {facts.length ? <Text style={s.facts}>{facts.join(' · ')}</Text> : null}
    {details ? <View style={s.rarity}><View style={[s.dot, details.rarity.pending && { backgroundColor: colors.muted }]} /><Text style={s.rarityText}>{details.rarity.pending ? 'Rarity under review' : details.rarity.label}</Text><Text style={s.national}>National classification</Text></View> : null}
    <View style={s.personal}>
      <Metric label="Your rating" value={personal?.ratingLabel || '—'} />
      <Metric label="My Shelf" value={personal ? personal.inCellar ? personal.inventoryLabel === 'No bottles owned' ? personal.cellarLabel : personal.inventoryLabel : 'Not added' : '—'} />
      <Metric label="Radar" value={personal?.radarLabel || '—'} />
    </View>
  </View>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>; }
const s = StyleSheet.create({
  hero: { gap: 10 }, artStage: { alignItems: 'center', justifyContent: 'center', minHeight: 300, overflow: 'hidden' },
  glow: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(214,154,74,0.055)', borderWidth: 1, borderColor: 'rgba(214,154,74,0.08)' },
  producer: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase', textAlign: 'center' },
  name: { color: colors.text, fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  facts: { color: colors.muted, fontSize: 14, textAlign: 'center', textTransform: 'capitalize' },
  rarity: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }, rarityText: { color: colors.accent, fontSize: 13, fontWeight: '700' }, national: { color: colors.muted, fontSize: 11 },
  personal: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 18, marginTop: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  metric: { flex: 1, minWidth: 80, gap: 6 }, metricLabel: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }, metricValue: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
});

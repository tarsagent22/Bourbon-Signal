import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CellarBottleArtwork } from './CellarBottleArtwork';
import { colors, fonts } from '../theme';
import type { BottleProfile } from '../../../../shared/bottle-profile';
import type { bottleProfileState } from '../signals/bottle-profile';

export function BottleProfileHero({ identity, details, personal, onShelf, onWatch }: {
  identity: { id?: string; name: string }; details?: BottleProfile | null;
  personal?: ReturnType<typeof bottleProfileState> | null;
  onShelf?: () => void; onWatch?: () => void;
}) {
  const facts = [details?.category, details?.proof ? `${details.proof} proof` : '', details?.age?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean);
  return <View accessibilityLabel="Bottle Profile" style={s.hero}>
    <View style={s.artStage}><View pointerEvents="none" style={s.glow} /><View style={s.artwork}><CellarBottleArtwork bottle={{ bottleId: identity.id, bottleName: identity.name }} size="detail" /></View></View>
    {details?.producer ? <Text style={s.producer}>{details.producer}</Text> : null}
    <Text accessibilityRole="header" style={s.name}>{identity.name}</Text>
    {facts.length ? <Text style={s.facts}>{facts.join(' · ')}</Text> : null}
    {details ? <View style={s.rarity}><View style={[s.dot, details.rarity.pending && { backgroundColor: colors.muted }]} /><Text style={s.rarityText}>{details.rarity.pending ? 'Rarity under review' : details.rarity.label}</Text><Text style={s.national}>National classification</Text></View> : null}
    <View style={s.personal}>
      <Metric label="Your rating" value={personal?.ratingLabel === 'Unrated' && onShelf ? 'Rate bottle' : personal?.ratingLabel || '—'} onPress={onShelf} />
      <Metric label="My Shelf" value={personal ? personal.inCellar ? personal.inventoryLabel === 'No bottles owned' ? personal.cellarLabel : personal.inventoryLabel : onShelf ? 'Add to Shelf' : 'Not added' : '—'} onPress={onShelf} />
      <Metric label="Radar" value={onWatch && !personal?.isWatched ? 'Watch bottle' : personal?.radarLabel || '—'} onPress={onWatch} />
    </View>
  </View>;
}
function Metric({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = <><Text style={s.metricLabel}>{label}</Text><Text style={[s.metricValue, onPress && { color: colors.accent }]}>{value}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={s.metric}>{content}</Pressable> : <View style={s.metric}>{content}</View>;
}
const s = StyleSheet.create({
  hero: { gap: 8 }, artStage: { alignItems: 'center', justifyContent: 'center', height: 232 },
  artwork: { position: 'absolute', width: 200, alignItems: 'center', transform: [{ scale: 0.7 }] },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(214,154,74,0.055)', borderWidth: 1, borderColor: 'rgba(214,154,74,0.08)' },
  producer: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase', textAlign: 'center' },
  name: { color: colors.text, fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, textAlign: 'center' },
  facts: { color: colors.muted, fontSize: 14, textAlign: 'center', textTransform: 'capitalize' },
  rarity: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }, rarityText: { color: colors.accent, fontSize: 13, fontWeight: '700' }, national: { color: colors.muted, fontSize: 11 },
  personal: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 10, marginTop: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  metric: { flex: 1, minWidth: 80, minHeight: 44, gap: 6 }, metricLabel: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }, metricValue: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
});

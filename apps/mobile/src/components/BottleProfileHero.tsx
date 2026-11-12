import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CellarBottleArtwork } from './CellarBottleArtwork';
import { buyingScore } from '../scanner/buying-score';
import { colors, fonts } from '../theme';
import type { BottleProfile } from '../../../../shared/bottle-profile';
import type { bottleProfileState } from '../signals/bottle-profile';

export function BottleProfileHero({ identity, details, tier }: {
  identity: { id?: string; name: string }; details?: BottleProfile | null; tier?: string;
}) {
  const assessment = details ? buyingScore({ bottle: details, askingPrice: '', reports: [], scope: { state: '', area: '' } }) : null;
  const score = assessment?.score ?? (assessment?.scoreRange ? assessment.scoreRange.low + '–' + assessment.scoreRange.high : null);
  const facts = [details?.category, details?.proof ? `${details.proof} proof` : '', details?.age?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean);
  const rarity = details && !details.rarity.pending ? details.rarity.label : tier;
  const rarityLabel = rarity?.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  return <View accessibilityLabel="Bottle Profile" style={s.hero}>
    <View style={s.identity}>
      <CellarBottleArtwork bottle={{ bottleId: identity.id, bottleName: identity.name }} size="feed" hidePlaceholderLabel />
      <View style={s.identityCopy}>
        <Text accessibilityRole="header" style={s.name}>{identity.name}</Text>
        {rarityLabel ? <View style={s.tierBadge}><Text style={s.rarityText}>{rarityLabel}</Text></View> : null}
        {score != null ? <Text style={s.score}>Signal Score · {score} / 100</Text> : details ? <Text style={s.facts}>Signal Score unavailable</Text> : null}
        {details?.msrp != null ? <Text style={s.facts}>Reference price · ${details.msrp.toFixed(2)} MSRP</Text> : null}
        {facts.length ? <Text style={s.facts}>{facts.join(' · ')}</Text> : null}
      </View>
    </View>
  </View>;
}

export function BottleProfileRating({ personal, onRate }: {
  personal?: ReturnType<typeof bottleProfileState> | null; onRate?: () => void;
}) {
  if (!personal && !onRate) return null;
  return <Metric label="Your rating" value={personal?.ratingLabel === 'Unrated' && onRate ? 'Rate bottle' : personal?.ratingLabel || '—'} onPress={onRate} />;
}
function Metric({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = <><Text style={s.metricLabel}>{label}</Text><Text style={[s.metricValue, onPress && { color: colors.accent }]}>{value}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={[s.metric, s.metricAction]}>{content}</Pressable> : <View style={s.metric}>{content}</View>;
}
const s = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  identityCopy: { flex: 1, minWidth: 0, gap: 5 },
  hero: { gap: 8 }, artStage: { alignItems: 'center', justifyContent: 'center', height: 232 },
  artwork: { position: 'absolute', width: 200, alignItems: 'center', transform: [{ scale: 0.7 }] },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(214,154,74,0.055)', borderWidth: 1, borderColor: 'rgba(214,154,74,0.08)' },
  producer: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase', textAlign: 'center' },
  name: { color: colors.text, fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 },
  tierBadge: { alignSelf: "flex-start", borderRadius: 8, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent, paddingHorizontal: 8, paddingVertical: 3 },
  score: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  facts: { color: colors.muted, fontSize: 14, textTransform: 'capitalize' },
  rarity: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }, rarityText: { color: colors.accent, fontSize: 13, fontWeight: '700' }, national: { color: colors.muted, fontSize: 11 },
  personal: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 10, marginTop: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  metricAction: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  metric: { flex: 1, minWidth: 80, minHeight: 44, gap: 6 }, metricLabel: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }, metricValue: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
});

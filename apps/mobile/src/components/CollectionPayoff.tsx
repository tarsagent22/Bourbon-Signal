import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { MemberCollectionBottle, RadarBottleOption } from '../api/types';
import { collectionPayoff } from '../cellar/collection-payoff';
import { CellarBottleArtwork } from './CellarBottleArtwork';
import { colors, fonts } from '../theme';

export function CollectionPayoff({ bottles, catalog, onAdd, onOpenBottle, advancedAccess = false }: {
  advancedAccess?: boolean; bottles: readonly MemberCollectionBottle[]; catalog: readonly RadarBottleOption[];
  onAdd?: () => void; onOpenBottle?: (id: string) => void;
}) {
  const snapshot = collectionPayoff(bottles, catalog);
  const bottleCount = bottles.reduce((sum, bottle) => sum + bottle.sealedQuantity + bottle.openedQuantity, 0);
  if (!bottles.length) return <View style={s.empty}>
    <View style={s.ghostShelf} accessibilityElementsHidden>{(['bottle-wine-outline', 'glass-tulip', 'bottle-wine-outline'] as const).map((icon, index) => <View key={index} style={s.ghost}><MaterialCommunityIcons name={icon} size={index === 1 ? 60 : 48} color={index === 1 ? colors.accent : colors.muted} /></View>)}</View>
    <Text accessibilityRole="header" style={s.emptyTitle}>Your shelf starts here.</Text>
    <Text style={s.body}>Add a bottle you own or a pour you’ve tried. See your favorites, your proof range, and what makes your collection yours.</Text>
    {onAdd ? <Pressable accessibilityRole="button" accessibilityLabel="Add your first bottle" onPress={onAdd} style={s.primary}><Text style={s.primaryText}>Add your first bottle</Text><MaterialCommunityIcons name="plus" size={20} color={colors.background} /></Pressable> : null}
    <View style={s.previewGrid}>{[{ icon: 'star-outline', title: 'Your favorites', copy: 'Rate a bottle to start your personal podium.' }, { icon: 'chart-bar', title: 'Your proof range', copy: 'See where your shelf lands, from gentle to bold.' }, { icon: 'tag-outline', title: 'Your shelf value', copy: advancedAccess ? 'Matched price references add up as your shelf grows.' : 'Barrel Proof adds matched price references and value history.' }].map(item => <View key={item.title} style={s.previewRow}><MaterialCommunityIcons name={item.icon as never} size={24} color={colors.accent} /><View style={{ flex: 1, gap: 5 }}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.note}>{item.copy}</Text></View></View>)}</View>
  </View>;
  return <View style={s.stack}>
    <View style={s.hero}>
      <Text style={s.eyebrow}>YOUR COLLECTION</Text>
      <View style={s.countLine}><Text style={s.count}>{bottleCount || bottles.length}</Text><View style={s.countCopy}><Text style={s.countLabel}>{bottleCount ? 'bottles on your shelf' : 'whiskies tasted'}</Text><Text style={s.note}>{snapshot.ownedCount} owned releases · {bottles.length - snapshot.ownedCount} tasted only</Text></View></View>
      <View style={s.miniMetrics}><View style={s.mini}><Text style={s.metric}>{snapshot.averageRating == null ? '—' : snapshot.averageRating.toFixed(1)}<Text style={s.unit}>{snapshot.averageRating != null ? ' / 10' : ''}</Text></Text><Text style={s.note}>{snapshot.ratedCount ? `Your average · ${snapshot.ratedCount} ratings` : 'Rate your first bottle'}</Text></View><View style={s.mini}><Text style={s.metric}>{snapshot.favoriteCount}</Text><Text style={s.note}>Rated 8 or higher</Text></View></View>
    </View>
    <View style={s.spotlight}>
      <Text accessibilityRole="header" style={s.sectionTitle}>{snapshot.highlights.some(bottle => bottle.isRated) ? 'Your highest rated' : bottleCount ? 'On your shelf' : 'You’ve tried'}</Text>
      <ImageBackground source={require('../../assets/home-shelf-background.jpg')} imageStyle={{ opacity: 0.2 }} style={s.gallery} resizeMode="cover">
        {snapshot.highlights.map((bottle, index) => <Pressable key={bottle.bottleId} accessibilityRole={onOpenBottle ? 'button' : undefined} accessibilityLabel={`Open ${bottle.bottleName}`} disabled={!onOpenBottle} onPress={() => onOpenBottle?.(bottle.bottleId)} style={s.galleryBottle}>
          <Text style={s.place}>{bottle.isRated ? `${(bottle.rating / 10).toFixed(1)}/10` : `0${index + 1}`}</Text>
          <View style={s.art}><CellarBottleArtwork bottle={bottle} size="showcase" /></View>
          <Text numberOfLines={3} style={s.bottleName}>{bottle.bottleName}</Text>
        </Pressable>)}
      </ImageBackground>
    </View>
    {snapshot.proofRange ? <View style={s.proofCard}>
      <View style={s.proofHeading}><Text accessibilityRole="header" style={s.sectionTitle}>Your proof range</Text><Text style={s.range}>{snapshot.proofRange.low === snapshot.proofRange.high ? snapshot.proofRange.low : `${snapshot.proofRange.low}–${snapshot.proofRange.high}`}</Text></View>
      <View style={s.proofBar} accessible accessibilityLabel={snapshot.proofBuckets.map(bucket => `${bucket.label} proof: ${bucket.count} bottles`).join(', ')}>{snapshot.proofBuckets.map((bucket, index) => bucket.count ? <View key={bucket.label} style={{ flex: bucket.count, backgroundColor: [colors.accent, '#A77D53', '#655044'][index] }} /> : null)}</View>
      <View style={s.legend}>{snapshot.proofBuckets.map((bucket, index) => <View key={bucket.label} style={s.legendItem}><View style={[s.dot, { backgroundColor: [colors.accent, '#A77D53', '#655044'][index] }]} /><Text style={s.note}>{bucket.label} · {bucket.count}</Text></View>)}</View>
      <Text style={s.note}>Based on {snapshot.proofCount} bottles with catalog proof.</Text>
    </View> : null}
    {snapshot.tasteTags.length ? <View style={s.taste}><Text accessibilityRole="header" style={s.sectionTitle}>What you like</Text><Text style={s.note}>Taste cues you saved on bottles rated 8 or higher.</Text><View style={s.tags}>{snapshot.tasteTags.map(tag => <View key={tag.label} style={s.tag}><Text style={s.tagText}>{tag.label}</Text><Text style={s.note}>{tag.count}</Text></View>)}</View></View> : null}
    <View style={s.milestone}><View style={s.milestoneHeading}><MaterialCommunityIcons name="bookmark-multiple-outline" size={22} color={colors.accent} /><Text style={s.cardTitle}>{bottles.length} saved releases</Text><Text style={s.note}>Next: {snapshot.nextMilestone}</Text></View><View style={s.track}><View style={[s.fill, { width: `${bottles.length / snapshot.nextMilestone * 100}%` }]} /></View><Text style={s.note}>{snapshot.ratedCount < 3 ? 'Rate a few bottles to see which ones rise to the top.' : 'Every bottle and tasting adds another piece to your collection.'}</Text>{onAdd ? <Pressable accessibilityRole="button" onPress={onAdd} style={s.add}><Text style={s.link}>Add a bottle or tasting</Text><MaterialCommunityIcons name="plus" size={20} color={colors.accent} /></Pressable> : null}</View>
  </View>;
}
const s = StyleSheet.create({
  stack: { gap: 24 }, hero: { gap: 14, padding: 20, borderRadius: 20, backgroundColor: '#211A12', borderWidth: 1, borderColor: '#4A3622' }, eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 }, countLine: { flexDirection: 'row', alignItems: 'center', gap: 16 }, count: { color: colors.text, fontFamily: fonts.heading, fontSize: 64, lineHeight: 76 }, countCopy: { flex: 1, gap: 5 }, countLabel: { color: colors.text, fontSize: 17, lineHeight: 23 }, miniMetrics: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#4A3622', paddingTop: 14, gap: 16 }, mini: { flex: 1, gap: 3 }, metric: { color: colors.accent, fontFamily: fonts.heading, fontSize: 28 }, unit: { fontSize: 13, color: colors.muted },
  spotlight: { gap: 12 }, sectionTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 }, gallery: { flexDirection: 'row', justifyContent: 'center', borderRadius: 16, overflow: 'hidden', borderBottomWidth: 3, borderColor: '#6E4A29', paddingTop: 16, paddingBottom: 14 }, galleryBottle: { flex: 1, maxWidth: 130, minWidth: 0, alignItems: 'center', gap: 8, paddingHorizontal: 4 }, place: { color: colors.accent, fontSize: 12, fontWeight: '700' }, art: { height: 148, width: '100%', alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.85 }] }, bottleName: { color: colors.text, fontSize: 11, lineHeight: 15, textAlign: 'center', minHeight: 32 },
  proofCard: { gap: 14 }, proofHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, range: { color: colors.accent, fontFamily: fonts.heading, fontSize: 26 }, proofBar: { height: 18, borderRadius: 9, overflow: 'hidden', flexDirection: 'row', gap: 2 }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 6, height: 6, borderRadius: 3 }, taste: { gap: 12 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tag: { paddingHorizontal: 13, minHeight: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceRaised }, tagText: { color: colors.text, fontSize: 13 },
  milestone: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 12 }, milestoneHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' }, track: { height: 4, backgroundColor: colors.surfaceRaised, borderRadius: 2, overflow: 'hidden' }, fill: { height: 4, backgroundColor: colors.accent }, add: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, link: { color: colors.accent, fontSize: 14, fontWeight: '600' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  empty: { gap: 24, paddingTop: 12 }, ghostShelf: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 16, paddingVertical: 24, borderBottomWidth: 3, borderColor: '#61452C' }, ghost: { width: 64, height: 110, borderRadius: 32, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 32, lineHeight: 39 }, body: { color: colors.muted, fontSize: 15, lineHeight: 23 }, primary: { backgroundColor: colors.accent, minHeight: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, primaryText: { color: colors.background, fontSize: 15, fontWeight: '700' }, previewGrid: { gap: 22, paddingTop: 12 }, previewRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
});

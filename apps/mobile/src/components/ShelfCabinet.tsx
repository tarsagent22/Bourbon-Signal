import { fonts, typeScale } from "../theme";
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemberCollectionBottle } from '../api/types';
import { showcaseBottles, shelfBottleKey, type ShowcaseMode } from '../cellar/shelf-cabinet';
import { CellarBottleArtwork } from './CellarBottleArtwork';

const modes = [{ id: 'rated', label: 'Top rated' }, { id: 'recent', label: 'Recently added' }, { id: 'again', label: 'Buy again' }] as const;
const emptyCopy: Record<ShowcaseMode, string> = {
  rated: 'Rate a bottle you own to feature it here.',
  recent: 'Add a bottle to begin your showcase.',
  again: 'Mark an owned bottle “Would buy again” in its tasting notes to feature it here.',
};

function highlightName(name: string) {
  // Keep age statements together and separate the release descriptor from the name.
  const age = /\s+(\d+(?:\.\d+)?\s*(?:years?(?:\s+old)?|yrs?)\b.*)$/i;
  if (age.test(name)) return name.replace(age, '\n$1');
  return name.replace(/\s+(Old Fine Whisk(?:y|ey)|Cask Strength|Full Proof|Small Batch|Single Barrel|Bottled in Bond)$/i, '\n$1');
}

export function ShelfCabinet({ bottles, onBottle }: {
  bottles: readonly MemberCollectionBottle[];
  onBottle: (bottle: MemberCollectionBottle) => void;
}) {
  const [mode, setMode] = useState<ShowcaseMode>('rated');
  const featured = useMemo(() => showcaseBottles(bottles, mode), [bottles, mode]);
  return <View testID="collector-showcase" style={styles.showcase}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.title}>Shelf Highlights</Text>
      </View>
    </View>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {modes.map(option => <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: mode === option.id }} onPress={() => setMode(option.id)} style={[styles.tab, mode === option.id && styles.selectedTab]}><Text style={[styles.tabText, mode === option.id && styles.selectedText]}>{option.label}</Text></Pressable>)}
    </View>
    {featured.length ? <>
      <View testID="showcase-stage" style={styles.stage}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.backPanel} />
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.glow} />
        <View style={styles.bottleRow}>
          {featured.map(bottle => <Pressable key={shelfBottleKey(bottle)} testID="showcase-bottle" accessibilityRole="button" accessibilityLabel={`${bottle.bottleName}. Open details.`} onPress={() => onBottle(bottle)} style={styles.bottleSlot}>
            <View pointerEvents="none" style={styles.contactShadow} />
            <View style={styles.highlightArt}><CellarBottleArtwork bottle={bottle} size="showcase" /></View>
          </Pressable>)}
        </View>
        <View testID="showcase-ledge" pointerEvents="none" style={styles.ledge}><View style={styles.ledgeHighlight} /></View>
      </View>
      <View style={styles.names}>
        {featured.map(bottle => <Pressable key={shelfBottleKey(bottle)} accessibilityRole="button" accessibilityLabel={`${bottle.bottleName}. Open details.`} onPress={() => onBottle(bottle)} style={styles.nameSlot}><Text textBreakStrategy="balanced" lineBreakStrategyIOS="standard" style={styles.bottleName}>{highlightName(bottle.bottleName)}</Text></Pressable>)}
      </View>
    </> : <View style={styles.empty}><Text style={styles.emptyTitle}>{bottles.length ? 'Your next highlight awaits' : 'Make this shelf yours'}</Text><Text style={styles.emptyCopy}>{bottles.length ? emptyCopy[mode] : emptyCopy.recent}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  showcase: { backgroundColor: '#181410', borderRadius: 16, paddingTop: 14, paddingBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#30271f' },
  heading: { paddingHorizontal: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingCopy: { flex: 1 },
  title: { color: '#f3ece2', fontFamily: fonts.bottle, fontSize: typeScale.subheading, lineHeight: 24 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 12, marginTop: 0, marginBottom: 0 },
  tab: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  selectedTab: { borderBottomColor: '#b88a51' },
  tabText: { color: '#b9aa98', fontSize: typeScale.caption, lineHeight: 17 },
  selectedText: { color: '#e4b16a', fontWeight: '600' },
  stage: { position: 'relative', paddingHorizontal: 12, paddingTop: 10 },
  backPanel: { position: 'absolute', top: 8, bottom: 6, left: 12, right: 12, backgroundColor: '#201912', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#35281b' },
  glow: { position: 'absolute', top: 9, left: 24, right: 24, height: 1, backgroundColor: 'rgba(219,173,105,0.18)', shadowColor: '#e3ad66', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 12 } },
  bottleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  bottleSlot: { flex: 1, maxWidth: '33.333%', minHeight: 118, alignItems: 'center', justifyContent: 'flex-end' },
  highlightArt: { width: 88, height: 118, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.8 }] },
  contactShadow: { position: 'absolute', bottom: 0, width: 50, height: 5, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.5)' },
  ledge: { backgroundColor: '#513824', height: 9, marginTop: -1, borderRadius: 2, borderBottomWidth: 3, borderBottomColor: '#2d1d12', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  ledgeHighlight: { height: 1, marginHorizontal: 2, backgroundColor: 'rgba(225,176,110,0.32)' },
  names: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: 12, marginTop: 8 },
  nameSlot: { flex: 1, maxWidth: '33.333%', minHeight: 44, paddingHorizontal: 2 },
  bottleName: { color: '#e8dfd2', fontFamily: fonts.bottle, fontSize: typeScale.caption, lineHeight: 15, textAlign: 'center' },
  empty: { paddingHorizontal: 28, paddingVertical: 32, gap: 8, alignItems: 'center' },
  emptyTitle: { color: '#f3ece2', fontFamily: fonts.bottle, fontSize: typeScale.section, textAlign: 'center' },
  emptyCopy: { color: '#b9aa98', fontSize: typeScale.small, lineHeight: 20, textAlign: 'center' },
});

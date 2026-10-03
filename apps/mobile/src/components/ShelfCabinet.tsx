import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MemberCollectionBottle } from '../api/types';
import { showcaseBottles, shelfBottleKey, SHELF_STYLES, type ShowcaseMode, type ShelfStyle } from '../cellar/shelf-cabinet';
import { CellarBottleArtwork } from './CellarBottleArtwork';

const modes = [{ id: 'rated', label: 'Top rated' }, { id: 'recent', label: 'Recently added' }, { id: 'again', label: 'Buy again' }] as const;
const emptyCopy: Record<ShowcaseMode, string> = {
  rated: 'Rate a bottle you own to feature it here.',
  recent: 'Add a bottle to begin your showcase.',
  again: 'Mark an owned bottle “Would buy again” in its tasting notes to feature it here.',
};

export function ShelfCabinet({ bottles, shelfStyle, busy, onStyle, onBottle }: {
  bottles: readonly MemberCollectionBottle[]; shelfStyle: ShelfStyle; busy: boolean;
  onStyle: (style: ShelfStyle) => Promise<boolean>; onBottle: (bottle: MemberCollectionBottle) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [mode, setMode] = useState<ShowcaseMode>('rated');
  const featured = useMemo(() => showcaseBottles(bottles, mode), [bottles, mode]);
  const finish = shelfStyle === 'black' ? '#292b2b' : shelfStyle === 'amber' ? '#513724' : '#3d2b24';
  return <View testID="collector-showcase" style={styles.showcase}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.title}>Shelf Highlights</Text>
        <Text style={styles.subtitle}>A few bottles worth a closer look</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose showcase ledge finish" onPress={() => setPicker(true)} style={styles.edit}><Text style={styles.editText}>Finish</Text></Pressable>
    </View>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {modes.map(option => <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: mode === option.id }} onPress={() => setMode(option.id)} style={[styles.tab, mode === option.id && styles.selectedTab]}><Text style={[styles.tabText, mode === option.id && styles.selectedText]}>{option.label}</Text></Pressable>)}
    </View>
    {featured.length ? <>
      <View testID="showcase-stage" style={styles.stage}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.glow} />
        <View style={styles.bottleRow}>
          {featured.map(bottle => <Pressable key={shelfBottleKey(bottle)} testID="showcase-bottle" accessibilityRole="button" accessibilityLabel={`${bottle.bottleName}. Open details.`} onPress={() => onBottle(bottle)} style={styles.bottleSlot}>
            <View pointerEvents="none" style={styles.contactShadow} />
            <CellarBottleArtwork bottle={bottle} size="showcase" />
          </Pressable>)}
        </View>
        <View testID="showcase-ledge" pointerEvents="none" style={[styles.ledge, { backgroundColor: finish }]}><View style={styles.ledgeHighlight} /></View>
      </View>
      <View style={styles.names}>
        {featured.map(bottle => <Pressable key={shelfBottleKey(bottle)} accessibilityRole="button" accessibilityLabel={`${bottle.bottleName}. Open details.`} onPress={() => onBottle(bottle)} style={styles.nameSlot}><Text style={styles.bottleName}>{bottle.bottleName}</Text></Pressable>)}
      </View>
    </> : <View style={styles.empty}><Text style={styles.emptyTitle}>{bottles.length ? 'Your next highlight awaits' : 'Make this shelf yours'}</Text><Text style={styles.emptyCopy}>{bottles.length ? emptyCopy[mode] : emptyCopy.recent}</Text></View>}
    <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) setPicker(false); }}>
      <SafeAreaView style={styles.modal}><ScrollView contentContainerStyle={styles.picker}>
        <Text accessibilityRole="header" style={styles.pickerTitle}>Ledge finish</Text>
        <Text style={styles.pickerCopy}>Choose a finish for your showcase. Saved to your account when online.</Text>
        {SHELF_STYLES.map(style => <Pressable key={style.id} accessibilityRole="radio" accessibilityState={{ checked: shelfStyle === style.id, disabled: busy }} disabled={busy} onPress={() => { void onStyle(style.id).then(saved => { if (saved) setPicker(false); }); }} style={[styles.option, shelfStyle === style.id && styles.chosen]}><View style={[styles.swatch, { backgroundColor: style.wood, borderColor: style.edge }]} /><Text style={styles.optionText}>{style.label}{shelfStyle === style.id ? ' ✓' : ''}</Text></Pressable>)}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setPicker(false)} style={styles.option}><Text style={styles.optionText}>{busy ? 'Saving…' : 'Done'}</Text></Pressable>
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  showcase: { backgroundColor: '#141210', borderRadius: 18, paddingTop: 16, paddingBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#332b22' },
  heading: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingCopy: { flex: 1 },
  title: { color: '#f3ece2', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 21, lineHeight: 27 },
  subtitle: { color: '#b9aa98', fontSize: 11, lineHeight: 17, marginTop: 3 },
  edit: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  editText: { color: '#d69a4a', fontSize: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 12, marginTop: 8, marginBottom: 4 },
  tab: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 10 },
  selectedTab: { backgroundColor: '#2b2218' },
  tabText: { color: '#b9aa98', fontSize: 12, lineHeight: 18 },
  selectedText: { color: '#e4b16a', fontWeight: '600' },
  stage: { position: 'relative', paddingHorizontal: 12, paddingTop: 10 },
  glow: { position: 'absolute', top: 20, left: '12%', right: '12%', height: 122, borderRadius: 80, backgroundColor: 'rgba(214,154,74,0.02)' },
  bottleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  bottleSlot: { flex: 1, maxWidth: '33.333%', minHeight: 148, alignItems: 'center', justifyContent: 'flex-end' },
  contactShadow: { position: 'absolute', bottom: 0, width: 50, height: 5, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.5)' },
  ledge: { height: 9, marginTop: -1, borderRadius: 2, borderBottomWidth: 3, borderBottomColor: '#21170f', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  ledgeHighlight: { height: 1, marginHorizontal: 2, backgroundColor: 'rgba(225,176,110,0.32)' },
  names: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: 12, marginTop: 12 },
  nameSlot: { flex: 1, maxWidth: '33.333%', minHeight: 44, paddingHorizontal: 4 },
  bottleName: { color: '#e8dfd2', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 12, lineHeight: 17, textAlign: 'center' },
  empty: { paddingHorizontal: 28, paddingVertical: 32, gap: 8, alignItems: 'center' },
  emptyTitle: { color: '#f3ece2', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 19, textAlign: 'center' },
  emptyCopy: { color: '#b9aa98', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  modal: { flex: 1, backgroundColor: '#11110f' }, picker: { padding: 20, gap: 15 }, pickerTitle: { color: '#f2e7d6', fontSize: 28, fontWeight: '700' }, pickerCopy: { color: '#bfb6a8', fontSize: 15, lineHeight: 22 }, option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#514331', borderRadius: 12, padding: 14 }, chosen: { borderColor: '#d8a761' }, swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 2 }, optionText: { color: '#f2e7d6', fontSize: 16, flexShrink: 1 },
});

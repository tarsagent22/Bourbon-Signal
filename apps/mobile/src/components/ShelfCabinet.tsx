import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MemberCollectionBottle } from '../api/types';
import { cabinetRows, rankedShelfBottles, SHELF_STYLES, type ShelfStyle } from '../cellar/shelf-cabinet';
import { CellarBottleArtwork } from './CellarBottleArtwork';

export function ShelfCabinet({ bottles, shelfStyle, busy, onStyle, onBottle }: {
  bottles: readonly MemberCollectionBottle[]; shelfStyle: ShelfStyle; busy: boolean;
  onStyle: (style: ShelfStyle) => Promise<boolean>; onBottle: (bottle: MemberCollectionBottle) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [interiorWidth, setInteriorWidth] = useState(260);
  const ranked = useMemo(() => rankedShelfBottles(bottles), [bottles]);
  const rows = cabinetRows(ranked);
  const theme = SHELF_STYLES.find(s => s.id === shelfStyle) || SHELF_STYLES[0];
  const slots = Math.max(6, ...rows.map(row => row.length));
  const slotWidth = interiorWidth / slots;
  const scale = Math.min(1, (slotWidth - 3) / 80);
  const rowHeight = Math.max(72, 116 * scale + 29);
  return <View testID="shelf-cabinet" style={[styles.cabinet, { backgroundColor: theme.dark, borderColor: theme.edge }]}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 2, top: 3, bottom: 3, width: 5, backgroundColor: theme.wood, borderLeftWidth: 1, borderLeftColor: theme.edge }} />
    <View pointerEvents="none" style={{ position: 'absolute', right: 2, top: 3, bottom: 3, width: 5, backgroundColor: theme.wood, borderRightWidth: 1, borderRightColor: theme.edge }} />
    <View pointerEvents="none" style={[styles.insetFrame, { borderColor: theme.edge }]} />
    <View style={styles.heading}>
      <View style={styles.headingCopy}><Text style={styles.title}>YOUR TOP-RATED</Text><Text style={styles.caption}>{ranked.length} / 20 · Personally rated</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit Shelf" onPress={() => setPicker(true)} style={styles.edit}><Text style={styles.editText}>Edit Shelf</Text></Pressable>
    </View>
    <View onLayout={e => setInteriorWidth(e.nativeEvent.layout.width)} style={[styles.interior, { backgroundColor: theme.dark }]}>
      {(rows.length ? rows : [[]]).map((row, rowIndex) => <View key={rowIndex} testID="cabinet-row" style={[styles.row, { height: rows.length ? rowHeight : 126, backgroundColor: theme.back, borderColor: theme.dark }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({ length: 28 }, (_, i) => <View key={i} style={[styles.grain, { left: `${i * 3.7}%`, backgroundColor: theme.edge }]} />)}</View>
        <View pointerEvents="none" style={styles.lightWash} /><View pointerEvents="none" style={styles.light} />
        {row.map(bottle => <Pressable key={bottle.bottleId || `${bottle.canonicalKey}:${bottle.bottleName}`} testID="cabinet-bottle" accessibilityRole="button" accessibilityLabel={`${bottle.bottleName}. Personally rated ${(bottle.rating / 10).toFixed(1)}. Open details.`} onPress={() => onBottle(bottle)} style={[styles.slot, { width: slotWidth, height: rowHeight - 10 }]}>
          <View pointerEvents="none" style={[styles.artAnchor, { bottom: (116 * scale - 116) / 2, transform: [{ scale }] }]}><CellarBottleArtwork bottle={bottle} /></View>
        </Pressable>)}
        {!rows.length ? <Text style={styles.empty}>{bottles.length ? 'Rate a bottle you own to place it here.' : 'Your best bottles belong here.\nAdd a bottle, then give it your rating.'}</Text> : null}
        <View pointerEvents="none" style={[styles.shelfEdge, { backgroundColor: theme.wood, borderTopColor: theme.edge, borderBottomColor: theme.dark }]} />
      </View>)}
    </View>
    <Text style={styles.footer}>Highest rated first · Up to two rows</Text>
    <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) setPicker(false); }}>
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.picker}>
          <Text accessibilityRole="header" style={styles.pickerTitle}>Shelf finish</Text>
          <Text style={styles.pickerCopy}>Choose the cabinet for your collection. Saved to your account when online.</Text>
          {SHELF_STYLES.map(style => <Pressable key={style.id} accessibilityRole="radio" accessibilityState={{ checked: shelfStyle === style.id, disabled: busy }} disabled={busy} onPress={() => { void onStyle(style.id).then(saved => { if (saved) setPicker(false); }); }} style={[styles.option, shelfStyle === style.id && styles.chosen]}><View style={[styles.swatch, { backgroundColor: style.wood, borderColor: style.edge }]} /><Text style={styles.optionText}>{style.label}{shelfStyle === style.id ? ' ✓' : ''}</Text></Pressable>)}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setPicker(false)} style={styles.option}><Text style={styles.optionText}>{busy ? 'Saving…' : 'Done'}</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  cabinet: { borderWidth: 1, borderRadius: 13, padding: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  insetFrame: { position: 'absolute', top: 4, bottom: 4, left: 4, right: 4, borderWidth: 1, borderRadius: 9, opacity: 0.6 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingBottom: 8 }, headingCopy: { flexShrink: 1 },
  title: { color: '#f0d29f', fontSize: 11, fontWeight: '800', letterSpacing: 1 }, caption: { color: '#e0caae', fontSize: 11, marginTop: 3 },
  edit: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#ac8452', backgroundColor: '#15120f', borderRadius: 9, paddingHorizontal: 12 }, editText: { color: '#f2dfc1', fontSize: 12, fontWeight: '700' },
  interior: { borderWidth: 2, borderColor: '#130f0b', overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', borderBottomWidth: 2, overflow: 'hidden' },
  grain: { position: 'absolute', width: 1, top: 0, bottom: 0, opacity: 0.1 },
  light: { position: 'absolute', top: 4, left: 4, right: 4, height: 2, backgroundColor: '#f5d190', shadowColor: '#ffc36e', shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  lightWash: { position: 'absolute', top: 6, left: 0, right: 0, height: 20, backgroundColor: '#d7a453', opacity: 0.1 },
  slot: { alignItems: 'center', marginBottom: 9, overflow: 'visible' }, artAnchor: { position: 'absolute', width: 80, height: 116, alignItems: 'center', justifyContent: 'flex-end' },
  shelfEdge: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, borderTopWidth: 2, borderBottomWidth: 4 },
  empty: { flex: 1, alignSelf: 'center', textAlign: 'center', padding: 16, color: '#e0caae', fontSize: 13, lineHeight: 20 },
  footer: { color: '#e0caae', fontSize: 10, paddingTop: 9 },
  modal: { flex: 1, backgroundColor: '#11110f' }, picker: { padding: 20, gap: 15 }, pickerTitle: { color: '#f2e7d6', fontSize: 28, fontWeight: '700' }, pickerCopy: { color: '#bfb6a8', fontSize: 15, lineHeight: 22 }, option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#514331', borderRadius: 12, padding: 14 }, chosen: { borderColor: '#d8a761' }, swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 2 }, optionText: { color: '#f2e7d6', fontSize: 16, flexShrink: 1 },
});

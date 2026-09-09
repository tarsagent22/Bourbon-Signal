import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MemberCollectionBottle } from '../api/types';
import { cabinetRows, rankedShelfBottles, SHELF_STYLES, type ShelfStyle } from '../cellar/shelf-cabinet';
import { CellarBottleArtwork } from './CellarBottleArtwork';
import placement from '../../assets/shelf/placement.json';

const cabinetAssets = {
  amber: { '1': require('../../assets/shelf/amber-1row.png'), '2': require('../../assets/shelf/amber-2row.png'), '2spacious': require('../../assets/shelf/amber-2spaciousrow.png') },
  walnut: { '1': require('../../assets/shelf/walnut-1row.png'), '2': require('../../assets/shelf/walnut-2row.png'), '2spacious': require('../../assets/shelf/walnut-2spaciousrow.png') },
  black: { '1': require('../../assets/shelf/black-1row.png'), '2': require('../../assets/shelf/black-2row.png'), '2spacious': require('../../assets/shelf/black-2spaciousrow.png') },
};
const contactShadow = require('../../assets/shelf/bottle-contact-shadow.png');

export function ShelfCabinet({ bottles, shelfStyle, busy, onStyle, onBottle }: {
  bottles: readonly MemberCollectionBottle[]; shelfStyle: ShelfStyle; busy: boolean;
  onStyle: (style: ShelfStyle) => Promise<boolean>; onBottle: (bottle: MemberCollectionBottle) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [interiorWidth, setInteriorWidth] = useState(260);
  const [headingHeight, setHeadingHeight] = useState(44);
  const ranked = useMemo(() => rankedShelfBottles(bottles), [bottles]);
  const rows = cabinetRows(ranked);
  const slots = Math.max(6, ...rows.map(row => row.length));
  const assetKey = rows.length <= 1 ? '1' : slots <= 8 ? '2spacious' : '2';
  const plate = placement[assetKey];
  const cabinetHeight = interiorWidth * plate.height / plate.width;
  // Reserve the measured inline heading at larger text sizes; never stretch the cabinet grain.
  const photoScale = Math.max(0, Math.min(1, ((interiorWidth * .89 / slots) - 2) / 80, (cabinetHeight * plate.baselineY[0] - headingHeight - 8) / 116));
  return <View>
    <View testID="shelf-cabinet" onLayout={e => setInteriorWidth(e.nativeEvent.layout.width)} style={{ height: cabinetHeight, position: 'relative' }}>
      <Image accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={cabinetAssets[shelfStyle][assetKey]} resizeMode="contain" style={StyleSheet.absoluteFill} />
      <View onLayout={e => setHeadingHeight(e.nativeEvent.layout.height)} style={styles.heading}>
        <Text style={styles.caption}>TOP RATED · {ranked.length}/20</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit Shelf" onPress={() => setPicker(true)} style={styles.edit}><Text style={styles.editText}>Edit Shelf</Text></Pressable>
      </View>
      {(rows.length ? rows : [[]]).map((row, i) => <View testID="cabinet-row" key={i} style={{ position: 'absolute', left: '5.5%', right: '5.5%', top: cabinetHeight * plate.baselineY[i] - 116 * photoScale, height: 116 * photoScale, flexDirection: 'row', justifyContent: 'center' }}>
        {row.map(bottle => <Pressable key={bottle.bottleId || `${bottle.canonicalKey}:${bottle.bottleName}`} testID="cabinet-bottle" accessibilityRole="button" accessibilityLabel={`${bottle.bottleName}. Personally rated ${(bottle.rating / 10).toFixed(1)}. Open details.`} onPress={() => onBottle(bottle)} style={{ width: interiorWidth * .89 / slots, height: 116 * photoScale, alignItems: 'center' }}>
          <Image accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={contactShadow} style={{ position: 'absolute', bottom: -3, width: 66 * photoScale, height: 12 * photoScale }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: 80, height: 116, bottom: (116 * photoScale - 116) / 2 - 116 * photoScale * .027, transform: [{ scale: photoScale }] }}><CellarBottleArtwork bottle={bottle} /></View>
        </Pressable>)}
      </View>)}
    </View>
    {!ranked.length ? <Text style={styles.empty}>{bottles.length ? 'Rate a bottle you own to place it here.' : 'Add a bottle to begin your shelf.'}</Text> : null}
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
  heading: { position: 'absolute', top: 8, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caption: { color: '#ead6b4', fontSize: 10, flexShrink: 1 },
  edit: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8, flexShrink: 0 },
  editText: { color: '#f2dfc1', fontSize: 11 },
  empty: { textAlign: 'center', paddingHorizontal: 16, paddingVertical: 8, color: '#e0caae', fontSize: 13, lineHeight: 20 },
  modal: { flex: 1, backgroundColor: '#11110f' }, picker: { padding: 20, gap: 15 }, pickerTitle: { color: '#f2e7d6', fontSize: 28, fontWeight: '700' }, pickerCopy: { color: '#bfb6a8', fontSize: 15, lineHeight: 22 }, option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#514331', borderRadius: 12, padding: 14 }, chosen: { borderColor: '#d8a761' }, swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 2 }, optionText: { color: '#f2e7d6', fontSize: 16, flexShrink: 1 },
});

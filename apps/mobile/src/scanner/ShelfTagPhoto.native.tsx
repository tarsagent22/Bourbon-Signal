import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Picker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { colors } from '../theme';
import type { ShelfTagPhotoProps } from './ShelfTagPhoto';
import { createLabelIndex, readBottleLabel } from './label-matching';
import { confirmedTag, shelfTagFields } from './shelf-tag';

const reader = requireOptionalNativeModule<{ readPhoto?: (uri: string) => Promise<string> }>('BottleLabelReader');
export const canReadShelfPhoto = typeof reader?.readPhoto === 'function';
const input = { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 };

export function ShelfTagPhoto({ catalog, onConfirm }: ShelfTagPhotoProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('Frame one bottle and its shelf tag together.');
  const [draft, setDraft] = useState<{ price: string; size: string; text: string } | null>(null);
  const mounted = useRef(false), reading = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function capture() {
    if (reading.current || !reader?.readPhoto) return;
    reading.current = true;
    setBusy(true);
    let temporary: string | undefined;
    try {
      if (!(await Picker.requestCameraPermissionsAsync()).granted) {
        if (mounted.current) setHint('Enable camera access or search by name.');
        return;
      }
      const result = await Picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      if (result.canceled || !mounted.current) return;
      setDraft(null);
      const image = result.assets[0];
      const edge = image.width >= image.height ? 'width' : 'height';
      const resized = await manipulateAsync(image.uri, image[edge] > 2000 ? [{ resize: { [edge]: 2000 } }] : [], { format: SaveFormat.JPEG });
      temporary = resized.uri;
      const text = await reader.readPhoto(resized.uri);
      if (mounted.current) {
        setDraft({ ...shelfTagFields(text), text });
        setHint('Confirm the bottle price and volume printed on its tag.');
      }
    } catch {
      if (mounted.current) setHint('The photo could not be read. Retake it or search by name.');
    } finally {
      if (temporary) { try { new File(temporary).delete(); } catch {} }
      reading.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const tag = draft && confirmedTag(draft.price, draft.size);
  return <View style={{ gap: 10 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{hint}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void capture()} style={{ paddingVertical: 10 }}>
      <Text style={{ color: colors.accent }}>{draft ? 'Retake shelf photo' : 'Photograph bottle and tag'}</Text>
    </Pressable>
    {busy && <ActivityIndicator accessibilityLabel="Reading shelf tag" color={colors.accent} />}
    {draft && !busy && <>
      <Text style={{ color: colors.text }}>Bottle price ($)</Text>
      <TextInput accessibilityLabel="Confirm tag price in dollars" keyboardType="decimal-pad" style={input} value={draft.price} onChangeText={price => setDraft({ ...draft, price })} />
      <Text style={{ color: colors.text }}>Bottle size (mL)</Text>
      <TextInput accessibilityLabel="Confirm bottle size in milliliters" keyboardType="number-pad" style={input} value={draft.size} onChangeText={size => setDraft({ ...draft, size })} />
      <Pressable accessibilityRole="button" disabled={!tag} accessibilityState={{ disabled: !tag }} onPress={() => {
        if (!tag) return;
        const label = readBottleLabel(createLabelIndex(catalog), draft.text.replace(/\$\s*[\d,.]+/g, ' '));
        onConfirm(tag.price, tag.sizeMl, label.conflictingBrands ? [] : label.matches);
      }} style={{ paddingVertical: 10 }}><Text style={{ color: tag ? colors.accent : colors.muted }}>Confirm tag and choose bottle</Text></Pressable>
    </>}
  </View>;
}

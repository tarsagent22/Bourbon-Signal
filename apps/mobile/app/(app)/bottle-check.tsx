import { useMemo, useState } from 'react';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBottleCatalog } from '../../src/hooks/useBottleCatalog';
import { NativeBottleScanner } from '../../src/scanner/NativeBottleScanner';
import type { RadarBottleOption } from '../../src/api/types';
import { CellarBottleArtwork } from '../../src/components/CellarBottleArtwork';
import { colors, fonts } from '../../src/theme';

export default function BottleCheckScreen() {
  const router = useRouter();
  const catalog = useBottleCatalog();
  const [mode, setMode] = useState<'scan' | 'search'>('scan');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<RadarBottleOption[]>([]);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const results = useMemo(() => mode === 'search' ? query.trim().length >= 2 ? catalog.search(query, 12) : [] : matches, [mode, query, catalog.search, matches]);
  return <View style={s.page}>
    <Stack.Screen options={{ title: 'Bottle Check', presentation: 'modal' }} />
    <FlatList keyboardShouldPersistTaps="handled" data={results} keyExtractor={item => item.id} contentContainerStyle={s.content}
      ListHeaderComponent={<View style={s.header}>
        <Text style={s.eyebrow}>KNOW WHAT YOU’VE FOUND</Text><Text style={s.title}>A closer look.</Text><Text style={s.copy}>Find the bottle. Check its rarity and price. Make it yours.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Bottle lookup method" style={s.modes}>{(['scan', 'search'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} onPress={() => { setMode(value); setMatches([]); }} style={[s.mode, mode === value && s.selected]}><MaterialCommunityIcons name={value === 'scan' ? 'line-scan' : 'magnify'} size={18} color={mode === value ? colors.accent : colors.muted} /><Text style={mode === value ? s.selectedText : s.copy}>{value === 'scan' ? 'Scan a bottle' : 'Search by name'}</Text></Pressable>)}</View>
        {mode === 'scan' ? <><NativeBottleScanner active={focused} catalog={catalog.catalog} onMatches={setMatches} /><Text style={s.note}>Keep one label in the frame. Choose a match to confirm the age, proof, and release. Scanning does not save or post a photo.</Text></> : <TextInput accessibilityLabel="Search bottles" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Bottle, producer, or expression" placeholderTextColor={colors.muted} style={s.search} />}
        {catalog.error ? <View><Text style={s.note}>{catalog.error}</Text><Pressable accessibilityRole="button" onPress={catalog.retry} style={s.retry}><Text style={s.selectedText}>Refresh catalog</Text></Pressable></View> : null}
        <Text accessibilityRole="header" style={s.section}>{mode === 'scan' ? 'Possible matches' : 'Search results'}</Text>
      </View>}
      ListEmptyComponent={<Text style={s.copy}>{mode === 'scan' ? 'Matches will appear here as the label becomes readable. You can also search by name.' : query.trim().length >= 2 ? 'No matching bottles. Try the brand or expression.' : 'Enter at least two characters to find a bottle.'}</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={() => router.push({ pathname: '/(app)/bottle/[id]', params: { id: item.id } })} style={({ pressed }) => [s.result, pressed && { opacity: 0.7 }]}><CellarBottleArtwork bottle={{ bottleId: item.id, bottleName: item.name }} size="list" /><View style={s.resultCopy}><Text style={s.resultName}>{item.name}</Text><Text style={s.note}>{[item.proof ? `${item.proof} proof` : '', item.ageStatement?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean).join(' · ') || 'View bottle details'}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} /></Pressable>}
    />
  </View>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 48 }, header: { gap: 16, marginBottom: 12 }, eyebrow: { color: colors.accent, letterSpacing: 1.8, fontSize: 10, fontWeight: '700' }, title: { color: colors.text, fontFamily: fonts.heading, fontSize: 34 }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21 }, modes: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.accent }, selectedText: { color: colors.accent, fontSize: 14, fontWeight: '600' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, section: { color: colors.text, fontFamily: fonts.heading, fontSize: 22, marginTop: 8 }, search: { backgroundColor: colors.surface, color: colors.text, fontSize: 16, borderRadius: 12, padding: 16, minHeight: 52 }, result: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, resultCopy: { flex: 1, gap: 5 }, resultName: { color: colors.text, fontSize: 16, lineHeight: 22 }, retry: { minHeight: 44, justifyContent: 'center' } });

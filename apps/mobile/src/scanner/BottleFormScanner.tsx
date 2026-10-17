import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { RadarBottleOption } from '../api/types';
import { CellarBottleArtwork } from '../components/CellarBottleArtwork';
import { bottleHandoffParams, regionContext, routeText } from '../continuity/bottle-handoff';
import { useBottleCatalog } from '../hooks/useBottleCatalog';
import { colors, fonts } from '../theme';
import { NativeBottleScanner } from './NativeBottleScanner';

const contexts = {
  post: { title: 'Scan for your post', matches: 'Which bottle did you spot?', action: 'Use in post', destination: '/(app)/(tabs)/post' as const },
  shelf: { title: 'Scan to My Shelf', matches: 'Which bottle are you adding?', action: 'Use on My Shelf', destination: '/(app)/cellar/add' as const },
};

/** Identify a bottle for a form. Assessment, pricing and region selection stay in Bottle Check. */
export function BottleFormScanner({ purpose }: { purpose: keyof typeof contexts }) {
  const context = contexts[purpose];
  const router = useRouter(); const { userId } = useAuth(); const catalog = useBottleCatalog();
  const params = useLocalSearchParams<{ price?: string; state?: string; area?: string; store?: string }>();
  const [focused, setFocused] = useState(false);
  const [mode, setMode] = useState<'scan' | 'search'>('scan');
  const [query, setQuery] = useState(''); const [matches, setMatches] = useState<RadarBottleOption[]>([]);
  const [session, setSession] = useState(0); const returning = useRef(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const results = useMemo(() => mode === 'search' ? query.trim().length >= 2 ? catalog.search(query, 12) : [] : matches, [mode, query, catalog.search, matches]);
  const changeMode = (next: 'scan' | 'search') => {
    Keyboard.dismiss(); setMode(next); setMatches([]); setSession(value => value + 1);
  };
  const select = (bottle: RadarBottleOption) => {
    if (!userId || returning.current) return;
    returning.current = true; Keyboard.dismiss();
    router.dismissTo({ pathname: context.destination, params: bottleHandoffParams({
      id: Crypto.randomUUID(), owner: userId, bottleId: bottle.id, bottleName: bottle.name,
      price: routeText(params.price), ...regionContext(params.state, params.area), store: routeText(params.store, 220),
    }) });
  };
  return <View style={s.page}>
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${purpose} scanner`} onPress={() => { Keyboard.dismiss(); router.back(); }} style={s.iconButton}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></Pressable>
        <Text accessibilityRole="header" style={s.title}>{context.title}</Text><View style={s.iconButton} />
      </View>
    </SafeAreaView>
    <FlatList style={{ flex: 1 }} data={results} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
      ListHeaderComponent={<View style={s.header}>
        <View accessibilityRole="radiogroup" accessibilityLabel={`${purpose} bottle lookup method`} style={s.modes}>
          {(['scan', 'search'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} onPress={() => changeMode(value)} style={[s.mode, mode === value && s.activeMode]}>
            <MaterialCommunityIcons name={value === 'scan' ? 'line-scan' : 'magnify'} size={18} color={mode === value ? colors.accent : colors.muted} /><Text style={mode === value ? s.activeText : s.copy}>{value === 'scan' ? 'Camera' : 'Search instead'}</Text>
          </Pressable>)}
        </View>
        {mode === 'scan' ? <NativeBottleScanner key={session} active={focused} catalog={catalog.catalog} onMatches={setMatches} /> : <TextInput accessibilityLabel={`Search bottles for ${purpose}`} value={query} onChangeText={setQuery} autoFocus autoCapitalize="none" autoCorrect={false} placeholder="Bottle, producer, or expression" placeholderTextColor={colors.muted} style={s.input} />}
        {catalog.loading && !catalog.catalog.length ? <ActivityIndicator accessibilityLabel="Loading bottle catalog" color={colors.accent} /> : null}
        {catalog.error ? <View><Text style={s.note}>{catalog.error}</Text><Pressable accessibilityRole="button" onPress={catalog.retry} style={s.textButton}><Text style={s.activeText}>Retry bottle search</Text></Pressable></View> : null}
        {results.length ? <View style={s.matchHeading}><Text accessibilityRole="header" style={s.heading}>{context.matches}</Text>{mode === 'scan' ? <Pressable accessibilityRole="button" onPress={() => { setMatches([]); setSession(value => value + 1); }} style={s.textButton}><Text style={s.activeText}>Try another label</Text></Pressable> : null}</View> : null}
      </View>}
      ListEmptyComponent={mode === 'search' && query.trim().length >= 2 && !catalog.loading ? <Text style={s.note}>No matches. Try the brand or expression.</Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${context.action}: ${item.name}`} disabled={!userId} onPress={() => select(item)} style={({ pressed }) => [s.result, pressed && { opacity: 0.7 }]}>
        <CellarBottleArtwork bottle={{ bottleId: item.id, bottleName: item.name }} size="list" />
        <View style={s.resultCopy}><Text style={s.bottleName}>{item.name}</Text><Text style={s.note}>{[item.proof ? `${item.proof} proof` : '', item.ageStatement?.replace(/^0*(\d+)Y$/i, '$1 years')].filter(Boolean).join(' · ')}</Text><Text style={s.activeText}>{context.action}</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
      </Pressable>}
    />
    <SafeAreaView edges={['bottom']} style={s.safe} />
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, safe: { backgroundColor: colors.background },
  topBar: { minHeight: 54, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }, iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingTop: 8, paddingBottom: 24 }, header: { gap: 16, marginBottom: 8 }, modes: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderBottomWidth: 1, borderColor: colors.border }, activeMode: { borderColor: colors.accent },
  copy: { color: colors.muted, fontSize: 14 }, activeText: { color: colors.accent, fontSize: 14, fontWeight: '600' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  input: { color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 52, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  matchHeading: { gap: 4 }, heading: { color: colors.text, fontFamily: fonts.heading, fontSize: 23, lineHeight: 29 }, textButton: { minHeight: 44, justifyContent: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, resultCopy: { flex: 1, gap: 5 }, bottleName: { color: colors.text, fontSize: 16, lineHeight: 22 },
});

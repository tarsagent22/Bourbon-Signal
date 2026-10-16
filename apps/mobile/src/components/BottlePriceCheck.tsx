import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { compareBottlePrice } from '../../../../shared/bottle-profile';
import { colors, fonts } from '../theme';

export function BottlePriceCheck({ msrp, initialPrice = '' }: { msrp: number | null; initialPrice?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [price, setPrice] = useState(initialPrice);
  const result = compareBottlePrice(price, msrp);
  return <View style={s.section}>
    <View style={s.heading}><Text accessibilityRole="header" style={s.title}>Price context</Text><Text style={s.reference}>{msrp != null ? `MSRP $${msrp.toFixed(2)}` : 'MSRP unavailable'}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={s.trigger}><Text style={s.triggerText}>{expanded ? 'Close price check' : 'Check a price'} <Text> {expanded ? '−' : '+'}</Text></Text></Pressable>
    {expanded ? <View style={s.body}>
      <Text style={s.caption}>What’s the shelf price?</Text>
      <View style={s.inputRow}><Text style={s.currency}>$</Text><TextInput accessibilityLabel="Shelf price in US dollars" keyboardType="decimal-pad" value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={colors.muted} maxLength={12} style={s.input} /></View>
      {result.kind === 'compared' ? <View accessibilityLiveRegion="polite"><Text style={s.result}>{result.label}</Text><Text style={s.caption}>{Math.abs(result.difference) < 0.005 ? 'Matches the catalog MSRP.' : `$${Math.abs(result.difference).toFixed(2)} ${result.difference > 0 ? 'above' : 'below'} the catalog MSRP.`}</Text></View> : result.kind === 'invalid' ? <Text accessibilityRole="alert" style={s.caption}>Enter a price greater than zero, with up to two decimal places.</Text> : result.kind === 'unpriced' ? <Text style={s.caption}>We don’t have an MSRP reference for this release yet.</Text> : null}
      <Text style={s.note}>USD · MSRP is a reference, not a live store price or resale estimate. Taxes and local pricing vary.</Text>
    </View> : null}
  </View>;
}
const s = StyleSheet.create({ section: { gap: 12, paddingVertical: 8 }, heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, title: { color: colors.text, fontFamily: fonts.heading, fontSize: 22, flex: 1 }, reference: { color: colors.muted, fontSize: 13 }, trigger: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.border }, triggerText: { color: colors.accent, fontSize: 15, fontWeight: '600' }, body: { gap: 14 }, caption: { color: colors.muted, fontSize: 14, lineHeight: 21 }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 16 }, currency: { color: colors.muted, fontSize: 26 }, input: { flex: 1, color: colors.text, fontSize: 30, paddingVertical: 14 }, result: { color: colors.accent, fontFamily: fonts.heading, fontSize: 24, marginBottom: 6 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 } });

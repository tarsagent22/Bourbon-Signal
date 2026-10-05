import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { collectionMoney, secondaryMoney, type CollectionValue } from '../cellar/collection-value';
import { colors, fonts, typeScale } from '../theme';

export function CollectionValueCard({ value, resetKey }: { value?: CollectionValue | null; resetKey?: boolean }) {
  const [entryLimit, setEntryLimit] = useState(20);
  const [details, setDetails] = useState(false);
  useEffect(() => { setEntryLimit(20); setDetails(false); }, [value, resetKey]);
  if (!value) return <View style={styles.card}><Text style={styles.title}>Collection value</Text><Text style={styles.copy}>Price estimates are temporarily unavailable. Refresh My Shelf to try again.</Text></View>;
  const content = <>
    <Text accessibilityRole="header" style={styles.title}>Collection value</Text>
    <Text style={styles.copy}>Approximate value · USD</Text>
    <View style={styles.prices}>
      <View style={styles.price}><Text style={styles.label}>{value.msrp.pricedCount<value.ownedCount?'MSRP · partial':'MSRP'}</Text><Text style={styles.amount}>{collectionMoney(value.msrp.total)}</Text><Text style={styles.copy}>{value.msrp.pricedCount} of {value.ownedCount} bottles priced</Text></View>
      <View style={styles.price}><Text style={styles.label}>{value.secondary.pricedCount<value.sealedCount?'Secondary · partial':'Secondary'}</Text><Text style={styles.amount}>{secondaryMoney(value)}</Text><Text style={styles.copy}>{value.secondary.pricedCount} of {value.sealedCount} sealed bottles priced</Text></View>
    </View>
    <Text style={styles.copy}>{value.openedCount} open bottles excluded from secondary value.</Text>
    <Text style={styles.copy}>Prices reviewed {value.reviewedAt}. Missing prices are excluded.</Text>
    {value.msrp.pricedCount<value.ownedCount||value.secondary.pricedCount<value.sealedCount?<Text style={styles.copy}>These totals cover priced bottles only, not your whole collection.</Text>:null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} style={styles.source} onPress={() => { setDetails(open => !open); setEntryLimit(20); }}><Text style={styles.link}>{details ? 'Hide pricing breakdown ↑' : 'View pricing breakdown →'}</Text></Pressable>
    {details ? <>
      <Text style={styles.copy}>MSRP uses published full-bottle prices for bottles on hand, including open bottles. It does not estimate the whiskey remaining. Secondary uses recent market references for sealed modern 750 ml bottles. Older vintages, private picks and other sizes need their own prices. Taxes and selling fees are excluded. These are dated references, not live quotes or guaranteed sale prices.</Text>
      {value.entries.length === 0 ? <Text style={styles.copy}>Add bottles to see your collection value.</Text> : value.entries.slice(0, entryLimit).map((entry, index) => <View style={styles.entry} key={`${entry.bottleId}:${index}`}>
        <Text style={styles.label}>{entry.name}</Text>
        <Text style={styles.copy}>{entry.sealedQuantity} sealed · {entry.openedQuantity} open</Text>
        <Text style={styles.copy}>MSRP per bottle: {collectionMoney(entry.msrp?.amount ?? null)}</Text>
        {entry.sealedQuantity > 0 ? <Text style={styles.copy}>Secondary per sealed bottle: {entry.secondary ? `${collectionMoney(entry.secondary.low)} – ${collectionMoney(entry.secondary.high)}` : 'Not priced yet'}</Text> : null}
        {entry.msrp ? <Source price={entry.msrp} /> : null}
        {entry.secondary && entry.sealedQuantity > 0 ? <Source price={entry.secondary} /> : null}
        {entry.secondary && entry.sealedQuantity > 0 ? <Text style={styles.copy}>Confidence: {entry.secondary.confidence || 'low'} · {entry.secondary.evidenceKind==='completed_sales'?`${entry.secondary.observations?.length || 0} completed-sale observations`:'market reference'}</Text> : null}
      </View>)}
      {entryLimit < value.entries.length ? <Pressable accessibilityRole="button" style={styles.source} onPress={() => setEntryLimit(n => n + 20)}><Text style={styles.link}>Show {Math.min(20, value.entries.length - entryLimit)} more bottles</Text></Pressable> : null}
    </> : null}
  </>;
  return <View style={styles.card}>{content}</View>;
}
function Source({price}:{price:{label:string;date:string;source:string}}) {
  return <Pressable accessibilityRole="link" accessibilityLabel={`${price.label}, ${price.date}. Open price source`} style={styles.source} onPress={() => { void Linking.openURL(price.source).catch(() => undefined); }}><Text style={styles.link}>{price.label} · {price.date} ↗</Text></Pressable>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  title: { fontFamily: fonts.heading, fontSize: 23, color: colors.text, fontWeight: '600' },
  prices: { gap: 16, flexDirection: 'row', flexWrap: 'wrap' }, price: { gap: 4, flex: 1, minWidth: 125 }, label: { color: colors.text, fontSize: typeScale.input, fontWeight: '600' },
  amount: { color: colors.accent, fontSize: 22, fontWeight: '600' },
  copy: { color: colors.muted, fontSize: typeScale.body, lineHeight: 21 },
  link: { color: colors.accent, fontSize: typeScale.body, lineHeight: 21 },
  source: { minHeight: 44, justifyContent: 'center' },
  entry: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CollectionHistory } from '../../../../shared/collection-history';
import type { MemberCollectionBottle } from '../api/types';
import type { collectionStatistics } from '../interactions/member-interactions';
import { useBottleCatalog } from '../hooks/useBottleCatalog';
import { useMobileApi } from '../hooks/useMobileApi';
import { collectionInsights } from '../cellar/collection-insights';
import { collectionMoney, secondaryMoney, type CollectionValue } from '../cellar/collection-value';
import { CollectionValueCard } from './CollectionValueCard';
import { CollectionValueChart } from './CollectionValueChart';
import { colors, fonts } from '../theme';

type Statistics = ReturnType<typeof collectionStatistics>;
const tones = [colors.accent, '#C9B393', '#8E775F', '#685E53', '#4E4943'];
export function CollectionStatisticsSheet({ visible, statistics, bottles, collectionVersion, advancedAccess = false, collectionValue, onClose, onDismiss }: {
  advancedAccess?: boolean; collectionValue?: CollectionValue | null; collectionVersion: number;
  visible: boolean; statistics: Statistics; bottles: readonly MemberCollectionBottle[]; onClose: () => void; onDismiss: () => void;
}) {
  const api = useMobileApi(); const catalog = useBottleCatalog();
  const heading = useRef<Text>(null);
  const [basis, setBasis] = useState<'msrp' | 'secondary'>('msrp');
  const [history, setHistory] = useState<CollectionHistory | null>(null);
  const [currentValue, setCurrentValue] = useState<CollectionValue | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [retry, setRetry] = useState(0); const [pricingDetails, setPricingDetails] = useState(false);
  useEffect(() => {
    let active = true; setHistory(null); setCurrentValue(null); setError(''); setPricingDetails(false);
    if (!visible || !advancedAccess) { setLoading(false); return; }
    setLoading(true);
    void api.getCollectionHistory().then(result => {
      if (!active) return;
      if (result.collectionVersion !== collectionVersion) { setError('Your shelf changed. Close this screen and refresh My Shelf for the latest value.'); return; }
      setHistory(result.history); setCurrentValue(result.value);
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Value history couldn’t load.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, visible, advancedAccess, collectionVersion, retry]);
  const value = currentValue || collectionValue;
  const insights = useMemo(() => collectionInsights(bottles, catalog.catalog, advancedAccess ? value : null), [bottles, catalog.catalog, value, advancedAccess]);
  const s = statistics;
  const pricedCount = basis === 'msrp' ? value?.msrp.pricedCount || 0 : value?.secondary.pricedCount || 0;
  const eligibleCount = basis === 'msrp' ? s.ownedBottleCount : s.sealedBottleCount;
  const focusHeading = () => {
    if (Platform.OS === 'web') { (heading.current as unknown as { focus?: () => void })?.focus?.(); return; }
    const node = findNodeHandle(heading.current); if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
  };
  return <Modal visible={visible} animationType="none" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onDismiss} onShow={focusHeading}>
    <SafeAreaView style={styles.frame} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={styles.header}><Text ref={heading} accessible accessibilityRole="header" style={styles.title}>Collection Statistics</Text><Pressable accessibilityRole="button" accessibilityLabel="Close collection statistics" onPress={onClose} style={styles.close}><Text style={styles.link}>Close</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        {advancedAccess ? <View style={styles.valueSection}>
          <Text style={styles.eyebrow}>COLLECTION VALUE · USD</Text>
          <View style={styles.basis}>{(['msrp', 'secondary'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: basis === option }} onPress={() => setBasis(option)} style={[styles.basisButton, basis === option && styles.basisActive]}><Text style={basis === option ? styles.link : styles.copy}>{option === 'msrp' ? 'MSRP' : 'Secondary'}</Text></Pressable>)}</View>
          <Text style={styles.amount} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}>{value ? basis === 'msrp' ? collectionMoney(value.msrp.total) : secondaryMoney(value) : 'Unavailable'}</Text>
          <View style={styles.coverageTrack}><View style={[styles.coverageFill, { width: `${eligibleCount ? Math.min(100, pricedCount / eligibleCount * 100) : 0}%` }]} /></View>
          <Text style={styles.copy}>{pricedCount} of {eligibleCount} {basis === 'secondary' ? 'sealed ' : ''}bottles priced{pricedCount < eligibleCount ? ' · partial estimate' : ''}</Text>
          <Text style={styles.note}>{basis === 'secondary' ? `${s.openBottleCount} open bottles excluded. Dated market references, not guaranteed sale prices.` : 'Published full-bottle MSRP for bottles on hand, including open bottles. Missing prices are excluded.'}</Text>
          <View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>Value over time</Text>{loading ? <ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Loading value history" /> : null}</View>
          {history ? <CollectionValueChart history={history} basis={basis} /> : loading ? <View style={styles.historyLoading}><Text style={styles.copy}>Loading recorded values…</Text></View> : null}
          {error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.copy}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={styles.close}><Text style={styles.link}>Retry history</Text></Pressable></View> : null}
          {!value ? <Text style={styles.copy}>Pricing is temporarily unavailable. Refresh My Shelf to try again.</Text> : null}
        </View> : null}

        <View style={styles.summary}>
          <Metric label="Bottles on hand" value={String(s.ownedBottleCount)} detail={`${s.ownedWhiskeyCount} unique owned entries`} />
          <Metric label="Tasted only" value={String(s.tastedOnlyCount)} detail="Saved with no bottles on hand" />
        </View>
        <View style={[styles.inventoryBar, { backgroundColor: colors.surfaceRaised }]} accessibilityLabel={`${s.sealedBottleCount} sealed bottles and ${s.openBottleCount} open bottles`}>{s.ownedBottleCount ? <><View style={{ flex: s.sealedBottleCount, backgroundColor: colors.accent }} /><View style={{ flex: s.openBottleCount, backgroundColor: '#685E53' }} /></> : null}</View>
        <View style={styles.inventoryLabels}><Text style={styles.copy}>{s.sealedBottleCount} sealed</Text><Text style={styles.copy}>{s.openBottleCount} open</Text></View>

        {insights.concentration ? <View style={styles.insight}><Text style={styles.insightNumber}>{insights.concentration.percent}%</Text><View style={styles.insightCopy}><Text style={styles.insightTitle}>MSRP concentration</Text><Text style={styles.copy}>Your {insights.concentration.topCount} highest-value holdings account for {insights.concentration.percent}% of your priced MSRP total.</Text><Text style={styles.note}>{insights.concentration.names.join(' · ')}</Text></View></View> : null}

        <Breakdown title="By producer" rows={insights.producers} total={insights.ownedCount} empty="Add a bottle to see your producer mix." />
        <Breakdown title="Rarity on your shelf" rows={insights.rarity} total={insights.ownedCount} empty="Your owned bottles will appear here." />
        <Text style={styles.note}>Breakdowns count bottles on hand. Unmatched and unclassified bottles stay separate.{catalog.error ? ' Using the saved catalog; refresh My Shelf for updated details.' : ''}</Text>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Your collection, in numbers</Text>
          <View style={styles.summary}><Metric label="Average proof" value={insights.averageProof == null ? '—' : insights.averageProof.toFixed(1)} detail={`${insights.proofCount} of ${s.ownedBottleCount} bottles with known proof`} /><Metric label="Buy again" value={String(insights.buyAgain)} detail="Entries you marked to buy again" /></View>
          {insights.proofComparison ? <View style={styles.comparison}><Text style={styles.insightTitle}>How proof compares</Text><View style={styles.summary}><Metric label="100+ proof" value={`${insights.proofComparison.higher.toFixed(1)} / 10`} detail={`${insights.proofComparison.higherCount} rated entries`} /><Metric label="Under 100 proof" value={`${insights.proofComparison.lower.toFixed(1)} / 10`} detail={`${insights.proofComparison.lowerCount} rated entries`} /></View><Text style={styles.note}>Your ratings across owned and tasted entries with known proof.</Text></View> : insights.ownershipComparison ? <View style={styles.comparison}><Text style={styles.insightTitle}>Owned vs. tasted</Text><View style={styles.summary}><Metric label="Owned bottles" value={`${insights.ownershipComparison.owned.toFixed(1)} / 10`} detail={`${insights.ownershipComparison.ownedCount} rated entries`} /><Metric label="Tasted, not owned" value={`${insights.ownershipComparison.tasted.toFixed(1)} / 10`} detail={`${insights.ownershipComparison.tastedCount} rated entries`} /></View></View> : <Text style={styles.copy}>{s.ratedCount ? `${s.ratedCount} rated entries · ${(s.averageRating! / 10).toFixed(1)} / 10 average. Proof comparisons appear once you have at least three ratings in each group.` : 'Rate bottles you own or have tasted to reveal your tasting patterns.'}</Text>}
        </View>
        {advancedAccess ? <View style={styles.section}><Pressable accessibilityRole="button" accessibilityState={{ expanded: pricingDetails }} onPress={() => setPricingDetails(open => !open)} style={styles.disclosure}><Text style={styles.link}>Pricing sources & methodology</Text><Text style={styles.link}>{pricingDetails ? '−' : '+'}</Text></Pressable>{pricingDetails ? <CollectionValueCard value={value} resetKey={visible} /> : null}</View> : null}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.note}>{detail}</Text></View>; }
function Breakdown({ title, rows, total, empty }: { title: string; rows: Array<{ label: string; count: number }>; total: number; empty: string }) {
  const known = rows.filter(row => row.label !== 'Producer not matched');
  const visible = title === 'By producer' && known.length > 4 ? [...known.slice(0, 4), { label: 'Other producers', count: known.slice(4).reduce((sum, row) => sum + row.count, 0) }, ...rows.filter(row => row.label === 'Producer not matched')] : rows;
  return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{visible.length ? visible.map((row, index) => <View key={row.label} accessible accessibilityLabel={`${row.label}, ${row.count} bottles, ${Math.round(row.count / total * 100)} percent`} style={styles.breakdownRow}><View style={styles.breakdownHeading}><Text style={styles.breakdownLabel}>{row.label}</Text><Text style={styles.count}>{row.count} · {Math.round(row.count / total * 100)}%</Text></View><View style={styles.breakdownTrack}><View style={{ height: 5, borderRadius: 3, width: `${row.count / total * 100}%`, backgroundColor: /not matched|not classified|under review/i.test(row.label) ? '#685E53' : tones[index % tones.length] }} /></View></View>) : <Text style={styles.copy}>{empty}</Text>}</View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, title: { flex: 1, color: colors.text, fontFamily: fonts.heading, fontSize: 27, lineHeight: 33 }, close: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, content: { padding: 22, paddingBottom: 44, gap: 18 }, link: { color: colors.accent, fontSize: 14, fontWeight: '600' }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, valueSection: { gap: 12 }, eyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 1.8, fontWeight: '700' }, basis: { flexDirection: 'row', gap: 6, alignSelf: 'flex-start' }, basisButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 9 }, basisActive: { backgroundColor: colors.surfaceRaised }, amount: { color: colors.accent, fontFamily: fonts.heading, fontSize: 42, lineHeight: 52 }, coverageTrack: { height: 3, backgroundColor: colors.surfaceRaised, borderRadius: 2, overflow: 'hidden' }, coverageFill: { height: 3, backgroundColor: colors.accent }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }, sectionTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 23, lineHeight: 29 }, section: { paddingTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 18 }, historyLoading: { minHeight: 180, justifyContent: 'center', alignItems: 'center' }, notice: { gap: 4 }, summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 }, metric: { flex: 1, minWidth: 120, gap: 6 }, metricLabel: { color: colors.muted, fontSize: 12 }, metricValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 30 }, inventoryBar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }, inventoryLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -10 }, insight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18, paddingVertical: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, insightNumber: { color: colors.accent, fontFamily: fonts.heading, fontSize: 38 }, insightCopy: { flex: 1, minWidth: 170, gap: 8 }, insightTitle: { color: colors.text, fontSize: 15, fontWeight: '600' }, breakdownRow: { gap: 9 }, breakdownHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 12 }, breakdownLabel: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 }, count: { color: colors.muted, fontSize: 12 }, breakdownTrack: { backgroundColor: colors.surfaceRaised, height: 5, borderRadius: 3, overflow: 'hidden' }, comparison: { gap: 14 }, disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CollectionHistory, CollectionHistoryPoint } from '../../../../shared/collection-history';
import { collectionMoney } from '../cellar/collection-value';
import { colors } from '../theme';

type Basis = 'msrp' | 'secondary';
const amount = (point: CollectionHistoryPoint, basis: Basis) => basis === 'msrp' ? point.value.msrp.total : point.value.secondary.low;
export function CollectionValueChart({ history, basis }: { history: CollectionHistory; basis: Basis }) {
  const [width, setWidth] = useState(300);
  const [range, setRange] = useState<'30D' | '1Y' | 'Recorded'>('Recorded');
  const [selectedId, setSelectedId] = useState('');
  const points = useMemo(() => {
    const start = range === 'Recorded' ? 0 : Date.now() - (range === '30D' ? 30 : 365) * 86400000;
    return history.points.filter(point => Date.parse(point.observedAt) >= start && amount(point, basis) != null);
  }, [history, basis, range]);
  const selected = points.find(point => point.id === selectedId) || points.at(-1);
  useEffect(() => { setSelectedId(''); }, [basis, range]);
  const values = points.map(point => amount(point, basis)!);
  const highValues = points.map(point => basis === 'secondary' ? point.value.secondary.high! : point.value.msrp.total!);
  const maximum = Math.max(...highValues, 1), minimum = Math.min(...values, 0);
  const span = Math.max(1, maximum - minimum);
  const first = points[0] ? Date.parse(points[0].observedAt) : 0, last = points.at(-1) ? Date.parse(points.at(-1)!.observedAt) : 0;
  const plotWidth = Math.max(1, width - 24), height = 140;
  const coordinates = points.map((point, index) => ({ point, x: points.length === 1 ? plotWidth / 2 : last === first ? index / Math.max(1, points.length - 1) * plotWidth : (Date.parse(point.observedAt) - first) / (last - first) * plotWidth,
    y: height - ((amount(point, basis)! - minimum) / span) * height, highY: height - ((basis === 'secondary' ? point.value.secondary.high! : point.value.msrp.total!) - minimum) / span * height }));
  const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return <View style={s.section}>
    <View style={s.ranges}>{(['30D', '1Y', 'Recorded'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: range === value }} onPress={() => setRange(value)} style={[s.range, range === value && s.activeRange]}><Text style={range === value ? s.activeText : s.muted}>{value === 'Recorded' ? history.hasMore ? 'Recent' : 'All' : value}</Text></Pressable>)}</View>
    {selected ? <View accessibilityLiveRegion="polite" style={s.selection}><Text style={s.date}>{date(selected.observedAt)} · {new Date(selected.observedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text><Text style={s.selectedAmount}>{basis === 'msrp' ? collectionMoney(selected.value.msrp.total) : `${collectionMoney(selected.value.secondary.low)} – ${collectionMoney(selected.value.secondary.high)}`}</Text><Text style={s.muted}>{basis === 'msrp' ? `${selected.value.msrp.pricedCount} of ${selected.value.ownedCount} bottles priced` : `${selected.value.secondary.pricedCount} of ${selected.value.sealedCount} sealed bottles priced`}</Text></View> : null}
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={s.canvas} accessibilityLabel={`Recorded ${basis === 'msrp' ? 'MSRP' : 'secondary'} value chart. ${points.length} observations. Use the previous and next observation buttons for details.`}>
      {[0, 0.5, 1].map(fraction => <View key={fraction} pointerEvents="none" style={[s.grid, { top: 12 + fraction * height }]} />)}
      {coordinates.map(({ point, x, y, highY }, index) => {
        const previous = coordinates[index - 1];
        const dx = previous ? x - previous.x : 0, dy = previous ? y - previous.y : 0;
        const highDy = previous ? highY - previous.highY : 0;
        return <View key={point.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {previous ? <View pointerEvents="none" style={[s.line, { left: previous.x + 12 + dx / 2 - Math.hypot(dx, dy) / 2, top: previous.y + 12 + dy / 2, width: Math.hypot(dx, dy), transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} /> : null}
          {previous && basis === 'secondary' ? <View pointerEvents="none" style={[s.line, { opacity: 0.4, left: previous.x + 12 + dx / 2 - Math.hypot(dx, highDy) / 2, top: previous.highY + 12 + highDy / 2, width: Math.hypot(dx, highDy), transform: [{ rotate: `${Math.atan2(highDy, dx)}rad` }] }]} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`${date(point.observedAt)}, ${collectionMoney(amount(point, basis))}`} onPress={() => setSelectedId(point.id)} style={{ position: 'absolute', left: x + 12 - 22, top: y + 12 - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><View style={[s.dot, selected?.id === point.id && s.selectedDot]} /></Pressable>
        </View>;
      })}
      {!points.length ? <View style={s.empty}><Text style={s.muted}>No priced observations in this period.</Text></View> : null}
    </View>
    {points.length ? <View style={s.axis}><Text style={s.muted}>{date(points[0].observedAt)}</Text><Text style={s.muted}>{points.length > 1 ? date(points.at(-1)!.observedAt) : 'First observation'}</Text></View> : null}
    {selected && points.length > 1 ? <View style={s.navigation}>{([-1, 1] as const).map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction < 0 ? 'Previous value observation' : 'Next value observation'} disabled={points.indexOf(selected) + direction < 0 || points.indexOf(selected) + direction >= points.length} onPress={() => setSelectedId(points[points.indexOf(selected) + direction].id)} style={s.nav}><Text style={s.activeText}>{direction < 0 ? '← Previous' : 'Next →'}</Text></Pressable>)}</View> : null}
    <Text style={s.note}>{history.hasMore ? 'Latest 200 recorded observations. ' : ''}{history.points.length < 2 ? 'History starts with your first recorded value. New shelf and pricing observations add points.' : 'Values reflect your saved bottles and the prices known at each observation.'}{basis === 'secondary' ? ' The two lines show the low and high estimates for priced sealed bottles.' : ''}</Text>
  </View>;
}
const s = StyleSheet.create({ section: { gap: 12 }, ranges: { flexDirection: 'row', alignSelf: 'flex-end', gap: 4 }, range: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8 }, activeRange: { backgroundColor: colors.surfaceRaised }, activeText: { color: colors.accent, fontSize: 12, fontWeight: '600' }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, selection: { gap: 3 }, date: { color: colors.muted, fontSize: 12 }, selectedAmount: { color: colors.text, fontSize: 24, fontWeight: '600' }, canvas: { height: 164, marginVertical: 8 }, grid: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, line: { position: 'absolute', height: 2, backgroundColor: colors.accent }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }, selectedDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.text }, axis: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, navigation: { flexDirection: 'row', justifyContent: 'space-between' }, nav: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center' } });

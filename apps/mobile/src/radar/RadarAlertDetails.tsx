import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemberAlert } from '../api/types';
import { colors } from '../theme';
import { radarBottleLabel, radarDirectionsUrl, radarStoreAddress } from './alert-detail-presentation';

export function RadarAlertDetails({ alert, bottles, stale, onOpenReport }: {
  alert: MemberAlert; bottles: string[]; stale: boolean; onOpenReport?: () => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const [directionsError, setDirectionsError] = useState(false);
  const address = radarStoreAddress(alert.storeLabel);
  const directionsUrl = radarDirectionsUrl(alert.storeLabel);
  const observed = new Date(alert.signalAt || alert.createdAt);
  return <View style={s.details}>
    <View style={s.bottleList}>
      <Text style={s.eyebrow}>{bottles.length === 1 ? 'REPORTED BOTTLE' : `${bottles.length} REPORTED BOTTLES`}</Text>
      {bottles.map((raw, index) => {
        const bottle = radarBottleLabel(raw);
        return <View key={raw} style={[s.bottleRow, index > 0 && s.divider]}>
          <View style={s.bottleIcon}><MaterialCommunityIcons name="bottle-wine-outline" size={22} color={colors.accent} /></View>
          <View style={s.bottleCopy}><Text style={s.bottleName}>{bottle.name}</Text>{bottle.size || bottle.proof ? <Text style={s.secondary}>{[bottle.size, bottle.proof].filter(Boolean).join(' · ')}</Text> : null}</View>
        </View>;
      })}
    </View>
    <View style={s.notice}><MaterialCommunityIcons name={stale ? 'clock-outline' : 'information-outline'} size={17} color={colors.muted} /><Text style={s.noticeText}>{stale ? 'Past report · availability unconfirmed' : 'Availability unconfirmed'}{ '\n' }Check with the store before making a trip.</Text></View>
    {address ? <View style={s.addressRow}><MaterialCommunityIcons name="map-marker-outline" size={19} color={colors.muted} /><Text selectable style={s.address}>{address}</Text></View> : null}
    <View style={s.actions}>
      {directionsUrl ? <Pressable accessibilityRole="button" accessibilityLabel={`Get directions to ${alert.storeLabel}`} onPress={() => { setDirectionsError(false); void Linking.openURL(directionsUrl).catch(() => setDirectionsError(true)); }} style={({ pressed }) => [s.primary, pressed && s.pressed]}><MaterialCommunityIcons name="directions" size={19} color={colors.background} /><Text style={s.primaryText}>Directions</Text></Pressable> : null}
      {onOpenReport ? <Pressable accessibilityRole="button" onPress={onOpenReport} style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]}><Text style={s.secondaryButtonText}>View report</Text><MaterialCommunityIcons name="arrow-top-right" size={17} color={colors.accent} /></Pressable> : null}
    </View>
    {directionsError ? <Text accessibilityRole="alert" style={s.error}>Maps couldn’t open. Try again or copy the address above.</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSource }} onPress={() => setShowSource(value => !value)} style={s.sourceToggle}><Text style={s.secondary}>Report details</Text><MaterialCommunityIcons name={showSource ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></Pressable>
    {showSource ? <View style={s.source}>
      <Text style={s.secondary}>{alert.sourceLabel || (alert.sourceType === 'community' ? 'Community sighting' : 'Bourbon Signal')}</Text>
      <Text style={s.secondary}>{Number.isFinite(observed.getTime()) ? observed.toLocaleString() : 'Report time unavailable'}</Text>
      {alert.quantity !== null ? <Text style={s.secondary}>Source-reported quantity: {alert.quantity}</Text> : null}
      <Text style={s.eyebrow}>ORIGINAL LISTING</Text>
      {bottles.map(raw => <Text key={raw} selectable style={s.secondary}>{raw}</Text>)}
    </View> : null}
  </View>;
}

const s = StyleSheet.create({
  details: { marginLeft: 15, paddingBottom: 16, gap: 14 },
  bottleList: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingTop: 14 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  bottleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bottleIcon: { width: 28, alignItems: 'center' }, bottleCopy: { flex: 1, minWidth: 0, gap: 4 },
  bottleName: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  secondary: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noticeText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primary: { minHeight: 46, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.accent, borderRadius: 8 },
  primaryText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 46, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  secondaryButtonText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 }, error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  sourceToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  source: { gap: 8, paddingBottom: 4 },
});

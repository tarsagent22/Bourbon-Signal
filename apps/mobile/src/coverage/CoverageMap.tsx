import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COVERAGE_STATES } from '../../../../shared/coverage-states';
import type { MobileCoverageState } from '../api/types';
import { colors } from '../theme';

const rows = [
  '_ AK _ _ _ _ _ _ _ _ _ ME',
  'WA ID MT ND MN _ _ _ _ _ VT NH',
  'OR NV WY SD WI MI _ _ _ NY MA _',
  'CA UT CO NE IA IL IN OH PA NJ CT RI',
  '_ AZ NM KS MO KY WV VA MD DE _ _',
  '_ _ OK AR TN NC SC _ DC _ _ _',
  'HI _ TX LA MS AL GA _ _ _ _ _',
  '_ _ _ _ _ _ FL _ _ _ _ _',
].map(row => row.split(' '));

const names = new Map<string, string>(COVERAGE_STATES.map(state => [state.code, state.name]));
const legend = [
  { coverage: 'strong', label: 'Strong', backgroundColor: colors.accent },
  { coverage: 'moderate', label: 'Moderate', backgroundColor: '#8D582C' },
  { coverage: 'sparse', label: 'Sparse', backgroundColor: '#514035' },
  { coverage: 'none', label: 'None', backgroundColor: colors.surfaceRaised },
] as const;

export function CoverageMap({ states, selected, onSelect }: {
  states: MobileCoverageState[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const byCode = new Map(states.map(state => [state.code, state]));
  return <View style={styles.map}>
    {rows.map((row, index) => <View key={index} style={styles.row}>
      {row.map((code, column) => {
        const state = byCode.get(code);
        if (!state) return <View key={column} style={styles.tile} />;

        const strength = legend.find(entry => entry.coverage === state.coverageStrength);
        return <Pressable
          key={code}
          accessibilityRole="button"
          accessibilityLabel={`${names.get(code)}, ${state.coverageStrengthLabel}`}
          accessibilityState={{ selected: code === selected }}
          onPress={() => onSelect(code)}
          style={[styles.tile, { backgroundColor: strength?.backgroundColor }, code === selected && styles.selected]}
        >
          <Text allowFontScaling={false} style={[styles.code, state.coverageStrength === 'strong' && styles.darkCode]}>{code}</Text>
        </Pressable>;
      })}
    </View>)}
    <View style={styles.legend}>
      {legend.map(entry => <View key={entry.coverage} style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: entry.backgroundColor }]} />
        <Text style={styles.legendLabel}>{entry.label}</Text>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  map: { gap: 3 },
  row: { flexDirection: 'row', gap: 2 },
  tile: { flex: 1, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  selected: { borderColor: colors.text },
  code: { color: colors.text, fontSize: 9, fontWeight: '700' },
  darkCode: { color: colors.background },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.muted },
  legendLabel: { color: colors.muted, fontSize: 11 },
});

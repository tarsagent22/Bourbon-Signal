import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { billingChoiceFor, MEMBERSHIP_COMPARISON_ROWS, planForTier } from "./membership-plans";

export function MembershipComparison() {
  const [freeExpanded, setFreeExpanded] = useState(false);
  const founderPrice = billingChoiceFor("bottled-in-bond");
  const freePlan = planForTier("free");

  return <View style={styles.section} testID="membership-comparison">
    <Text accessibilityRole="header" style={styles.title}>Compare features</Text>
    <View style={styles.header}>
      <Text style={[styles.featureCell, styles.headerLabel]}>Plan differences</Text>
      <Text style={[styles.valueCell, styles.headerLabel]}>Standard</Text>
      <Text style={[styles.valueCell, styles.headerLabel, styles.barrelLabel]}>Barrel</Text>
    </View>
    {MEMBERSHIP_COMPARISON_ROWS.map((row) => <View
      accessible
      accessibilityLabel={`${row.feature}. Standard: ${row.values.standard}. Barrel: ${row.values.barrel}.`}
      key={row.feature}
      style={styles.row}
    >
      <Text accessible={false} style={[styles.featureCell, styles.feature]}>{row.feature}</Text>
      <Text accessible={false} style={[styles.valueCell, styles.value]}>{row.values.standard}</Text>
      <Text accessible={false} style={[styles.valueCell, styles.value, styles.barrelValue]}>{row.values.barrel}</Text>
    </View>)}

    <View style={styles.shared}>
      <Text accessibilityRole="header" style={styles.sectionLabel}>Both plans include</Text>
      <Text style={styles.body}>Push, email & SMS alerts · Unlimited My Shelf · Full Community Signals + posting · Earn & redeem points</Text>
    </View>
    <View style={styles.founder}>
      <Text accessibilityRole="header" style={styles.founderTitle}>Founder · {founderPrice?.price}{founderPrice?.suffix}</Text>
      <Text style={styles.body}>Barrel benefits for life + Founder tag & numbered glass.</Text>
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={freeExpanded ? "Hide free limits" : "View free limits"}
      accessibilityState={{ expanded: freeExpanded }}
      aria-expanded={freeExpanded}
      onPress={() => setFreeExpanded((expanded) => !expanded)}
      style={({ pressed }) => [styles.freeToggle, pressed && styles.pressed]}
    >
      <View style={styles.freeHeading}>
        <Text style={styles.sectionLabel}>Staying free?</Text>
        <Text style={styles.body}>Preview, post & save. No alerts.</Text>
      </View>
      <Text accessible={false} style={styles.expand}>{freeExpanded ? "−" : "+"}</Text>
    </Pressable>
    {freeExpanded ? <View style={styles.freeDetails}>
      {freePlan?.features.map((feature) => <Text key={feature} style={styles.body}>• {feature}</Text>)}
      <Text style={styles.body}>No alerts. Paid membership required to redeem points.</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 14 },
  title: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "900", paddingBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 8 },
  headerLabel: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  barrelLabel: { color: colors.accent },
  row: { flexDirection: "row", alignItems: "center", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  featureCell: { flex: 1.4, minWidth: 0, paddingRight: 8 },
  valueCell: { flex: 1, minWidth: 0, paddingHorizontal: 3, textAlign: "center" },
  feature: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  value: { color: colors.text, fontSize: 13, lineHeight: 18 },
  barrelValue: { fontWeight: "700" },
  shared: { gap: 5, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  sectionLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  founder: { gap: 4, paddingVertical: 10, paddingHorizontal: 11, borderLeftColor: colors.accent, borderLeftWidth: 2, backgroundColor: colors.surfaceRaised },
  founderTitle: { color: colors.accent, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  freeToggle: { minHeight: 58, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  freeHeading: { flex: 1, gap: 3 },
  expand: { color: colors.accent, fontSize: 24, lineHeight: 28, width: 28, textAlign: "center" },
  freeDetails: { gap: 5, paddingBottom: 14 },
  pressed: { opacity: 0.72 },
});

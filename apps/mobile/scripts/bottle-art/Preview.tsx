import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { CellarBottleArtwork } from "../../src/components/CellarBottleArtwork";
import { CellarGlencairnSilhouette } from "../../src/components/CellarGlencairnSilhouette";
import { colors } from "../../src/theme";

const samples = [
  { label: "E.H. Taylor Small Batch", bottle: { bottleId: "eh-taylor-small-batch", bottleName: "E.H. Taylor Small Batch", canonicalKey: "e h taylor small batch" } },
  { label: "Russell's Reserve 10 Year", bottle: { bottleId: "russells-reserve-10", bottleName: "Russell's Reserve 10 Year", canonicalKey: "russell s reserve 10 year" } },
  { label: "Default bottle fallback", bottle: { bottleId: "old-forester-1910", bottleName: "Old Forester 1910", canonicalKey: "old forester 1910" } },
] as const;

export default function BottleArtPreview() {
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Bottle artwork preview</Text>
    <Text style={styles.detail}>Bounded shelf artwork with the standard owned and tasted-only fallbacks.</Text>
    <View style={styles.grid}>{samples.map(({ bottle, label }) => <View key={label} style={styles.card}><CellarBottleArtwork bottle={bottle} /><Text style={styles.label}>{label}</Text></View>)}</View>
    <View style={styles.tasted}><CellarGlencairnSilhouette /><Text style={styles.label}>Tasted-only Glencairn</Text></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 18 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: 148, minHeight: 176, alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: colors.surface },
  tasted: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: colors.surface },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "center" },
});

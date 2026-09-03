import { StyleSheet, Text, View } from "react-native";
import { shelfBottlePlan, type ShelfBottleVariant } from "../cellar/my-shelf-display";
import { colors } from "../theme";

const SHELF_ART_SCALE = 0.72;

export function MyShelfDisplay({ ownedBottleKeys, ownedCount, tastedOnlyCount }: {
  ownedBottleKeys: readonly string[];
  ownedCount: number;
  tastedOnlyCount: number;
}) {
  const plan = shelfBottlePlan(ownedBottleKeys);
  const lowerShelf = plan.slice(0, 7);
  const upperShelf = plan.slice(7);
  const description = `${ownedCount} bottle${ownedCount === 1 ? "" : "s"} owned and ${tastedOnlyCount} tasted only.`;

  return (
    <View accessibilityHint="Decorative summary; exact counts appear above." accessibilityLabel={`My Shelf. ${description}`} accessibilityRole="image" style={styles.display}>
      <View pointerEvents="none" style={styles.warmGlow} />
      <View pointerEvents="none" style={styles.sideShadowLeft} />
      <View pointerEvents="none" style={styles.sideShadowRight} />
      {upperShelf.length ? <ShelfRow entries={upperShelf} level="upper" /> : null}
      <ShelfRow entries={lowerShelf} level="lower" />
      {!plan.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>Your first bottle starts the shelf.</Text><Text style={styles.emptyDetail}>Owned bottles build the display over time.</Text></View> : null}
    </View>
  );
}

function ShelfRow({ entries, level }: {
  entries: ReturnType<typeof shelfBottlePlan>;
  level: "upper" | "lower";
}) {
  return <>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.bottleRow, level === "upper" ? styles.upperRow : styles.lowerRow]}>
      {entries.map((entry) => <ShelfBottle key={entry.key} variant={entry.variant} />)}
    </View>
    <View pointerEvents="none" style={[styles.shelfEdge, level === "upper" ? styles.upperShelf : styles.lowerShelf]}>
      <View style={styles.shelfHighlight} />
    </View>
  </>;
}

function ShelfBottle({ variant }: { variant: ShelfBottleVariant }) {
  const bodyWidth = Math.round(variant.bodyWidth * SHELF_ART_SCALE);
  const bodyHeight = Math.round(variant.bodyHeight * SHELF_ART_SCALE);
  const neckWidth = Math.round(variant.neckWidth * SHELF_ART_SCALE);
  const neckHeight = Math.round(variant.neckHeight * SHELF_ART_SCALE);
  const capWidth = Math.round(variant.capWidth * SHELF_ART_SCALE);
  const totalHeight = bodyHeight + neckHeight + 6;
  return (
    <View style={[styles.bottleFrame, { width: Math.max(bodyWidth, capWidth) + 4, height: totalHeight }]}>
      <View style={[styles.cap, { width: capWidth }]} />
      <View style={[styles.neck, { width: neckWidth, height: neckHeight, backgroundColor: variant.glassColor }]} />
      <View style={[
        styles.body,
        {
          width: bodyWidth,
          height: bodyHeight,
          borderTopLeftRadius: Math.max(1, Math.round(variant.shoulderRadius * SHELF_ART_SCALE)),
          borderTopRightRadius: Math.max(1, Math.round(variant.shoulderRadius * SHELF_ART_SCALE)),
          backgroundColor: variant.glassColor,
        },
      ]}>
        <View style={[styles.amber, { backgroundColor: variant.amberColor }]} />
        <View style={[styles.label, { width: Math.max(10, Math.round(variant.labelWidth * SHELF_ART_SCALE)) }]}><View style={styles.labelRule} /></View>
        <View style={styles.glassGlint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  display: {
    height: 140,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(196,148,58,0.30)",
    backgroundColor: "#15110D",
  },
  warmGlow: { position: "absolute", width: 190, height: 118, top: -34, left: "24%", borderRadius: 999, backgroundColor: "rgba(196,124,36,0.12)" },
  sideShadowLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: 18, backgroundColor: "rgba(0,0,0,0.18)" },
  sideShadowRight: { position: "absolute", top: 0, bottom: 0, right: 0, width: 18, backgroundColor: "rgba(0,0,0,0.18)" },
  bottleRow: { position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8 },
  upperRow: { bottom: 75, minHeight: 58 },
  lowerRow: { bottom: 16, minHeight: 58 },
  bottleFrame: { alignItems: "center", justifyContent: "flex-end" },
  cap: { height: 5, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: "#B58A47", borderColor: "rgba(255,231,187,0.35)", borderWidth: StyleSheet.hairlineWidth },
  neck: { borderLeftColor: "rgba(255,255,255,0.16)", borderLeftWidth: 1, borderRightColor: "rgba(0,0,0,0.28)", borderRightWidth: 1 },
  body: { position: "relative", overflow: "hidden", alignItems: "center", justifyContent: "center", borderColor: "rgba(214,173,107,0.44)", borderWidth: 1, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  amber: { position: "absolute", left: 1, right: 1, bottom: 1, height: "62%", opacity: 0.72, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  label: { height: 14, alignItems: "center", justifyContent: "center", borderRadius: 2, backgroundColor: "#D9C8A6", borderColor: "rgba(68,43,21,0.35)", borderWidth: StyleSheet.hairlineWidth },
  labelRule: { width: "58%", height: 2, borderRadius: 2, backgroundColor: colors.accentPressed },
  glassGlint: { position: "absolute", top: 4, left: 3, width: 2, height: "48%", borderRadius: 2, backgroundColor: "rgba(255,255,255,0.20)" },
  shelfEdge: { position: "absolute", left: 10, right: 10, height: 9, borderRadius: 3, backgroundColor: "#4B301D", borderBottomColor: "#25170F", borderBottomWidth: 3, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  upperShelf: { bottom: 67 },
  lowerShelf: { bottom: 8 },
  shelfHighlight: { height: 2, marginHorizontal: 3, marginTop: 1, borderRadius: 2, backgroundColor: "rgba(219,162,80,0.32)" },
  empty: { position: "absolute", left: 28, right: 28, bottom: 62, alignItems: "center", gap: 5 },
  emptyTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "800", textAlign: "center" },
  emptyDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "center" },
});

import { Image, StyleSheet, View } from "react-native";
import { CellarBottleSilhouette } from "./CellarBottleSilhouette";
import { resolveCellarBottleArtwork, type CellarBottleIdentity } from "./cellar-bottle-artwork";

const bottleArtwork = {
  "eh-taylor-small-batch": require("../../assets/bottles/eh-taylor-small-batch.png"),
  "russells-reserve-10": require("../../assets/bottles/russells-reserve-10.png"),
} as const;

export function CellarBottleArtwork({ bottle, size = "grid" }: {
  bottle: CellarBottleIdentity;
  size?: "grid" | "list";
}) {
  const artworkId = resolveCellarBottleArtwork(bottle);
  if (!artworkId) return <CellarBottleSilhouette />;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={size === "grid" ? styles.gridFrame : styles.listFrame}>
      <Image resizeMode="contain" source={bottleArtwork[artworkId]} style={size === "grid" ? styles.gridArtwork : styles.listArtwork} />
    </View>
  );
}

const styles = StyleSheet.create({
  gridFrame: { width: 80, height: 116, alignItems: "center", justifyContent: "center" },
  gridArtwork: { width: 80, height: 116 },
  listFrame: { width: 44, height: 62, alignItems: "center", justifyContent: "center" },
  listArtwork: { width: 44, height: 62 },
});

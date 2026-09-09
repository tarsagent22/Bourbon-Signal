import { Image, StyleSheet, View } from "react-native";
import { CellarBottleSilhouette } from "./CellarBottleSilhouette";
import { resolveCellarBottleArtwork, type CellarBottleIdentity } from "./cellar-bottle-artwork";

const bottleArtwork = {
  "henry-mckenna-10": require("../../assets/bottles/photos/henry-mckenna-10.png"),
  "eh-taylor-small-batch": require("../../assets/bottles/photos/eh-taylor-small-batch.png"),
  "1792-small-batch": require("../../assets/bottles/photos/1792-small-batch.png"),
  "penelope-riviera": require("../../assets/bottles/photos/penelope-riviera.png"),
  "buffalo-trace": require("../../assets/bottles/photos/buffalo-trace.png"),
  "russells-reserve-10": require("../../assets/bottles/photos/russells-reserve-10.png"),
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

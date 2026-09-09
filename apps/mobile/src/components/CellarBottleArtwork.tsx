import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useBottlePhoto } from "../bottle-photos/native";
import { groundedPhotoFrame, photoPresentationScale } from "../cellar/photo-presentation";
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
  const { uri, sha256, blocked } = useBottlePhoto(bottle);
  const frame = (scale: number) => groundedPhotoFrame(size === "grid" ? 80 : 44, size === "grid" ? 116 : 62, scale);
  const [failedUri, setFailedUri] = useState<string>();
  if (blocked || (!bottle.bottleId && !bottle.bottleName)) return <CellarBottleSilhouette />;
  if (uri && uri !== failedUri) return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={size === "grid" ? styles.gridFrame : styles.listFrame}>
      <Image key={uri} resizeMode="contain" source={{ uri, cache: "force-cache" }} onError={() => setFailedUri(uri)} style={frame(photoPresentationScale(sha256))} />
    </View>
  );
  const artworkId = resolveCellarBottleArtwork(bottle);
  if (!artworkId) return <CellarBottleSilhouette />;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={size === "grid" ? styles.gridFrame : styles.listFrame}>
      <Image resizeMode="contain" source={bottleArtwork[artworkId]} style={frame(artworkId === "1792-small-batch" ? photoPresentationScale('f0ea7ac8d8abde55fee08ba57de7daf5768b6978f8d13675db9e8130e437e09b') : 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  gridFrame: { width: 80, height: 116, alignItems: "center", justifyContent: "center" },
  gridArtwork: { width: 80, height: 116 },
  listFrame: { width: 44, height: 62, alignItems: "center", justifyContent: "center" },
  listArtwork: { width: 44, height: 62 },
});

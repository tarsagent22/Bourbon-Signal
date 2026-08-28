import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme";

const glencairnArtwork = require("../../assets/icons/cellar-glencairn.png");

export function CellarGlencairnSilhouette() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <Image resizeMode="contain" source={glencairnArtwork} style={styles.artwork} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 44, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  artwork: { width: 44, height: 62 },
});

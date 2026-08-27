import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function CellarGlencairnSilhouette() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <View style={styles.glass}>
        <View style={styles.rim} />
        <View style={styles.narrowMouth} />
        <View style={styles.shoulders} />
        <View style={styles.roundedBowl}>
          <View style={styles.amberPour} />
          <View style={styles.highlight} />
        </View>
        <View style={styles.solidBase} />
      </View>
    </View>
  );
}

const glassLine = "rgba(221, 210, 187, 0.78)";

const styles = StyleSheet.create({
  frame: { width: 44, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  glass: { width: 30, height: 50, alignItems: "center", justifyContent: "flex-start" },
  rim: { width: 15, height: 3, borderRadius: 2, borderWidth: 1.5, borderColor: glassLine, backgroundColor: "rgba(255,255,255,0.08)" },
  narrowMouth: { width: 12, height: 7, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: glassLine },
  shoulders: { width: 20, height: 8, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderTopWidth: 1.5, borderColor: glassLine, transform: [{ rotate: "180deg" }] },
  roundedBowl: { width: 28, height: 25, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: glassLine, borderBottomLeftRadius: 13, borderBottomRightRadius: 13, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  amberPour: { position: "absolute", bottom: 3, width: 22, height: 9, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: "rgba(184, 116, 38, 0.78)" },
  highlight: { position: "absolute", top: 4, left: 5, width: 2, height: 13, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.28)" },
  solidBase: { width: 18, height: 5, marginTop: 1, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderWidth: 1.5, borderColor: glassLine, backgroundColor: "rgba(221, 210, 187, 0.15)" },
});

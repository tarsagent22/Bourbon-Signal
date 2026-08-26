import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function CellarGlencairnSilhouette() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <View style={styles.glass}>
        <View style={styles.rim} />
        <View style={styles.flare} />
        <View style={styles.bowl}>
          <View style={styles.pour} />
          <View style={styles.glow} />
        </View>
        <View style={styles.stem} />
        <View style={styles.foot} />
      </View>
    </View>
  );
}

const glassBorder = "#8B7B68";

const styles = StyleSheet.create({
  frame: { width: 44, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  glass: { width: 34, height: 56, alignItems: "center", justifyContent: "flex-start" },
  rim: { width: 27, height: 3, borderRadius: 2, borderColor: glassBorder, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  flare: { width: 25, height: 10, marginTop: -1, borderColor: glassBorder, borderTopWidth: 0, borderLeftWidth: 2, borderRightWidth: 2, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  bowl: { width: 32, height: 27, marginTop: -2, overflow: "hidden", borderColor: glassBorder, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 15, borderBottomRightRadius: 15, alignItems: "center", justifyContent: "flex-end" },
  pour: { width: 27, height: 11, marginBottom: 2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: "rgba(214,154,74,0.72)" },
  glow: { position: "absolute", top: 3, left: 5, width: 2, height: 15, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.24)" },
  stem: { width: 7, height: 8, marginTop: -1, borderColor: glassBorder, borderLeftWidth: 1, borderRightWidth: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  foot: { width: 23, height: 5, borderRadius: 5, borderColor: glassBorder, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.08)" },
});

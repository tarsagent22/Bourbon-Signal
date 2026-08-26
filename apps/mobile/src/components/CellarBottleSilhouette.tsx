import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function CellarBottleSilhouette() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <View style={styles.bottle}>
        <View style={styles.stopper} />
        <View style={styles.lip} />
        <View style={styles.neck} />
        <View style={styles.shoulders} />
        <View style={styles.body}>
          <View style={styles.label}><View style={styles.labelRule} /></View>
          <View style={styles.glassGlow} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 44, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  bottle: { width: 30, height: 56, alignItems: "center", justifyContent: "flex-end" },
  stopper: { width: 12, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  lip: { width: 10, height: 3, marginTop: 1, borderRadius: 2, backgroundColor: colors.text },
  neck: { width: 8, height: 10, backgroundColor: "#6F5838" },
  shoulders: { width: 24, height: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: "#6F5838" },
  body: { width: 24, height: 30, overflow: "hidden", alignItems: "center", justifyContent: "center", borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: "#594329", borderColor: "#8B704A", borderWidth: 1 },
  label: { width: 17, height: 13, alignItems: "center", justifyContent: "center", borderRadius: 2, backgroundColor: "#D8C7A5" },
  labelRule: { width: 10, height: 2, borderRadius: 1, backgroundColor: colors.accentPressed },
  glassGlow: { position: "absolute", top: 2, left: 3, width: 2, height: 22, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
});

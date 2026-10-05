import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function MembershipTierIcon({ tier }: { tier: "standard" | "barrel" }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
    {tier === "standard" ? <Image source={require("../../assets/icons/cellar-glencairn.png")} resizeMode="contain" style={styles.glass} />
      : <View style={styles.barrel}>
        <View style={[styles.stave, { left: 10 }]} /><View style={[styles.stave, { right: 10 }]} />
        <View style={[styles.hoop, { top: 9 }]} /><View style={[styles.hoop, { bottom: 9 }]} />
        <View style={styles.bung} />
      </View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: 44, height: 50, alignItems: "center", justifyContent: "center" },
  glass: { width: 34, height: 46 },
  barrel: { width: 35, height: 43, backgroundColor: "#8c5729", borderWidth: 1.5, borderColor: colors.accent, borderRadius: 11, overflow: "hidden" },
  stave: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#d5a56a88" },
  hoop: { position: "absolute", left: 0, right: 0, height: 4, backgroundColor: "#3d342c", borderTopWidth: 1, borderTopColor: "#b39d80" },
  bung: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: "#422712", top: 18, left: 14 },
});

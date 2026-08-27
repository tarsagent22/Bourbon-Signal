import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function CellarGlencairnSilhouette() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <MaterialCommunityIcons color="#B88A52" name="glass-tulip" size={42} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 44, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
});

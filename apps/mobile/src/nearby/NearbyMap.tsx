import { Text, View } from "react-native";
import type { NearbyMapProps } from "./map-model";
export default function NearbyMap(_: NearbyMapProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#171411",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#B9AA98" }}>
        The interactive map is available in the iOS app.
      </Text>
    </View>
  );
}

import React from "react";
import { Text } from "react-native";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json";
export default function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  return <Text accessible={false} style={{ fontFamily: "MaterialCommunityIcons", fontSize: size, lineHeight: size+2, color }}>{String.fromCodePoint((glyphs as Record<string,number>)[name] || glyphs["medal-outline"])}</Text>;
}

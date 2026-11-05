import "@expo/metro-runtime";
import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { useFonts } from "expo-font";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
// @ts-expect-error Metro supplies require.context when this diagnostic entry is bundled.
const context = require.context("./routes");
function NativeHomeFixture() {
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    SecureStore.setItemAsync(
      "nearby-manual-place-v1",
      JSON.stringify({
        latitude: 33.3528,
        longitude: -111.789,
        label: "Gilbert, AZ",
      }),
    ).then(() => setSeeded(true));
  }, []);
  const [loaded, error] = useFonts({ Fraunces_700Bold });
  if (!seeded || (!loaded && !error)) return null;
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: "#100d0a" }}>
        <Text style={{ color: "#ffffff", paddingTop: 55, textAlign: "center" }}>
          NATIVE TEST · SYNTHETIC DATA
        </Text>
        <ExpoRoot context={context} />
      </View>
    </SafeAreaProvider>
  );
}
registerRootComponent(NativeHomeFixture);

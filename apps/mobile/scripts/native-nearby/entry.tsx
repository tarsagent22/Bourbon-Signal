import "@expo/metro-runtime";
import React, { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { useFonts } from "expo-font";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
// @ts-expect-error Metro supplies require.context when this diagnostic entry is bundled.
const context = require.context("./routes");
function NativeHomeFixture() {
  const [loaded, error] = useFonts({ Fraunces_700Bold });
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#100d0a",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "white" }}>
          NATIVE TEST: loading bundled font
        </Text>
      </View>
    );
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

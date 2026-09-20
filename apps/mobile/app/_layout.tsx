import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PurchasesProvider } from "../src/membership/PurchasesProvider";
import { StartupErrorBoundary } from "../src/startup/StartupErrorBoundary";
import { colors } from "../src/theme";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold });
  return <StartupErrorBoundary>
    {!fontsLoaded && !fontError ? null : !publishableKey ? (
      <View style={styles.configuration}><Text style={styles.title}>Bourbon Signal</Text><Text style={styles.message}>This development build is missing its Clerk publishable key.</Text></View>
    ) : (
      <SafeAreaProvider>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <PurchasesProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
            </Stack>
          </PurchasesProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    )}
  </StartupErrorBoundary>;
}

const styles = StyleSheet.create({
  configuration: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: colors.background, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
});

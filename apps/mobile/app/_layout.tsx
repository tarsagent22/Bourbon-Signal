import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { BrandLoading } from "../src/components/BrandLoading";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PurchasesProvider } from "../src/membership/PurchasesProvider";
import { StartupErrorBoundary } from "../src/startup/StartupErrorBoundary";
import { MobileApiProvider } from "../src/hooks/useMobileApi";
import { DeviceTimeZoneCapture } from "../src/startup/DeviceTimeZoneCapture";
import { useMobileApi } from "../src/hooks/useMobileApi";
import { reportRenderError } from "../src/startup/report-render-error";
import { colors, typeScale, fonts } from "../src/theme";
import { PushResponseHandler } from "../src/push/PushResponseHandler";

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 150, fade: true });
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold });
  useEffect(()=>{if(fontsLoaded || fontError)void SplashScreen.hideAsync();},[fontsLoaded,fontError]);
  return <StartupErrorBoundary>
    {!fontsLoaded && !fontError ? <BrandLoading /> : !publishableKey ? (
      <View style={styles.configuration}><Text style={styles.title}>Bourbon Signal</Text><Text style={styles.message}>This development build is missing its Clerk publishable key.</Text></View>
    ) : (
      <SafeAreaProvider>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <MobileApiProvider><PurchasesProvider>
            <DeviceTimeZoneCapture />
            <StatusBar style="light" />
            <SessionNavigation />
          </PurchasesProvider></MobileApiProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    )}
  </StartupErrorBoundary>;
}

function SessionNavigation() {
  const api=useMobileApi();
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  return <StartupErrorBoundary onRenderError={(error,stack)=>{if(isSignedIn)void reportRenderError(error,stack,api.reportNativeDiagnostic).catch(()=>{});}} resetOn={`${userId || ''}:${sessionId || ''}`}>
    <><Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Protected guard={Boolean(isLoaded && isSignedIn)}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
    <PushResponseHandler /></>
  </StartupErrorBoundary>;
}

const styles = StyleSheet.create({
  configuration: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: colors.background, gap: 12 },
  title: { color: colors.text, fontSize: typeScale.title, fontFamily: fonts.heading, fontWeight: "700" },
  message: { color: colors.muted, fontSize: typeScale.input, lineHeight: 24 },
});

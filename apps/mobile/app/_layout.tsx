import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createPendingPushNavigation } from "../src/push/push-navigation";
import { configureRadarNotifications, flushPendingPushRevocation } from "../src/push/push-registration";
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
            <StartupMaintenance />
            <PushResponseHandler />
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

function StartupMaintenance() {
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      configureRadarNotifications();
      void flushPendingPushRevocation().catch(() => false);
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  return null;
}

function PushResponseHandler() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const queue = useRef(createPendingPushNavigation());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let subscription: Notifications.Subscription | null = null;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      try {
        const request = response.notification?.request;
        if (!request) return;
        queue.current.receive(request.identifier, request.content.data);
        setRevision(value => value + 1);
      } catch {
        // Malformed notification data must never escape the startup callback.
      }
    };
    const timer = setTimeout(() => {
      if (!active) return;
      void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
      try {
        subscription = Notifications.addNotificationResponseReceivedListener(open);
      } catch {
        subscription = null;
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
      try { subscription?.remove(); } catch { /* native listener cleanup is best effort */ }
    };
  }, []);
  useEffect(() => {
    const route = queue.current.take(isLoaded && !!isSignedIn, true);
    if (!route) return;
    try { router.push(route); } catch { /* navigation may still be mounting */ }
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [isLoaded, isSignedIn, revision, router]);
  return null;
}

const styles = StyleSheet.create({
  configuration: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: colors.background, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
});

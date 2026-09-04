import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createPendingPushNavigation } from "../src/push/push-navigation";
import { colors } from "../src/theme";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold });
  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey) {
    return <View style={styles.configuration}><Text style={styles.title}>Bourbon Signal</Text><Text style={styles.message}>This development build is missing its Clerk publishable key.</Text></View>;
  }
  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <PushResponseHandler />
        <StatusBar style="light" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}

function PushResponseHandler() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const navigation = useRootNavigationState();
  const queue = useRef(createPendingPushNavigation());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      queue.current.receive(response.notification.request.identifier, response.notification.request.content.data);
      setRevision(value => value + 1);
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const route = queue.current.take(isLoaded && !!isSignedIn, !!navigation?.key);
    if (route) { router.push(route); void Notifications.clearLastNotificationResponseAsync().catch(() => {}); }
  }, [isLoaded, isSignedIn, navigation?.key, revision, router]);
  return null;
}

const styles = StyleSheet.create({
  configuration: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: colors.background, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
});

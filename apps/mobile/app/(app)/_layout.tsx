import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "../../src/theme";

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  if (!isSignedIn) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="signal/[id]" options={{ title: "Signal" }} />
      <Stack.Screen name="cellar/add" options={{ presentation: "modal", title: "Add bottle" }} />
      <Stack.Screen name="account/support" options={{ title: "Support" }} />
      <Stack.Screen name="account/privacy" options={{ title: "Privacy" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background } });

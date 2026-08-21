import { Tabs } from "expo-router";
import { colors } from "../../../src/theme";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false, sceneStyle: { backgroundColor: colors.background }, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted }}>
      <Tabs.Screen name="index" options={{ title: "Signals", headerTitle: "Bourbon Signal" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}

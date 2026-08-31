import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs, router } from "expo-router";
import type { ColorValue } from "react-native";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../../src/theme";
import { MEMBER_TABS } from "../../../src/navigation/member-tabs";

const byRoute = new Map(MEMBER_TABS.map((tab) => [tab.route, tab]));

function icon(route: "index" | "radar" | "post" | "cellar" | "hq") {
  const definition = byRoute.get(route)!;
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons color={color as string} name={definition.icon as never} size={size} />
  );
}

function BrandTitle() {
  return <Text numberOfLines={1} style={styles.brandTitle}>Bourbon Signal</Text>;
}

function AlertInboxButton() {
  return (
    <Pressable
      accessibilityHint="Opens Radar matches"
      accessibilityLabel="Open alert inbox"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => router.push({ pathname: "/(app)/(tabs)/radar", params: { section: "matches", request: Date.now().toString() } })}
      style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons color={colors.text} name="bell-outline" size={23} />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, paddingTop: 4 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarHideOnKeyboard: true,
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: BrandTitle, headerTitleAlign: "left", headerRight: AlertInboxButton, tabBarIcon: icon("index") }} />
      <Tabs.Screen name="radar" options={{ title: "Radar", tabBarIcon: icon("radar") }} />
      <Tabs.Screen name="post" options={{ title: "Post", tabBarIcon: icon("post") }} />
      <Tabs.Screen name="cellar" options={{ title: "Cellar", tabBarIcon: icon("cellar") }} />
      <Tabs.Screen name="hq" options={{ title: "Account", tabBarIcon: icon("hq") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  brandTitle: { color: colors.text, fontFamily: "Fraunces_700Bold", fontSize: 24, lineHeight: 30, letterSpacing: -0.35 },
  alertButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 },
  pressed: { opacity: 0.68 },
});

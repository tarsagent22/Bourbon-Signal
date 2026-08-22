import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { colors } from "../../../src/theme";
import { MEMBER_TABS } from "../../../src/navigation/member-tabs";

const byRoute = new Map(MEMBER_TABS.map((tab) => [tab.route, tab]));

function icon(route: "index" | "radar" | "post" | "cellar" | "hq") {
  const definition = byRoute.get(route)!;
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons color={color as string} name={definition.icon as never} size={route === "post" ? size + 5 : size} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "800" },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, paddingTop: 5 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Signals", headerTitle: "Bourbon Signal", tabBarIcon: icon("index") }} />
      <Tabs.Screen name="radar" options={{ title: "Radar", tabBarIcon: icon("radar") }} />
      <Tabs.Screen name="post" options={{ title: "Post", tabBarIcon: icon("post") }} />
      <Tabs.Screen name="cellar" options={{ title: "Cellar", tabBarIcon: icon("cellar") }} />
      <Tabs.Screen name="hq" options={{ title: "HQ", tabBarIcon: icon("hq") }} />
    </Tabs>
  );
}

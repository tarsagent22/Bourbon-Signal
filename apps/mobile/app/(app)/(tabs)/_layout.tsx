import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs, router } from "expo-router";
import type { PressableProps } from "react-native";
import type { ColorValue } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typeScale, fonts } from "../../../src/theme";
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

export function PostTabButton({onPress,onLongPress,accessibilityState,testID}:Pick<PressableProps,'onPress'|'onLongPress'|'accessibilityState'|'testID'>) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Post a bottle sighting" accessibilityHint="Opens the post composer" accessibilityState={accessibilityState} testID={testID} onPress={onPress} onLongPress={onLongPress} style={({pressed})=>[styles.postButton,pressed&&styles.pressed]}>
    <View style={styles.postCircle}><MaterialCommunityIcons name="plus" size={36} color="#21130b"/></View>
    <Text style={styles.postLabel}>Post</Text>
  </Pressable>;
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, paddingTop: 4, overflow: "visible" },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: typeScale.caption, fontWeight: "600" },
        tabBarHideOnKeyboard: true,
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: BrandTitle, headerTitleAlign: "left", headerRight: AlertInboxButton, headerTransparent: true, headerStyle: { backgroundColor: "transparent" }, tabBarIcon: icon("index") }} />
      <Tabs.Screen name="radar" options={{ title: "Radar", tabBarIcon: icon("radar") }} />
      <Tabs.Screen name="post" options={{ title: "Post", tabBarIcon: icon("post"), tabBarButton: props => <PostTabButton {...props}/> }} />
      <Tabs.Screen name="cellar" options={{ title: "My Shelf", headerShown: false, tabBarIcon: icon("cellar") }} />
      <Tabs.Screen name="hq" options={{ title: "Account", tabBarIcon: icon("hq") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  postButton: { flex: 1, alignItems: "center", justifyContent: "flex-start", marginTop: -19, minHeight: 76 },
  postCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ed7b25", borderWidth: 3, borderColor: colors.surface, alignItems: "center", justifyContent: "center", shadowColor: "#ed7b25", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  postLabel: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 2 },
  brandTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: typeScale.title, lineHeight: 40, letterSpacing: -0.35 },
  alertButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 },
  pressed: { opacity: 0.68 },
});

import { Stack } from "expo-router";
import { colors } from "../../src/theme";

export default function AuthLayout() {
  return <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShown: false }}>
    <Stack.Screen name="sign-in" />
    <Stack.Screen name="sign-up" />
  </Stack>;
}

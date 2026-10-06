import { useAuth } from "@clerk/expo";
import { Stack } from "expo-router";
import { useRef } from "react";
import { colors } from "../../src/theme";

export default function AppLayout() {
  const { userId, sessionId } = useAuth();
  const signedInIdentity = useRef("");
  if (userId && sessionId) signedInIdentity.current = `${userId}:${sessionId}`;
  // Root Stack.Protected removes the member routes and their history on logout.
  // Retain the last identity during dismissal, but reset for a new account.
  return (
    <Stack key={signedInIdentity.current} screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false, headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="signal/[id]" options={{ title: "Signal" }} />
      <Stack.Screen name="cellar/add" options={{ presentation: "modal", title: "Add bottle" }} />
      <Stack.Screen name="account/rewards" options={{ title: "Rewards & Badges", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="account/redeem" options={{ title: "Redeem reward", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="account/profile" options={{ title: "Edit profile", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="account/admin" options={{title:"Admin"}} />
      <Stack.Screen name="account/coverage" options={{title:"Coverage requests"}} />
      <Stack.Screen name="account/feedback" options={{title:"Feedback & Support"}} />
      <Stack.Screen name="account/support" options={{ title: "Support" }} />
      <Stack.Screen name="account/privacy" options={{ title: "Privacy" }} />
      <Stack.Screen name="account/delete" options={{ title: "Delete account" }} />
      <Stack.Screen name="account/terms" options={{ title: "Terms" }} />
      <Stack.Screen name="account/membership" options={{ title: "Membership", headerBackTitle: "Account", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="account/membership/[tier]" options={{ title: "Review membership", headerBackTitle: "Plans", headerBackButtonDisplayMode: "minimal" }} />
    </Stack>
  );
}

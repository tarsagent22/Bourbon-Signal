import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileApi } from "../src/hooks/useMobileApi";
import { MobileApiError } from "../src/api/client";
import { colors } from "../src/theme";

type Destination = "app" | "onboarding" | null;

export default function EntryScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useMobileApi();
  const [destination, setDestination] = useState<Destination>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setDestination(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setDestination(null);
    setError("");
    void api.getMobileOnboardingStatus({ fresh: true, signal: controller.signal })
      .then((status) => setDestination(status.completed ? "app" : "onboarding"))
      .catch(async (caught) => {
        if (controller.signal.aborted) return;
        if (caught instanceof MobileApiError && caught.status === 404) {
          try {
            await api.getMemberProfile({ fresh: true, signal: controller.signal });
            if (!controller.signal.aborted) setDestination("app");
            return;
          } catch (profileError) {
            if (controller.signal.aborted) return;
            caught = profileError;
          }
        }
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Account setup status could not be checked.");
        }
      });
    return () => controller.abort();
  }, [api, attempt, isLoaded, isSignedIn]);

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (destination === "app") return <Redirect href="/(app)/(tabs)" />;
  if (destination === "onboarding") return <Redirect href={{ pathname: "/(auth)/sign-up", params: { resume: "onboarding" } }} />;
  if (error) return <View style={styles.center}>
    <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
    <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
  </View>;
  return <Loading />;
}

function Loading() {
  return <View accessibilityLabel="Checking account setup" style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, gap: 16, padding: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: { minHeight: 48, minWidth: 140, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent },
  retryText: { color: colors.background, fontSize: 15, fontWeight: "900" },
});

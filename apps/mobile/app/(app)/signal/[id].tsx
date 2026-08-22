import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { Signal } from "../../../src/api/types";
import { presentSignal } from "../../../src/api/presentation";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMobileApi();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; if (!id) return; api.getSignal(id).then((result) => { if (active) setSignal(result.signal); }).catch((caught) => { if (active) setError(caught instanceof MobileApiError ? caught.message : "This Signal is temporarily unavailable."); }); return () => { active = false; }; }, [api, id]);
  const presented = signal ? presentSignal(signal) : null;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: "Signal" }} />
      {!signal && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {signal ? <>
        <Text style={styles.source}>{signal.source.label}</Text>
        <Text style={styles.title}>{signal.bottle.name}</Text>
        <View style={styles.rule} />
        <Detail label="Location" value={presented?.address || presented?.location || signal.location.state || "Location not specified"} />
        <Detail label="Observed" value={new Date(signal.timing.displayAt).toLocaleString()} />
        {presented?.availability ? <Detail label="Availability" value={presented.availability} /> : null}
        {presented?.price ? <Detail label="Price" value={presented.price} /> : null}
        {presented?.quantity ? <Detail label="Quantity" value={presented.quantity} /> : null}
        {presented?.summary ? <Detail label="Note" value={presented.summary} /> : null}
        {presented?.caveat ? <Detail label="Caveat" value={presented.caveat} /> : null}
        {signal.source.type === "member" ? <Text style={styles.disclaimer}>Member observations report what someone saw and are not verified retailer inventory.</Text> : null}
      </> : null}
    </ScrollView>
  );
}
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 22, gap: 18, backgroundColor: colors.background }, source: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" }, rule: { height: 1, backgroundColor: colors.border }, detail: { gap: 5 }, label: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 }, value: { color: colors.text, fontSize: 16, lineHeight: 23 }, error: { color: colors.danger }, disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 },
});

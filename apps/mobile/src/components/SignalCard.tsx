import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import { presentSignal } from "../api/presentation";
import { colors } from "../theme";

export function SignalCard({ signal, onPress }: { signal: Signal; onPress: () => void }) {
  const presented = presentSignal(signal);
  const details = [presented.price, presented.quantity, presented.availability].filter(Boolean).join(" · ");
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topline}>
        <Text style={styles.source}>{signal.source.label}</Text>
        <Text style={styles.time}>{new Date(signal.timing.displayAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.bottle}>{signal.bottle.name}</Text>
      <Text style={styles.location}>{presented.location || signal.location.state || "Location not specified"}</Text>
      {details ? <Text style={styles.details}>{details}</Text> : null}
      {presented.summary ? <Text numberOfLines={2} style={styles.note}>{presented.summary}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 7 },
  pressed: { backgroundColor: colors.surfaceRaised },
  topline: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  source: { color: colors.accent, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  time: { color: colors.muted, fontSize: 12 },
  bottle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  location: { color: colors.text, fontSize: 14 },
  details: { color: colors.muted, fontSize: 13 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});

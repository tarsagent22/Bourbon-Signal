import { Pressable, Text, View } from "react-native";
import { colors, typeScale } from "../theme";
export function DraftNotice({ notice, error, hasContent, onDiscard, compact = false }: { notice: string; error: string; hasContent: boolean; onDiscard: () => void; compact?: boolean }) {
  if (!hasContent && !notice && !error) return null;
  return <View style={{ gap: 8 }}>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: typeScale.small }}>{error}</Text> : null}
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.muted, fontSize: compact ? typeScale.caption : typeScale.small, flex: 1 }}>{compact && /restored/i.test(notice) ? "Draft restored" : notice || "Your draft stays on this device."}</Text>
      <Pressable accessibilityRole="button" onPress={onDiscard} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.accent, fontSize: typeScale.small, fontWeight: "700" }}>Discard draft</Text></Pressable>
    </View>
  </View>;
}

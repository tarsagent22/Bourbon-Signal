import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function ScreenIntro({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description: string; aside?: ReactNode }) {
  return (
    <View style={styles.intro}>
      <View style={styles.introCopy}>
        <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {aside}
    </View>
  );
}

export function MemberCard({ children, accent = false }: PropsWithChildren<{ accent?: boolean }>) {
  return <View style={[styles.card, accent && styles.cardAccent]}>{children}</View>;
}

export function SectionTitle({ children, detail }: PropsWithChildren<{ detail?: string }>) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function DataRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <MemberCard>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </MemberCard>
  );
}

export function LoadingState({ label = "Loading member data…" }: { label?: string }) {
  return <View accessibilityLabel={label} style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.emptyDetail}>{label}</Text></View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <MemberCard>
      <Text accessibilityRole="alert" style={styles.error}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </MemberCard>
  );
}

export const memberScreenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 44, gap: 18 },
  section: { gap: 10 },
});

const styles = StyleSheet.create({
  intro: { gap: 12, paddingTop: 4 },
  introCopy: { gap: 6, flex: 1 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.35 },
  title: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.5 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 520 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 10 },
  cardAccent: { borderColor: colors.accent },
  sectionHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sectionDetail: { color: colors.muted, fontSize: 12 },
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: colors.muted, fontSize: 14, flex: 1 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyDetail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 12 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retry: { alignSelf: "flex-start", borderColor: colors.border, borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" },
  retryText: { color: colors.text, fontWeight: "700" },
  pressed: { backgroundColor: colors.surfaceRaised },
});

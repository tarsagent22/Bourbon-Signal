import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typeScale, layout, typography } from "../theme";

export function PageHeading({ title, eyebrow, description }: { title: string; eyebrow?: string; description?: string }) {
  return <View style={styles.pageHeading}>
    <View accessible={false} style={styles.brandRule}><View style={styles.brandRuleAccent} /></View>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {description ? <Text style={styles.description}>{description}</Text> : null}
  </View>;
}

export function OpenSection({ children }: PropsWithChildren) {
  return <View style={styles.openSection}>{children}</View>;
}

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

export function EmptyState({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <MemberCard>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.retry}><Text style={styles.retryText}>{actionLabel}</Text></Pressable> : null}
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
  content: { padding: layout.gutter, paddingBottom: 44, gap: layout.sectionGap },
  section: { gap: 10 },
});

const styles = StyleSheet.create({
  pageHeading: { gap: 6, paddingBottom: 4 },
  brandRule: { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  brandRuleAccent: { width: 32, height: 2, backgroundColor: colors.accent, marginTop: -1 },
  openSection: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 16 },
  intro: { gap: 12, paddingTop: 4 },
  introCopy: { gap: 6, flex: 1 },
  eyebrow: { color: colors.accent, ...typography.eyebrow },
  title: { color: colors.text, ...typography.page },
  description: { color: colors.muted, ...typography.body, maxWidth: 520 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: layout.cardRadius, padding: 16, gap: 10 },
  cardAccent: { borderColor: colors.accent },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: colors.text, ...typography.section, flexShrink: 1 },
  sectionDetail: { color: colors.muted, fontSize: typeScale.small },
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: colors.muted, fontSize: typeScale.body, flex: 1 },
  rowValue: { color: colors.text, fontSize: typeScale.body, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  emptyTitle: { color: colors.text, fontSize: typeScale.input, fontWeight: "700" },
  emptyDetail: { color: colors.muted, fontSize: typeScale.small, lineHeight: 19 },
  loading: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 12 },
  error: { color: colors.danger, fontSize: typeScale.body, lineHeight: 20 },
  retry: { alignSelf: "flex-start", borderColor: colors.border, borderWidth: 1, borderRadius: layout.controlRadius, minHeight: layout.controlHeight, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" },
  retryText: { color: colors.text, fontWeight: "700" },
  pressed: { backgroundColor: colors.surfaceRaised },
});

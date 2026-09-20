import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { memberScreenStyles } from "../../../../src/components/MemberScreen";
import {
  billingChoiceFor,
  planForTier,
  type BillingInterval,
} from "../../../../src/membership/membership-plans";
import { colors } from "../../../../src/theme";

export default function MembershipPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tier?: string; interval?: string }>();
  const plan = planForTier(params.tier);
  const requestedInterval: BillingInterval = params.interval === "annual" ? "annual" : "monthly";
  const [interval, setInterval] = useState<BillingInterval>(plan?.lifetime ? "lifetime" : requestedInterval);

  if (!plan) {
    return <View style={styles.missing}>
      <Text style={styles.missingTitle}>Membership not found</Text>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>Back to memberships</Text>
      </Pressable>
    </View>;
  }

  const price = billingChoiceFor(plan.tier, interval);
  const isSubscription = plan.tier === "standard" || plan.tier === "barrel";
  const renewalCopy = interval === "annual"
    ? "Auto-renews annually until canceled."
    : "Auto-renews monthly until canceled.";
  const billingDisclosure = Platform.OS === "ios"
    ? "Payment is charged to your Apple Account after confirmation. Manage or cancel in App Store subscriptions."
    : "Payment is charged through your app store account after confirmation. Manage or cancel in your store subscriptions.";

  return <ScrollView contentContainerStyle={styles.content} style={memberScreenStyles.screen}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{isSubscription ? "APPLE SUBSCRIPTION" : plan.eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" style={styles.title}>{plan.chooserName || plan.name}</Text>
      <Text style={styles.description}>{plan.description}</Text>
    </View>

    {isSubscription ? <View accessibilityRole="tablist" style={styles.intervalControl}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: interval === "monthly" }}
        onPress={() => setInterval("monthly")}
        style={[styles.intervalOption, interval === "monthly" && styles.intervalSelected]}
      >
        <Text style={[styles.intervalText, interval === "monthly" && styles.intervalTextSelected]}>Monthly</Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: interval === "annual" }}
        onPress={() => setInterval("annual")}
        style={[styles.intervalOption, interval === "annual" && styles.intervalSelected]}
      >
        <Text style={[styles.intervalText, interval === "annual" && styles.intervalTextSelected]}>Annual</Text>
      </Pressable>
    </View> : null}

    <View style={styles.purchaseCard}>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{price?.price || "$0"}</Text>
        <Text style={styles.priceSuffix}>{price?.suffix}</Text>
      </View>
      {isSubscription ? <>
        <Text style={styles.renewal}>{renewalCopy}</Text>
        {interval === "annual" && price?.valueNote ? <Text style={styles.valueNote}>{price.valueNote} compared with monthly billing</Text> : null}
      </> : <Text style={styles.renewal}>One payment. No recurring renewal.</Text>}
    </View>

    <View style={styles.featuresCard}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>What you get</Text>
      {plan.features.slice(0, 4).map((feature) => <View key={feature} style={styles.featureRow}>
        <Text accessible={false} style={styles.check}>✓</Text>
        <Text style={styles.feature}>{feature}</Text>
      </View>)}
    </View>

    {isSubscription ? <Text style={styles.legalCopy}>{billingDisclosure}</Text> : null}
    <View style={styles.legalLinks}>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/terms")} style={styles.legalButton}>
        <Text style={styles.legalText}>Terms of Use</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/privacy")} style={styles.legalButton}>
        <Text style={styles.legalText}>Privacy Policy</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 34, gap: 12 },
  missing: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  missingTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  hero: { gap: 4, paddingTop: 2 },
  eyebrow: { color: colors.accent, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 28, lineHeight: 32, fontWeight: "900", letterSpacing: -0.5 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  intervalControl: { flexDirection: "row", borderRadius: 13, padding: 4, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  intervalOption: { minHeight: 44, flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  intervalSelected: { backgroundColor: colors.surfaceRaised, borderColor: "rgba(214,154,74,0.65)", borderWidth: 1 },
  intervalText: { color: colors.muted, fontSize: 13, fontWeight: "800", textAlign: "center" },
  intervalTextSelected: { color: colors.text },
  purchaseCard: { backgroundColor: "#1B1611", borderColor: colors.accent, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 13, gap: 4 },
  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  price: { color: colors.text, fontSize: 36, lineHeight: 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceSuffix: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  renewal: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  valueNote: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  featuresCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, paddingHorizontal: 15, paddingVertical: 13, gap: 7 },
  sectionTitle: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "900", marginBottom: 1 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  check: { color: colors.success, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  feature: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  legalCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 8 },
  legalLinks: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 12 },
  legalButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  legalText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  secondaryButton: { minHeight: 46, borderColor: colors.border, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});

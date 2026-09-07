import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import {
  PAID_MEMBERSHIP_PLANS,
  billingChoiceFor,
  membershipChoiceAccessibilityLabel,
  membershipActionFor,
  planForTier,
  trialDisclosureFor,
  type BillingInterval,
  type MembershipTier,
} from "./membership-plans";

type MembershipPlanChooserProps = {
  interval: BillingInterval;
  currentTier: MembershipTier | null;
  standardTrialEligible: boolean;
  barrelTrialEligible: boolean;
  onSelect: (tier: Exclude<MembershipTier, "free">) => void;
};

export function MembershipPlanChooser({
  interval,
  currentTier,
  standardTrialEligible,
  barrelTrialEligible,
  onSelect,
}: MembershipPlanChooserProps) {
  const [freeExpanded, setFreeExpanded] = useState(false);
  const comparisonPlans = PAID_MEMBERSHIP_PLANS.filter((plan) => plan.tier === "standard" || plan.tier === "barrel");
  const founder = planForTier("bottled-in-bond");
  const founderPrice = billingChoiceFor("bottled-in-bond");
  const freePlan = planForTier("free");

  return <View style={styles.chooser} testID="membership-plan-chooser">
    <View style={styles.planStack}>
      {comparisonPlans.map((plan) => {
        const price = billingChoiceFor(plan.tier, interval);
        const trialEligible = plan.tier === "standard" ? standardTrialEligible : barrelTrialEligible;
        const action = currentTier
          ? membershipActionFor(currentTier, plan.tier)
          : { label: `Review ${plan.chooserName || plan.name}` };
        const trialDisclosure = trialDisclosureFor(plan.tier, interval, trialEligible);
        return <Pressable
          accessibilityRole="button"
          accessibilityLabel={membershipChoiceAccessibilityLabel(plan.tier, interval, trialEligible, action.label)}
          key={plan.tier}
          onPress={() => onSelect(plan.tier)}
          style={({ pressed }) => [styles.plan, plan.tier === "barrel" && styles.barrelPlan, currentTier === plan.tier && styles.currentPlan, pressed && styles.pressed]}
        >
          <View style={styles.planHeader}>
            <View style={styles.planIdentity}>
              <View style={styles.nameRow}>
                <Text accessibilityRole="header" style={styles.planName}>{plan.name}</Text>
                {plan.tier === "barrel" ? <View style={styles.unlimitedBadge}><Text style={styles.unlimitedText}>UNLIMITED</Text></View> : null}
                {currentTier === plan.tier ? <View style={styles.currentBadge}><Text style={styles.currentText}>CURRENT</Text></View> : null}
              </View>
              <Text style={styles.bestFor}>{plan.bestFor}</Text>
            </View>
            <View style={styles.priceBlock}>
              <Text style={styles.price}>{price?.price}</Text>
              <Text style={styles.priceSuffix}>{price?.suffix}</Text>
            </View>
          </View>

          <View style={styles.featureList}>
            {plan.chooserFeatures?.map((feature) => <View key={feature} style={styles.featureRow}>
              <Text accessible={false} style={styles.featureMark}>—</Text>
              <Text style={styles.feature}>{feature}</Text>
            </View>)}
          </View>

          {trialDisclosure ? <Text style={styles.trial}>{trialDisclosure}</Text> : null}

          <Text accessible={false} style={[styles.reviewText, plan.tier === "barrel" && styles.reviewTextPrimary]}>{action.label}  ›</Text>
        </Pressable>;
      })}
    </View>

    <Text style={styles.sharedBenefits}>Every paid plan also includes unlimited My Shelf, full Community access and points redemption.</Text>

    {founder ? <Pressable
      accessibilityRole="button"
      accessibilityLabel={membershipChoiceAccessibilityLabel("bottled-in-bond", "lifetime", false, "Review Founder")}
      onPress={() => onSelect("bottled-in-bond")}
      style={({ pressed }) => [styles.founder, currentTier === founder.tier && styles.currentPlan, pressed && styles.pressed]}
    >
      <View style={styles.founderCopy}>
        <View style={styles.nameRow}>
          <Text accessibilityRole="header" style={styles.founderName}>{founder.chooserName}</Text>
          {currentTier === founder.tier ? <View style={styles.currentBadge}><Text style={styles.currentText}>CURRENT</Text></View> : null}
        </View>
        <Text style={styles.founderPromise}>{founder.bestFor}, plus your permanent Founder number and numbered glass. Lifetime access · no trial.</Text>
      </View>
      <View style={styles.founderPriceBlock}>
        <Text style={styles.founderPrice}>{founderPrice?.price}</Text>
        <Text style={styles.founderSuffix}>once</Text>
        <Text accessible={false} style={styles.founderArrow}>›</Text>
      </View>
    </Pressable> : null}

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={freeExpanded ? "Hide free limits" : "See free limits"}
      accessibilityState={{ expanded: freeExpanded }}
      aria-expanded={freeExpanded}
      onPress={() => setFreeExpanded((expanded) => !expanded)}
      style={({ pressed }) => [styles.freeToggle, pressed && styles.pressed]}
    >
      <View style={styles.freeCopy}>
        <Text style={styles.freeTitle}>Prefer free?</Text>
        <Text style={styles.freeSummary}>Preview recent intelligence, post sightings, save 10 bottles and earn points—without alerts.</Text>
      </View>
      <Text accessible={false} style={styles.expand}>{freeExpanded ? "−" : "+"}</Text>
    </Pressable>
    {freeExpanded ? <View style={styles.freeDetails}>
      {freePlan?.features.map((feature) => <Text key={feature} style={styles.freeDetail}>• {feature}</Text>)}
      <Text style={styles.freeDetail}>No alerts. Paid membership is required to redeem points.</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  chooser: { gap: 9 },
  planStack: { gap: 9 },
  plan: { gap: 7, borderColor: colors.border, borderWidth: 1, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 11 },
  barrelPlan: { borderColor: "rgba(214,154,74,0.72)", backgroundColor: "#1B1611" },
  currentPlan: { borderColor: colors.success },
  planHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  planIdentity: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  planName: { color: colors.text, fontSize: 20, lineHeight: 24, fontWeight: "900" },
  bestFor: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  unlimitedBadge: { borderRadius: 999, backgroundColor: colors.accent, paddingHorizontal: 7, paddingVertical: 3 },
  unlimitedText: { color: colors.background, fontSize: 8, lineHeight: 11, fontWeight: "900", letterSpacing: 0.7 },
  currentBadge: { borderRadius: 999, backgroundColor: "rgba(126,173,131,0.18)", paddingHorizontal: 7, paddingVertical: 3 },
  currentText: { color: colors.success, fontSize: 8, lineHeight: 11, fontWeight: "900", letterSpacing: 0.65 },
  priceBlock: { flexDirection: "row", alignItems: "baseline", flexShrink: 0 },
  price: { color: colors.text, fontSize: 25, lineHeight: 29, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceSuffix: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  featureList: { gap: 2 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  featureMark: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  feature: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  trial: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  reviewText: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  reviewTextPrimary: { color: colors.accent },
  sharedBenefits: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 3 },
  founder: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, borderLeftColor: colors.accent, borderLeftWidth: 3, backgroundColor: colors.surfaceRaised, paddingHorizontal: 12, paddingVertical: 9 },
  founderCopy: { flex: 1, minWidth: 0, gap: 4 },
  founderName: { color: colors.accent, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  founderPromise: { color: colors.text, fontSize: 13, lineHeight: 18 },
  founderPriceBlock: { alignItems: "flex-end" },
  founderPrice: { color: colors.text, fontSize: 23, lineHeight: 27, fontWeight: "900", fontVariant: ["tabular-nums"] },
  founderSuffix: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  founderArrow: { color: colors.accent, fontSize: 20, lineHeight: 22 },
  freeToggle: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 7, paddingHorizontal: 3 },
  freeCopy: { flex: 1, minWidth: 0, gap: 2 },
  freeTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  freeSummary: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  expand: { color: colors.accent, fontSize: 24, lineHeight: 28, width: 28, textAlign: "center" },
  freeDetails: { gap: 4, paddingHorizontal: 3, paddingBottom: 6 },
  freeDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.72 },
});

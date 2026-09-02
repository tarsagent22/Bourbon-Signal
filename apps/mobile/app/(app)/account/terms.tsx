import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../../src/theme";

const sections = [
  ["1. What Bourbon Signal does", [
    "Bourbon Signal provides informational tools that help users monitor public, retailer-published, and government-published bourbon availability signals. These signals may include store-level inventory reports, shipment records, release windows, product listings, and other source-derived availability indicators.",
    "Bourbon Signal does not sell, ship, broker, reserve, purchase, or deliver alcoholic beverages. We are not a retailer, wholesaler, marketplace, delivery service, or alcohol licensee.",
  ]],
  ["2. Eligibility and responsible use", [
    "You must be at least 21 years old to use Bourbon Signal. By using the service, you confirm that you are of legal drinking age in your jurisdiction.",
    "You are responsible for complying with all federal, state, and local laws related to alcohol purchases, possession, transportation, and consumption. Store policies, purchase limits, eligibility rules, and local alcohol laws may vary.",
  ]],
  ["3. Data accuracy and availability", [
    "Bourbon Signal is a best-effort intelligence service. Source data can be delayed, incomplete, inaccurate, stale, duplicated, changed, removed, or interpreted differently by the original source. Inventory may sell out quickly. Shipment data may not mean a bottle is available on a specific store shelf.",
    "You should always verify availability, price, purchase limits, location, and eligibility directly with the retailer or official source before driving, making a purchase decision, or relying on a signal.",
    "Signal labels are intended to reduce confusion but do not guarantee availability or accuracy.",
  ]],
  ["4. Accounts and subscriptions", [
    "Certain features require an account. You are responsible for keeping your account information accurate and secure and for all activity that occurs through your account.",
    "Paid subscriptions renew automatically unless canceled before the next billing period. Pricing, plans, trial periods, and features may change over time, but we will make reasonable efforts to communicate material changes before they affect active subscribers.",
    "Payment processing is handled by third-party providers. We do not store your full payment card details on our servers.",
  ]],
  ["5. Alerts and notifications", [
    "Alerts are not guaranteed to be delivered instantly or at all. Delivery can be affected by source availability, data refresh timing, email providers, SMS carriers, spam filters, user preferences, service outages, and other factors outside our control.",
    "An alert is not a guarantee that a bottle is currently available, reserved, fairly priced, or purchasable by you. Always verify before acting on an alert.",
  ]],
  ["6. SMS/text message terms", [
    "If you opt into Bourbon Signal SMS alerts, you agree to receive automated text messages at the mobile number you provide. Message frequency varies, and message and data rates may apply.",
    "Consent to receive SMS messages is not required to create an account or purchase a subscription. Reply STOP to opt out or HELP for help. Carriers are not liable for delayed or undelivered messages.",
  ]],
  ["7. Billing, cancellations, and refunds", [
    "Paid Bourbon Signal plans are billed in advance on a recurring basis according to the plan you select. By subscribing, you authorize the applicable payment provider to charge your payment method for recurring subscription fees and applicable taxes or fees.",
    "You may cancel a recurring subscription at any time through the account controls provided by the payment platform or by contacting support. Cancellation stops future renewals but does not automatically refund charges already paid.",
    "Monthly or annual members generally retain access through the end of the current paid billing period after cancellation. Founding member purchases are non-refundable and provide lifetime membership access according to the founding member offer terms.",
    "Bourbon Signal subscriptions are generally non-refundable once a billing period begins, except where required by law or at our discretion.",
  ]],
  ["8. Acceptable use", [
    "You may not abuse, disrupt, reverse engineer, scrape at unreasonable volume, resell, republish, or commercially exploit Bourbon Signal data without written permission. You may not use the service to violate laws, harass retailers or staff, or interfere with source systems.",
    "We may suspend or terminate access if we believe your use creates legal, security, operational, or reputational risk.",
  ]],
  ["9. Intellectual property", [
    "Bourbon Signal, including its design, software, data transformations, signal labels, analysis, and original content, is owned by Todd Digital Ventures LLC or its licensors. Source names, retailer names, product names, and trademarks belong to their respective owners.",
    "Reference to a retailer, government agency, product, brand, or source does not imply partnership, sponsorship, endorsement, or affiliation unless expressly stated.",
  ]],
  ["10. Disclaimers and limitation of liability", [
    "The service is provided as-is and as-available. To the fullest extent permitted by law, we disclaim warranties of accuracy, availability, merchantability, fitness for a particular purpose, and non-infringement.",
    "To the fullest extent permitted by law, Todd Digital Ventures LLC and Bourbon Signal will not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages, or for decisions made based on signals, alerts, prices, availability, or source data.",
  ]],
  ["11. Changes to these Terms", [
    "We may update these Terms as Bourbon Signal evolves. The updated date below indicates the latest revision. Continued use after changes means you accept the updated Terms.",
  ]],
] as const;

export default function TermsScreen() {
  return <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>TERMS OF SERVICE</Text>
      <Text accessibilityRole="header" style={styles.title}>Terms of Service</Text>
      <Text style={styles.updated}>Updated June 24, 2026</Text>
      <Text style={styles.intro}>These Terms govern your access to Bourbon Signal, including the website, mobile app, Intel feed, Bottle Check, alert tools, subscriptions, and related services. Bourbon Signal is operated by Todd Digital Ventures LLC.</Text>
    </View>
    {sections.map(([heading, paragraphs]) => <View key={heading} style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{heading}</Text>
      {paragraphs.map((paragraph) => <Text key={paragraph} selectable style={styles.body}>{paragraph}</Text>)}
    </View>)}
    <View style={styles.contact}><Text accessibilityRole="header" style={styles.sectionTitle}>Questions</Text><Text style={styles.body}>Contact support@bourbonsignal.com from your account email.</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 52, gap: 14 },
  hero: { paddingVertical: 8, gap: 8 },
  eyebrow: { color: colors.accent, fontSize: 11, lineHeight: 15, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.4 },
  updated: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 17, gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  contact: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, borderWidth: 1, borderRadius: 16, padding: 17, gap: 8 },
});

import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../../src/theme";

const sections = [
  ["1. Information we collect", [
    "Account information, including name, email address, authentication identifiers, and account metadata provided through our authentication provider.",
    "Subscription and billing information, including plan and payment status, customer identifiers, invoices, and related metadata from processors such as Stripe. We do not store full card numbers on our servers.",
    "Preferences you save, including states, markets, boards, cities, counties, bottles, alert settings, notification channels, SMS consent, and mobile phone number.",
    "Community sighting content, your chosen display name, and your numbered Founder or Member tag are publicly visible when you post a Community Signal.",
    "Usage, device, browser, approximate IP-based location, log, error, performance, communication, feedback, support, survey, and message-delivery information.",
  ]],
  ["2. How we use information", [
    "We use information to operate Bourbon Signal, personalize feeds and alerts, manage subscriptions, provide support, improve data quality, prevent abuse, troubleshoot errors, measure performance, and comply with legal obligations.",
    "We may use aggregated or de-identified information to understand coverage quality, source health, market demand, and product usage.",
  ]],
  ["3. Alerts and communications", [
    "If you opt in, we may send email, SMS, or app notifications related to saved preferences, your account, subscription, or product updates. You can unsubscribe from marketing email, reply STOP to SMS, or adjust available alert controls.",
    "Transactional billing, security, account, and important service messages may still be sent when necessary.",
  ]],
  ["4. Service providers", [
    "We use providers for hosting, authentication, payment processing, email, SMS, analytics, error monitoring, and storage. Examples may include Vercel, Clerk, Stripe, Twilio, and other infrastructure vendors. They process information on our behalf or under their own terms and policies.",
  ]],
  ["5. SMS privacy", [
    "When you opt into SMS alerts, we use your phone number, consent status, alert preferences, and delivery metadata to send and manage messages.",
    "SMS information may be shared with Twilio, mobile carriers, and delivery or compliance providers as necessary. We do not sell or share SMS opt-in information, phone numbers, or consent status for third-party marketing.",
    "Reply STOP to opt out or HELP for help. Limited consent, opt-out, and delivery records may be retained for compliance and service operations.",
  ]],
  ["6. Cookies and similar technologies", [
    "The website and service providers may use cookies, local storage, pixels, and similar technologies for authentication, security, preferences, analytics, performance, and functionality. Browser controls may affect website features.",
  ]],
  ["7. Sharing and disclosure", [
    "We do not sell personal information in the ordinary sense of selling a customer list for money. We may share information with service providers, at your direction, to complete transactions, comply with law, protect rights and safety, or during a business transfer.",
    "We may publish or share aggregated, de-identified, or non-personal data that does not reasonably identify you.",
  ]],
  ["8. Data retention", [
    "We retain information as reasonably necessary to operate the service, maintain records, comply with law, resolve disputes, enforce agreements, and improve Bourbon Signal. Periods vary by data type and business need.",
  ]],
  ["9. Your choices", [
    "You may update account details, preferences, and alerts where controls are provided. Privacy questions and account-deletion requests can be sent to support@bourbonsignal.com from your account email.",
    "After cancellation or deletion, limited records may remain for accounting, fraud prevention, legal compliance, and legitimate business operations.",
  ]],
  ["10. Security", [
    "We use reasonable technical and organizational safeguards. No online service can guarantee perfect security. Use a strong password and protect access to your email and account.",
  ]],
  ["11. Age-restricted content", [
    "Bourbon Signal is intended for people at least 21 years old. We do not knowingly collect personal information from children or users under the legal drinking age.",
  ]],
  ["12. Changes to this policy", [
    "We may update this policy as Bourbon Signal evolves. The date below identifies the latest revision. Material changes will be communicated where required or practical.",
  ]],
] as const;

export default function PrivacyScreen() {
  return <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>PRIVACY POLICY</Text>
      <Text accessibilityRole="header" style={styles.title}>Your information at Bourbon Signal</Text>
      <Text style={styles.updated}>Updated August 21, 2026</Text>
      <Text style={styles.intro}>This policy explains how Bourbon Signal, operated by Todd Digital Ventures LLC, collects and uses information when you use the website or mobile app, create an account, subscribe, save preferences, contact support, or receive alerts.</Text>
    </View>
    {sections.map(([heading, paragraphs]) => <View key={heading} style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{heading}</Text>
      {paragraphs.map((paragraph) => <Text key={paragraph} selectable style={styles.body}>{paragraph}</Text>)}
    </View>)}
    <View style={styles.contact}><Text accessibilityRole="header" style={styles.sectionTitle}>Privacy contact</Text><Text style={styles.body}>Contact support@bourbonsignal.com from your account email with privacy questions or requests.</Text></View>
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

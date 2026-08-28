import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../../src/theme";

const SUPPORT_EMAIL = "support@bourbonsignal.com";

export default function SupportScreen() {
  return <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>MEMBER SUPPORT</Text>
      <Text accessibilityRole="header" style={styles.title}>How can we help?</Text>
      <Text style={styles.intro}>Support information stays inside the app. Include your account email and a short description so we can find the right records.</Text>
    </View>

    <SupportCard title="Contact support">
      <Text style={styles.body}>Email the address below from the email associated with your Bourbon Signal account.</Text>
      <Text selectable selectionColor={colors.accent} style={styles.email}>{SUPPORT_EMAIL}</Text>
    </SupportCard>

    <SupportCard title="Membership and billing">
      <Text style={styles.body}>Include the membership shown on Account and the date or invoice involved. Never send a full card number or password.</Text>
    </SupportCard>

    <SupportCard title="Shipping and rewards">
      <Text style={styles.body}>Include the reward name or referral-glass issue. Shipping details are requested only when fulfillment is available for your account.</Text>
    </SupportCard>

    <SupportCard title="Account deletion">
      <Text style={styles.body}>Send “Account deletion request” from your account email. We will verify the request and explain any subscription, contribution, fraud-prevention, or legally required records that must be retained.</Text>
      <Text style={styles.note}>Do not include passwords, payment-card details, or other secrets.</Text>
    </SupportCard>
  </ScrollView>;
}

function SupportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  hero: { paddingVertical: 8, gap: 8 },
  eyebrow: { color: colors.accent, fontSize: 11, lineHeight: 15, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.45 },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 17, gap: 9 },
  cardTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  email: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  note: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: "600" },
});

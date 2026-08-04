import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { CORE_PAID_MEMBERSHIP_PLANS } from "@/lib/membership-plan-catalog";
import { FREE_MEMBER_DAY_TWO_PREHEADER } from "@/lib/free-member-day-two";

export interface FreeMemberDayTwoEmailProps {
  firstName?: string | null;
  unsubscribeUrl: string;
  baseUrl?: string;
}

export function FreeMemberDayTwoEmail({
  firstName,
  unsubscribeUrl,
  baseUrl = "https://www.bourbonsignal.com",
}: FreeMemberDayTwoEmailProps) {
  const greeting = firstName?.trim() ? `Hey ${firstName.trim()},` : "Hey,";
  const pricingUrl = new URL("/pricing?source=day2_free_followup", baseUrl).toString();
  const coverageUrl = new URL("/coverage?source=day2_free_followup", baseUrl).toString();

  return (
    <Html style={{ backgroundColor: "#0f0c09" }}>
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{FREE_MEMBER_DAY_TWO_PREHEADER}</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Section style={masthead}>
            <Text style={brand}>BOURBON SIGNAL<span style={brandDot}>.</span></Text>
            <Text style={eyebrow}>YOUR ACCOUNT · DAY TWO</Text>
            <Text style={headline}>Make Bourbon Signal work harder for your hunt</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>{greeting}</Text>
            <Text style={paragraph}>
              Chandler here — thanks for giving Bourbon Signal a look. I built it to help bourbon hunters spend less time guessing and get more useful information about bottles, releases, and activity near them.
            </Text>
            <Text style={paragraph}>
              Your free account includes Release Radar, three Bottle Checks, and previews of the Drop Feed and Member Sightings. If you want to turn those previews into a more focused hunting plan, a paid membership unlocks the full feed, saved areas and bottle watchlists, and alerts for qualifying signals.
            </Text>

            <Text style={sectionTitle}>MEMBERSHIP OPTIONS</Text>
            {CORE_PAID_MEMBERSHIP_PLANS.map((plan) => (
              <Section key={plan.tier} style={planCard}>
                <Text style={planName}>{plan.name}</Text>
                <Text style={planPrice}>{plan.monthlyPrice}/month <span style={priceDivider}>or</span> {plan.annualPrice}/year</Text>
                <Text style={planDescription}>{plan.description}</Text>
                {plan.features.map((feature) => (
                  <Text key={feature} style={featureLine}><span style={check}>✓</span> {feature}</Text>
                ))}
              </Section>
            ))}

            <Section style={primaryAction}>
              <Button href={pricingUrl} style={button}>Compare membership options</Button>
            </Section>

            <Section style={coverageCard}>
              <Text style={coverageTitle}>Want better coverage near you?</Text>
              <Text style={coverageCopy}>
                Tell me where you hunt. Coverage requests help prioritize the next boards, cities, counties, and stores Bourbon Signal works to add.
              </Text>
              <Link href={coverageUrl} style={coverageLink}>Request coverage →</Link>
            </Section>

            <Text style={reassurance}>
              No pressure—your free account stays free, and you can keep using the tools already available to you.
            </Text>
            <Text style={signature}>Thanks again,<br />Chandler<br /><span style={signatureBrand}>Bourbon Signal</span></Text>
          </Section>

          <Section style={footerWrap}>
            <Text style={footer}>
              Bourbon Signal is intended for users 21+. We do not sell alcohol. Availability signals may change quickly, and you should verify with the store before driving or making a purchase decision.
            </Text>
            <Text style={footer}>
              Don&apos;t want Bourbon Signal update emails? <Link href={unsubscribeUrl} style={footerLink}>Unsubscribe</Link>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  margin: 0,
  padding: "24px 10px",
  backgroundColor: "#0f0c09",
  color: "#f5edd6",
  fontFamily: "Arial, Helvetica, sans-serif",
};
const shell: React.CSSProperties = {
  width: "100%",
  maxWidth: "620px",
  margin: "0 auto",
  overflow: "hidden",
  backgroundColor: "#15100c",
  border: "1px solid #493521",
  borderRadius: "18px",
};
const masthead: React.CSSProperties = { padding: "30px 28px 28px", backgroundColor: "#15100c", borderBottom: "1px solid #493521" };
const brand: React.CSSProperties = { margin: "0 0 22px", color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "25px", fontWeight: 700, letterSpacing: "0.04em" };
const brandDot: React.CSSProperties = { color: "#d49a2e" };
const eyebrow: React.CSSProperties = { margin: "0 0 14px", color: "#d8a84f", fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em" };
const headline: React.CSSProperties = { margin: 0, color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "35px", fontWeight: 700, lineHeight: 1.16 };
const content: React.CSSProperties = { padding: "30px 28px 26px", backgroundColor: "#15100c" };
const paragraph: React.CSSProperties = { margin: "0 0 17px", color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 };
const sectionTitle: React.CSSProperties = { margin: "30px 0 12px", color: "#d8a84f", fontSize: "10px", fontWeight: 700, letterSpacing: "0.18em" };
const planCard: React.CSSProperties = { margin: "0 0 13px", padding: "20px", overflow: "hidden", backgroundColor: "#211811", border: "1px solid #4e3924", borderRadius: "12px" };
const planName: React.CSSProperties = { margin: "0 0 6px", color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "23px", fontWeight: 700 };
const planPrice: React.CSSProperties = { margin: "0 0 10px", color: "#e2ad4e", fontSize: "14px", fontWeight: 700 };
const priceDivider: React.CSSProperties = { color: "#9e8e78", fontWeight: 400 };
const planDescription: React.CSSProperties = { margin: "0 0 12px", color: "#cfc1aa", fontSize: "13px", lineHeight: 1.55 };
const featureLine: React.CSSProperties = { margin: "7px 0", color: "#ded3bd", fontSize: "13px", lineHeight: 1.5 };
const check: React.CSSProperties = { color: "#d8a84f", fontWeight: 700 };
const primaryAction: React.CSSProperties = { margin: "25px 0 30px", textAlign: "center" };
const button: React.CSSProperties = { display: "block", padding: "15px 22px", backgroundColor: "#d49a2e", borderRadius: "9px", color: "#171009", fontSize: "14px", fontWeight: 800, textAlign: "center", textDecoration: "none" };
const coverageCard: React.CSSProperties = { margin: "0 0 24px", padding: "20px", overflow: "hidden", backgroundColor: "#1b1510", border: "1px solid #3d3023", borderRadius: "12px" };
const coverageTitle: React.CSSProperties = { margin: "0 0 8px", color: "#f0e5cf", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "20px", fontWeight: 700 };
const coverageCopy: React.CSSProperties = { margin: "0 0 11px", color: "#c9bda8", fontSize: "13px", lineHeight: 1.6 };
const coverageLink: React.CSSProperties = { color: "#e2ad4e", fontSize: "13px", fontWeight: 700, textDecoration: "none" };
const reassurance: React.CSSProperties = { margin: "0 0 22px", color: "#ded3bd", fontSize: "14px", lineHeight: 1.65 };
const signature: React.CSSProperties = { margin: 0, color: "#ded3bd", fontSize: "14px", lineHeight: 1.65 };
const signatureBrand: React.CSSProperties = { color: "#d8a84f", fontWeight: 700 };
const footerWrap: React.CSSProperties = { padding: "21px 28px 24px", backgroundColor: "#100d0a", borderTop: "1px solid #35291e" };
const footer: React.CSSProperties = { margin: "0 0 8px", color: "#91836f", fontSize: "10px", lineHeight: 1.6 };
const footerLink: React.CSSProperties = { color: "#b99454", textDecoration: "underline" };

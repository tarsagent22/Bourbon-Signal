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
import { FREE_MEMBER_DAY_TWO_PREHEADER } from "@/lib/free-member-day-two";

export interface FreeMemberDayTwoEmailProps {
  firstName?: string | null;
  unsubscribeUrl: string;
  baseUrl?: string;
}

export function FreeMemberDayTwoEmail({
  unsubscribeUrl,
  baseUrl = "https://www.bourbonsignal.com",
}: FreeMemberDayTwoEmailProps) {
  const pricingUrl = new URL("/pricing?source=day2_trial", baseUrl).toString();
  const coverageUrl = new URL("/coverage?source=day2_trial", baseUrl).toString();

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
            <Text style={eyebrow}>YOUR FIRST WEEK</Text>
            <Text style={headline}>Try the full experience for 7 days</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>Hey,</Text>
            <Text style={paragraph}>
              Chandler here — by now you&apos;ve had a little time to look around Bourbon Signal. Your free account isn&apos;t going away. You can keep checking the Drop Feed preview, posting Member Sightings, using Bottle Checker and the Coverage Map, and earning Signal Points.
            </Text>
            <Text style={paragraph}>
              If you want to see whether the paid tools actually help your bourbon hunting, monthly Standard Proof and Barrel Proof memberships now include a <strong style={strong}>7-day free trial</strong>.
            </Text>

            <Section style={planCard}>
              <Text style={planKicker}>STANDARD PROOF</Text>
              <Text style={planTitle}>Full feed and personalized alerts</Text>
              <Text style={planCopy}>Track up to 15 bottles across five alert areas, get email or text alerts, and use the complete Drop Feed and filters.</Text>
              <Text style={planPrice}>7 days free, then $3/month.</Text>
            </Section>

            <Section style={planCardLast}>
              <Text style={planKicker}>BARREL PROOF</Text>
              <Text style={planTitle}>Unlimited tracking and deeper member tools</Text>
              <Text style={planCopy}>Remove bottle and area limits, build your collection, and unlock your taste profile and bottle recommendations.</Text>
              <Text style={planPrice}>7 days free, then $6/month.</Text>
            </Section>

            <Text style={trialTerms}>
              The trial is available once per account on monthly plans. After 7 days, your membership continues at the selected monthly price unless you cancel. Annual and lifetime plans do not include a trial.
            </Text>

            <Section style={primaryAction}>
              <Button href={pricingUrl} style={button}>Start a 7-day free trial</Button>
            </Section>

            <Section style={coverageCard}>
              <Text style={coverageTitle}>Want better coverage near you?</Text>
              <Text style={coverageCopy}>
                Tell me where you hunt. Coverage requests help prioritize the next boards, cities, counties, and stores Bourbon Signal works to add.
              </Text>
              <Link href={coverageUrl} style={coverageLink}>Request coverage →</Link>
            </Section>

            <Text style={signatureThanks}>Thanks again,</Text>
            <Text style={signatureName}>Chandler</Text>
            <Text style={signatureBrand}>Bourbon Signal</Text>
          </Section>

          <Section style={footerWrap}>
            <Text style={socialCopy}>
              For updates and community conversations, <Link href="https://www.facebook.com/share/g/1BTYhwxSwC/" style={socialLink}>join the Bourbon Signal Facebook group</Link> or <Link href="https://www.instagram.com/bourbonsignal" style={socialLink}>follow Bourbon Signal on Instagram</Link>.
            </Text>
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
  borderRadius: "18px",
};
const masthead: React.CSSProperties = { padding: "30px 28px 27px", backgroundColor: "#15100c", borderBottom: "1px solid #493521" };
const brand: React.CSSProperties = { margin: 0, color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "24px", fontWeight: 700, letterSpacing: "0.035em", whiteSpace: "nowrap" };
const brandDot: React.CSSProperties = { color: "#d49a2e" };
const eyebrow: React.CSSProperties = { margin: "22px 0 0", color: "#d7a449", fontSize: "10px", fontWeight: 800, letterSpacing: "0.14em" };
const headline: React.CSSProperties = { margin: "9px 0 0", color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "34px", fontWeight: 700, lineHeight: 1.16 };
const content: React.CSSProperties = { padding: "29px 28px 27px", backgroundColor: "#15100c" };
const paragraph: React.CSSProperties = { margin: "0 0 17px", color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 };
const strong: React.CSSProperties = { color: "#f4e7c9" };
const planCard: React.CSSProperties = { margin: "3px 0 10px", padding: "19px", backgroundColor: "#1b1510", border: "1px solid #3d3023", borderRadius: "12px" };
const planCardLast: React.CSSProperties = { ...planCard, margin: "0 0 20px" };
const planKicker: React.CSSProperties = { margin: "0 0 7px", color: "#d7a449", fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em" };
const planTitle: React.CSSProperties = { margin: "0 0 7px", color: "#f0e5cf", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "20px", fontWeight: 700, lineHeight: 1.25 };
const planCopy: React.CSSProperties = { margin: 0, color: "#c9bda8", fontSize: "13px", lineHeight: 1.6 };
const planPrice: React.CSSProperties = { margin: "11px 0 0", color: "#f0d99b", fontSize: "13px", fontWeight: 700 };
const trialTerms: React.CSSProperties = { margin: 0, color: "#a99c88", fontSize: "12px", lineHeight: 1.6 };
const primaryAction: React.CSSProperties = { margin: "25px 0 28px", textAlign: "center" };
const button: React.CSSProperties = { display: "block", padding: "15px 22px", backgroundColor: "#dca12e", borderRadius: "9px", color: "#171009", fontSize: "14px", fontWeight: 800, textAlign: "center", textDecoration: "none" };
const coverageCard: React.CSSProperties = { margin: "0 0 24px", padding: "19px", overflow: "hidden", backgroundColor: "#1b1510", border: "1px solid #3d3023", borderRadius: "12px" };
const coverageTitle: React.CSSProperties = { margin: "0 0 7px", color: "#f0e5cf", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "19px", fontWeight: 700, lineHeight: 1.25 };
const coverageCopy: React.CSSProperties = { margin: "0 0 10px", color: "#c9bda8", fontSize: "13px", lineHeight: 1.6 };
const coverageLink: React.CSSProperties = { color: "#e2ad4e", fontSize: "13px", fontWeight: 700, textDecoration: "none" };
const signatureThanks: React.CSSProperties = { margin: "0 0 10px", color: "#ded3bd", fontSize: "14px", lineHeight: 1.65 };
const signatureName: React.CSSProperties = { margin: "0 0 2px", color: "#ded3bd", fontSize: "14px", lineHeight: 1.35 };
const signatureBrand: React.CSSProperties = { margin: 0, color: "#d8a84f", fontSize: "14px", fontWeight: 700, lineHeight: 1.35 };
const footerWrap: React.CSSProperties = { padding: "21px 28px 24px", backgroundColor: "#100d0a", borderTop: "1px solid #35291e" };
const socialCopy: React.CSSProperties = { margin: "0 0 13px", color: "#d8cdbb", fontSize: "12px", lineHeight: 1.6 };
const socialLink: React.CSSProperties = { color: "#d8a84f", textDecoration: "underline" };
const footer: React.CSSProperties = { margin: "0 0 8px", color: "#91836f", fontSize: "10px", lineHeight: 1.6 };
const footerLink: React.CSSProperties = { color: "#b99454", textDecoration: "underline" };

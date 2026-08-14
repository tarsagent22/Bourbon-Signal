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

const FREE_FEATURES = ["Drop Feed", "Member Sightings", "Bottle Checker", "Coverage Map"];
const UPGRADE_FEATURES = [
  "Personalized alerts",
  "Full drop feed and filters",
  "Saved watchlists",
  "Your collection",
  "DNA and bottle recommendations",
];

export function FreeMemberDayTwoEmail({
  unsubscribeUrl,
  baseUrl = "https://www.bourbonsignal.com",
}: FreeMemberDayTwoEmailProps) {
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
            <Text style={headline}>Make Bourbon Signal work harder for you</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>Hey,</Text>
            <Text style={paragraph}>
              Chandler here — thanks for giving Bourbon Signal a look. I built it to help bourbon hunters spend less time guessing and get more useful information about bottles, releases, and activity near them.
            </Text>
            <Text style={paragraph}>
              The promise of Bourbon Signal is not that you’ll score a Pappy or some BTACs - that’s a promise nobody can honestly make. It’s that it’ll help you find those slightly elusive bottles that you love to crack on a regular basis — think E.H. Taylor, Elijah Craig, Weller, 1792, Eagle Rare, Henry McKenna, and many more. These are bottle signals that we pick up regularly.
            </Text>
            <Text style={paragraph}>
              What we’re actually doing is compiling a massive amount of data across multiple states organized into one filterable feed. Then, to make it even easier, we send you alerts via text or email when bottles pop up that match your preferences.
            </Text>

            <Text style={listLead}>Your free account includes limited use of:</Text>
            <ul style={list}>
              {FREE_FEATURES.map((feature) => <li key={feature} style={listItem}>{feature}</li>)}
            </ul>

            <Text style={listLead}>Upgraded memberships can add:</Text>
            <ul style={list}>
              {UPGRADE_FEATURES.map((feature) => <li key={feature} style={listItem}>{feature}</li>)}
            </ul>

            <Text style={paragraph}>
              If you want to turn those previews into a more focused hunting plan, upgrading your membership unlocks Bourbon Signal’s best features.
            </Text>

            <Section style={primaryAction}>
              <Button href={pricingUrl} style={button}>Compare membership options</Button>
            </Section>

            <Section style={coverageCard}>
              <Text style={coverageTitle}>Want better coverage near you?</Text>
              <Text style={coverageCopy}>
                Tell us where you hunt. Coverage requests help prioritize the next boards, cities, counties, and stores Bourbon Signal works to add.
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
const masthead: React.CSSProperties = { padding: "30px 28px 28px", backgroundColor: "#15100c", borderBottom: "1px solid #493521" };
const brand: React.CSSProperties = { margin: "0 0 22px", color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "25px", fontWeight: 700, letterSpacing: "0.04em" };
const brandDot: React.CSSProperties = { color: "#d49a2e" };
const headline: React.CSSProperties = { margin: 0, color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "35px", fontWeight: 700, lineHeight: 1.16 };
const content: React.CSSProperties = { padding: "30px 28px 26px", backgroundColor: "#15100c" };
const paragraph: React.CSSProperties = { margin: "0 0 17px", color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 };
const listLead: React.CSSProperties = { margin: "0 0 7px", color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 };
const list: React.CSSProperties = { margin: "0 0 17px", paddingLeft: "38px", color: "#ded3bd", fontSize: "15px" };
const listItem: React.CSSProperties = { margin: 0, padding: 0, lineHeight: 1.15 };
const primaryAction: React.CSSProperties = { margin: "25px 0 30px", textAlign: "center" };
const button: React.CSSProperties = { display: "block", padding: "15px 22px", backgroundColor: "#dca12e", borderRadius: "9px", color: "#171009", fontSize: "14px", fontWeight: 800, textAlign: "center", textDecoration: "none" };
const coverageCard: React.CSSProperties = { margin: "0 0 24px", padding: "20px", overflow: "hidden", backgroundColor: "#1b1510", border: "1px solid #3d3023", borderRadius: "12px" };
const coverageTitle: React.CSSProperties = { margin: "0 0 8px", color: "#f0e5cf", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "20px", fontWeight: 700 };
const coverageCopy: React.CSSProperties = { margin: "0 0 11px", color: "#c9bda8", fontSize: "13px", lineHeight: 1.6 };
const coverageLink: React.CSSProperties = { color: "#e2ad4e", fontSize: "13px", fontWeight: 700, textDecoration: "none" };
const signatureThanks: React.CSSProperties = { margin: "0 0 10px", color: "#ded3bd", fontSize: "14px", lineHeight: 1.65 };
const signatureName: React.CSSProperties = { margin: "0 0 2px", color: "#ded3bd", fontSize: "14px", lineHeight: 1.35 };
const signatureBrand: React.CSSProperties = { margin: 0, color: "#d8a84f", fontSize: "14px", fontWeight: 700, lineHeight: 1.35 };
const footerWrap: React.CSSProperties = { padding: "21px 28px 24px", backgroundColor: "#100d0a", borderTop: "1px solid #35291e" };
const socialCopy: React.CSSProperties = { margin: "0 0 14px", color: "#d8cdbb", fontSize: "12px", lineHeight: 1.6 };
const socialLink: React.CSSProperties = { color: "#d8a84f", textDecoration: "underline" };
const footer: React.CSSProperties = { margin: "0 0 8px", color: "#91836f", fontSize: "10px", lineHeight: 1.6 };
const footerLink: React.CSSProperties = { color: "#b99454", textDecoration: "underline" };

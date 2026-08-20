import * as React from "react";
import { Body, Button, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";

export interface LowCoverageCommunityEmailProps {
  firstName?: string | null;
  stateCode: string;
  stateName: string;
  coverageUrl: string;
  sightingsUrl: string;
  unsubscribeUrl: string;
}

export function LowCoverageCommunityEmail({ firstName, stateName, coverageUrl, sightingsUrl, unsubscribeUrl }: LowCoverageCommunityEmailProps) {
  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  return (
    <Html style={{ backgroundColor: "#0f0c09" }}>
      <Head><meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" /></Head>
      <Preview>Tell us which stores and areas matter most, and help nearby hunters with Member Sightings.</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Section style={masthead}>
            <Text style={brand}>BOURBON SIGNAL<span style={brandDot}>.</span></Text>
            <Text style={eyebrow}>LOCAL COVERAGE</Text>
            <Text style={headline}>Help shape coverage in {stateName}</Text>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>{greeting}</Text>
            <Text style={paragraph}>
              Bourbon Signal coverage in {stateName} is still growing, and I&apos;d like your input on where we should focus next.
            </Text>
            <Text style={paragraph}>
              If there&apos;s a store, city, or area you want us to monitor, tell me here. Your request helps prioritize the next sources we work to add.
            </Text>
            <Section style={primaryAction}>
              <Button href={coverageUrl} style={button}>Request coverage</Button>
            </Section>
            <Section style={sightingCard}>
              <Text style={cardTitle}>Found something worth sharing?</Text>
              <Text style={cardCopy}>
                Post a Member Sighting when you see a hard-to-get bottle. Sightings help other local hunters when retailer inventory is incomplete, unpublished, or not confirmed.
              </Text>
              <Link href={sightingsUrl} style={textLink}>Post a Member Sighting →</Link>
            </Section>
            <Text style={signature}>Thanks,<br />Chandler<br /><strong style={signatureBrand}>Bourbon Signal</strong></Text>
          </Section>
          <Section style={footerWrap}>
            <Text style={footer}>Bourbon Signal is intended for users 21+. We do not sell alcohol. Sightings and availability signals may change quickly; verify details when possible before making a purchase decision.</Text>
            <Text style={footer}>You&apos;re receiving this because you created a Bourbon Signal account. <Link href={unsubscribeUrl} style={footerLink}>Unsubscribe</Link>.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = { margin: 0, padding: "24px 10px", backgroundColor: "#0f0c09", color: "#f5edd6", fontFamily: "Arial, Helvetica, sans-serif" };
const shell: React.CSSProperties = { width: "100%", maxWidth: "620px", margin: "0 auto", overflow: "hidden", backgroundColor: "#15100c", borderRadius: "18px" };
const masthead: React.CSSProperties = { padding: "30px 28px 27px", backgroundColor: "#15100c", borderBottom: "1px solid #493521" };
const brand: React.CSSProperties = { margin: 0, color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "24px", fontWeight: 700, letterSpacing: "0.035em", whiteSpace: "nowrap" };
const brandDot: React.CSSProperties = { color: "#d49a2e" };
const eyebrow: React.CSSProperties = { margin: "22px 0 0", color: "#d7a449", fontSize: "10px", fontWeight: 800, letterSpacing: "0.14em" };
const headline: React.CSSProperties = { margin: "9px 0 0", color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "34px", fontWeight: 700, lineHeight: 1.16 };
const content: React.CSSProperties = { padding: "29px 28px 27px", backgroundColor: "#15100c" };
const paragraph: React.CSSProperties = { margin: "0 0 17px", color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 };
const primaryAction: React.CSSProperties = { margin: "24px 0 26px", textAlign: "center" };
const button: React.CSSProperties = { display: "block", padding: "15px 22px", backgroundColor: "#dca12e", borderRadius: "9px", color: "#171009", fontSize: "14px", fontWeight: 800, textAlign: "center", textDecoration: "none" };
const sightingCard: React.CSSProperties = { margin: "0 0 24px", padding: "19px", backgroundColor: "#1b1510", border: "1px solid #3d3023", borderRadius: "12px" };
const cardTitle: React.CSSProperties = { margin: "0 0 8px", color: "#f0e5cf", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "19px", fontWeight: 700, lineHeight: 1.3 };
const cardCopy: React.CSSProperties = { margin: "0 0 11px", color: "#c9bda8", fontSize: "13px", lineHeight: 1.6 };
const textLink: React.CSSProperties = { color: "#e2ad4e", fontSize: "13px", fontWeight: 700, textDecoration: "none" };
const signature: React.CSSProperties = { margin: 0, color: "#ded3bd", fontSize: "14px", lineHeight: 1.55 };
const signatureBrand: React.CSSProperties = { color: "#d8a84f" };
const footerWrap: React.CSSProperties = { padding: "21px 28px 24px", backgroundColor: "#100d0a", borderTop: "1px solid #35291e" };
const footer: React.CSSProperties = { margin: "0 0 8px", color: "#91836f", fontSize: "10px", lineHeight: 1.6 };
const footerLink: React.CSSProperties = { color: "#b99454", textDecoration: "underline" };

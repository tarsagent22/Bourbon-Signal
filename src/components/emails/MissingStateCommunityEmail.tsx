import * as React from "react";
import { Body, Button, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";

export interface MissingStateCommunityEmailProps {
  firstName?: string | null;
  setupUrl: string;
  unsubscribeUrl: string;
}

export function MissingStateCommunityEmail({ firstName, setupUrl, unsubscribeUrl }: MissingStateCommunityEmailProps) {
  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  return (
    <Html style={{ backgroundColor: "#0f0c09" }}>
      <Head><meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" /></Head>
      <Preview>Tell us where you hunt and help shape Bourbon Signal coverage.</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Section style={masthead}>
            <Text style={brand}>BOURBON SIGNAL<span style={brandDot}>.</span></Text>
            <Text style={eyebrow}>YOUR LOCAL HUNT</Text>
            <Text style={headline}>Where do you hunt for bourbon?</Text>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>{greeting}</Text>
            <Text style={paragraph}>
              I want Bourbon Signal to be useful where you actually shop. Tell us which state you hunt most often, then share any stores, cities, or areas you want us to prioritize.
            </Text>
            <Section style={primaryAction}>
              <Button href={setupUrl} style={button}>Tell us where you hunt</Button>
            </Section>
            <Section style={sightingCard}>
              <Text style={cardTitle}>Help the community. Earn Signal Points.</Text>
              <Text style={cardCopy}>
                Member Sightings help nearby hunters when retailer inventory is incomplete, unpublished, or not confirmed. Eligible sightings earn 10–30 Signal Points based on rarity, plus opportunities for badges and streak bonuses.
              </Text>
              <Text style={cardCopyLast}>
                You can use those points in our growing rewards catalog as new redemption options are added.
              </Text>
            </Section>
            <Text style={paragraph}>
              Once you choose your state, you can preview what Bourbon Signal currently supports and tell us what would make finding bottles easier.
            </Text>
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
const cardCopy: React.CSSProperties = { margin: "0 0 9px", color: "#c9bda8", fontSize: "13px", lineHeight: 1.6 };
const cardCopyLast: React.CSSProperties = { ...cardCopy, margin: 0 };
const signature: React.CSSProperties = { margin: 0, color: "#ded3bd", fontSize: "14px", lineHeight: 1.55 };
const signatureBrand: React.CSSProperties = { color: "#d8a84f" };
const footerWrap: React.CSSProperties = { padding: "21px 28px 24px", backgroundColor: "#100d0a", borderTop: "1px solid #35291e" };
const footer: React.CSSProperties = { margin: "0 0 8px", color: "#91836f", fontSize: "10px", lineHeight: 1.6 };
const footerLink: React.CSSProperties = { color: "#b99454", textDecoration: "underline" };

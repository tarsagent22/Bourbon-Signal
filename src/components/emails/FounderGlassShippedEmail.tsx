import * as React from "react";
import { Body, Button, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import { founderShipmentEmailCopy, type FounderShipmentNotificationKind } from "@/lib/founder-shipment-email";

export interface FounderGlassShippedEmailProps {
  recipientName: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  accountUrl: string;
  kind?: FounderShipmentNotificationKind;
}

export function FounderGlassShippedEmail({
  recipientName,
  carrier,
  trackingNumber,
  trackingUrl,
  accountUrl,
  kind = "shipment",
}: FounderGlassShippedEmailProps) {
  const firstName = recipientName.trim().split(/\s+/)[0] || "there";
  const emailCopy = founderShipmentEmailCopy(kind);
  return (
    <Html style={{ backgroundColor: "#0f0c09" }}>
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{emailCopy.preview}</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Section style={masthead}>
            <Text style={brand}>BOURBON SIGNAL<span style={brandDot}>.</span></Text>
            <Text style={headline}>{emailCopy.headline}</Text>
          </Section>
          <Section style={content}>
            <Text style={paragraph}>Hi {firstName},</Text>
            <Text style={paragraph}>{emailCopy.introduction}</Text>
            <Section style={trackingCard}>
              <Text style={label}>CARRIER</Text>
              <Text style={value}>{carrier}</Text>
              <Text style={label}>TRACKING NUMBER</Text>
              <Text style={tracking}>{trackingNumber}</Text>
            </Section>
            <Button href={trackingUrl} style={button}>Track your shipment</Button>
            <Text style={secondary}>You can also find this tracking information in <a href={accountUrl} style={link}>Manage Account</a>.</Text>
            <Text style={signoff}>Thank you for being a founding member.<br />— Chandler</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = { margin: 0, padding: "24px 10px", backgroundColor: "#0f0c09", color: "#f5edd6", fontFamily: "Arial, Helvetica, sans-serif" };
const shell: React.CSSProperties = { width: "100%", maxWidth: "620px", margin: "0 auto", overflow: "hidden", backgroundColor: "#15100c", borderRadius: "18px" };
const masthead: React.CSSProperties = { padding: "30px 28px 28px", backgroundColor: "#15100c", borderBottom: "1px solid #493521" };
const brand: React.CSSProperties = { margin: "0 0 22px", color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "25px", fontWeight: 700, letterSpacing: "0.04em" };
const brandDot: React.CSSProperties = { color: "#d49a2e" };
const headline: React.CSSProperties = { margin: 0, color: "#f7efdb", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "35px", fontWeight: 700, lineHeight: 1.16 };
const content: React.CSSProperties = { padding: "30px 28px 34px", backgroundColor: "#15100c" };
const paragraph: React.CSSProperties = { margin: "0 0 17px", color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 };
const trackingCard: React.CSSProperties = { margin: "22px 0", padding: "20px", backgroundColor: "#1b1510", border: "1px solid #3d3023", borderRadius: "12px" };
const label: React.CSSProperties = { margin: "0 0 4px", color: "#a99679", fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em" };
const value: React.CSSProperties = { margin: "0 0 18px", color: "#f0e5cf", fontSize: "16px", fontWeight: 700 };
const tracking: React.CSSProperties = { margin: 0, color: "#f0e5cf", fontFamily: "monospace", fontSize: "15px", overflowWrap: "anywhere" };
const button: React.CSSProperties = { display: "block", padding: "15px 22px", backgroundColor: "#dca12e", borderRadius: "9px", color: "#171009", fontSize: "14px", fontWeight: 800, textAlign: "center", textDecoration: "none" };
const secondary: React.CSSProperties = { margin: "20px 0 0", color: "#b8aa95", fontSize: "13px", lineHeight: 1.6 };
const link: React.CSSProperties = { color: "#d8a84f" };
const signoff: React.CSSProperties = { margin: "26px 0 0", color: "#ded3bd", fontSize: "14px", lineHeight: 1.65 };

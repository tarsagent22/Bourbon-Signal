import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface PaidDropAlertEmailProps {
  firstName?: string | null;
  bottleName: string;
  storeLabel: string;
  matchedArea: string;
  state: string;
  timestampLabel: string;
  quantityLabel?: string | null;
  dashboardUrl: string;
}

export function PaidDropAlertEmail({
  firstName,
  bottleName,
  storeLabel,
  matchedArea,
  state,
  timestampLabel,
  quantityLabel,
  dashboardUrl,
}: PaidDropAlertEmailProps) {
  const greeting = firstName?.trim() ? `Hi ${firstName},` : "Hi there,";

  return (
    <Html>
      <Head />
      <Preview>{`${bottleName} just hit ${storeLabel}`}</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Section style={topRail}>
            <Text style={eyebrow}>BOURBON SIGNAL MEMBER ALERT</Text>
            <Text style={headline}>{bottleName}</Text>
            <Text style={subhead}>{`${bottleName} just showed up in one of your tracked areas.`}</Text>
          </Section>

          <Section style={contentWrap}>
            <Text style={paragraph}>{greeting}</Text>
            <Text style={paragraph}>
              <strong style={strong}>{bottleName}</strong> just hit <strong style={strong}>{storeLabel}</strong>.
            </Text>
            <Text style={paragraph}>This matched your <strong style={strong}>{matchedArea}</strong> alert area.</Text>

            <Section style={signalCard}>
              <Text style={signalLabel}>SIGNAL LOCATION</Text>
              <Text style={signalValue}>{storeLabel}</Text>

              <Text style={metaLine}>Tracked area: {matchedArea}</Text>
              <Text style={metaLine}>State: {state}</Text>
              <Text style={metaLine}>Reported: {timestampLabel}</Text>
              {quantityLabel ? <Text style={metaLine}>Reported qty: {quantityLabel}</Text> : null}
            </Section>

            <Text style={paragraphMuted}>
              We will not send this same bottle and store alert again for 24 hours.
            </Text>

            <Section style={{ textAlign: "center", marginTop: "30px", marginBottom: "28px" }}>
              <Button href={dashboardUrl} style={button}>
                Open member dashboard
              </Button>
            </Section>

            <Text style={footerCopy}>
              If this looks wrong, reply and we will check it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#090806",
  fontFamily: "Georgia, 'Times New Roman', serif",
  margin: 0,
  padding: "32px 12px",
};

const shell = {
  maxWidth: "620px",
  margin: "0 auto",
  background: "linear-gradient(180deg, #16110d 0%, #0f0b08 100%)",
  border: "1px solid rgba(212, 146, 11, 0.22)",
  borderRadius: "18px",
  overflow: "hidden",
  boxShadow: "0 18px 60px rgba(0, 0, 0, 0.42)",
};

const topRail = {
  padding: "28px 28px 24px",
  background: "radial-gradient(circle at top right, rgba(212, 146, 11, 0.22), transparent 34%), linear-gradient(180deg, rgba(196, 148, 58, 0.14) 0%, rgba(22, 17, 13, 0.98) 100%)",
  borderBottom: "1px solid rgba(212, 146, 11, 0.16)",
};

const eyebrow = {
  margin: 0,
  color: "#d4a44a",
  fontSize: "11px",
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const headline = {
  margin: "12px 0 8px",
  color: "#f6efe5",
  fontSize: "34px",
  lineHeight: 1.15,
  fontWeight: 700,
};

const subhead = {
  margin: 0,
  color: "#cbbca7",
  fontSize: "15px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const contentWrap = {
  padding: "28px",
};

const paragraph = {
  color: "#f4ecdf",
  fontSize: "16px",
  lineHeight: 1.7,
  margin: "0 0 16px",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const paragraphMuted = {
  color: "#bda98d",
  fontSize: "14px",
  lineHeight: 1.7,
  margin: "20px 0 0",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const strong = {
  color: "#f6efe5",
};

const signalCard = {
  marginTop: "24px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(212, 146, 11, 0.16)",
  borderRadius: "14px",
  padding: "20px",
};

const signalLabel = {
  margin: 0,
  color: "#d4a44a",
  fontSize: "10px",
  letterSpacing: "0.2em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const signalValue = {
  margin: "10px 0 14px",
  color: "#f7f1e8",
  fontSize: "24px",
  lineHeight: 1.3,
  fontWeight: 700,
};

const metaLine = {
  margin: "0 0 8px",
  color: "#cfbfaa",
  fontSize: "14px",
  lineHeight: 1.55,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const button = {
  background: "linear-gradient(135deg, #c4943a 0%, #e0b15a 100%)",
  color: "#0d0b0e",
  padding: "14px 22px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const footerCopy = {
  margin: 0,
  color: "#9f8e78",
  fontSize: "12px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

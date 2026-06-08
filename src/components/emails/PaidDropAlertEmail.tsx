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
  backgroundColor: "#0b0806",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: 0,
  padding: "16px 8px",
};

const shell = {
  width: "100%",
  maxWidth: "560px",
  margin: "0 auto",
  backgroundColor: "#120d09",
  border: "1px solid #9b6720",
  borderRadius: "16px",
  overflow: "hidden",
};

const topRail = {
  padding: "26px 22px 22px",
  backgroundColor: "#24180c",
  borderBottom: "1px solid #9b6720",
};

const eyebrow = {
  margin: 0,
  color: "#f0b94f",
  fontSize: "11px",
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const headline = {
  margin: "12px 0 8px",
  color: "#fff7eb",
  fontSize: "32px",
  lineHeight: 1.15,
  fontWeight: 700,
};

const subhead = {
  margin: 0,
  color: "#f1dfc4",
  fontSize: "15px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const contentWrap = {
  padding: "24px 22px 26px",
  backgroundColor: "#120d09",
};

const paragraph = {
  color: "#fff4e4",
  fontSize: "16px",
  lineHeight: 1.7,
  margin: "0 0 16px",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const paragraphMuted = {
  color: "#ecd3aa",
  fontSize: "14px",
  lineHeight: 1.7,
  margin: "20px 0 0",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const strong = {
  color: "#ffffff",
};

const signalCard = {
  marginTop: "22px",
  backgroundColor: "#1d140d",
  border: "1px solid #8c5b1e",
  borderRadius: "14px",
  padding: "18px",
};

const signalLabel = {
  margin: 0,
  color: "#f0b94f",
  fontSize: "10px",
  letterSpacing: "0.2em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const signalValue = {
  margin: "10px 0 14px",
  color: "#fff7eb",
  fontSize: "24px",
  lineHeight: 1.3,
  fontWeight: 700,
};

const metaLine = {
  margin: "0 0 8px",
  color: "#f0ddbe",
  fontSize: "14px",
  lineHeight: 1.55,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const button = {
  backgroundColor: "#e0b15a",
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
  color: "#dbc19a",
  fontSize: "12px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

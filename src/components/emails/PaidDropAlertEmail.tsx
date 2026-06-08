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

            <Section style={{ textAlign: "center", marginTop: "30px", marginBottom: "28px" }}>
              <Button href={dashboardUrl} style={button}>
                Open member dashboard
              </Button>
            </Section>

            <Text style={footerCopy}>
              If this looks wrong, reply and we will check it out.
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
  padding: "24px 10px",
};

const shell = {
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#14100c",
  border: "1px solid #4f3516",
  borderRadius: "18px",
  overflow: "hidden",
};

const topRail = {
  padding: "28px 24px 24px",
  backgroundColor: "#1f160e",
  borderBottom: "1px solid #4f3516",
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
  color: "#fff4e4",
  fontSize: "34px",
  lineHeight: 1.15,
  fontWeight: 700,
};

const subhead = {
  margin: 0,
  color: "#ead8bd",
  fontSize: "15px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const contentWrap = {
  padding: "28px 24px 28px",
  backgroundColor: "#100c09",
};

const paragraph = {
  color: "#f6efe5",
  fontSize: "16px",
  lineHeight: 1.7,
  margin: "0 0 16px",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const strong = {
  color: "#ffffff",
};

const signalCard = {
  marginTop: "24px",
  backgroundColor: "#18120d",
  border: "1px solid #5f411b",
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
  color: "#fff4e4",
  fontSize: "24px",
  lineHeight: 1.3,
  fontWeight: 700,
};

const metaLine = {
  margin: "0 0 8px",
  color: "#dcc9ad",
  fontSize: "14px",
  lineHeight: 1.55,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const button = {
  backgroundColor: "#d4a44a",
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
  color: "#bda98d",
  fontSize: "12px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

import * as React from "react";
import {
  Body,
  Button,
  Container,
  Section,
  Head,
  Html,
  Preview,
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
    <Html style={{ backgroundColor: "#f7efe2" }}>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{lightEmailCss}</style>
      </Head>
      <Preview>{`${bottleName} just hit ${storeLabel}`}</Preview>
      <Body className="bs-body" style={body}>
        <Container className="bs-shell" style={shell}>
          <Section className="bs-top-rail" style={topRail}>
            <Text className="bs-eyebrow" style={eyebrow}>BOURBON SIGNAL MEMBER ALERT</Text>
            <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" border={0} style={heroTextTable}>
              <tbody>
                <tr>
                  <td color="#9b671d" style={heroTitleCell}>
                    <LegacyFont color="#9b671d" style={heroTitleFont}>{bottleName}</LegacyFont>
                  </td>
                </tr>
                <tr>
                  <td color="#9b671d" style={heroSubheadCell}>
                    <LegacyFont color="#9b671d" style={heroSubheadFont}>{`${bottleName} just showed up in one of your tracked areas.`}</LegacyFont>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section className="bs-content" style={contentWrap}>
            <Text className="bs-paragraph" style={paragraph}>{greeting}</Text>
            <Text className="bs-paragraph" style={paragraph}>
              <strong className="bs-strong" style={strong}>{bottleName}</strong> just hit <strong className="bs-strong" style={strong}>{storeLabel}</strong>.
            </Text>
            <Text className="bs-paragraph" style={paragraph}>This matched your <strong className="bs-strong" style={strong}>{matchedArea}</strong> alert area.</Text>

            <Section className="bs-signal-card" style={signalCard}>
              <Text className="bs-signal-label" style={signalLabel}>SIGNAL LOCATION</Text>
              <Text className="bs-signal-value" style={signalValue}>{storeLabel}</Text>

              <Text className="bs-meta-line" style={metaLine}>Tracked area: {matchedArea}</Text>
              <Text className="bs-meta-line" style={metaLine}>State: {state}</Text>
              <Text className="bs-meta-line" style={metaLine}>Reported: {timestampLabel}</Text>
              {quantityLabel ? <Text className="bs-meta-line" style={metaLine}>Reported qty: {quantityLabel}</Text> : null}
            </Section>

            <Section style={{ textAlign: "center", marginTop: "30px", marginBottom: "28px" }}>
              <Button className="bs-button" href={dashboardUrl} style={button}>
                Open member dashboard
              </Button>
            </Section>

            <Text className="bs-footer" style={footerCopy}>
              If this looks wrong, reply and we will check it out.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function LegacyFont({ children, color, style }: { children: React.ReactNode; color: string; style: React.CSSProperties }) {
  return React.createElement("font", { color, style }, children);
}

const lightEmailCss = `
  :root {
    color-scheme: light;
    supported-color-schemes: light;
  }

  html,
  body,
  .bs-body {
    background: #f7efe2 !important;
    background-color: #f7efe2 !important;
    color: #24170d !important;
  }

  .bs-shell {
    background: #fff8ec !important;
    background-color: #fff8ec !important;
    border-color: #d3b98e !important;
  }

  .bs-top-rail {
    background: linear-gradient(135deg, #fff3dc 0%, #f5dfb8 100%) !important;
    background-color: #fff3dc !important;
    border-bottom-color: #d3b98e !important;
  }

  .bs-content {
    background: #fffaf1 !important;
    background-color: #fffaf1 !important;
  }

  .bs-signal-card {
    background: #fff4df !important;
    background-color: #fff4df !important;
    border-color: #c99b4a !important;
  }

  .bs-signal-value,
  .bs-strong {
    color: #1e140c !important;
    -webkit-text-fill-color: #1e140c !important;
  }

  .bs-paragraph {
    color: #352316 !important;
    -webkit-text-fill-color: #352316 !important;
  }

  .bs-meta-line {
    color: #5b3e24 !important;
    -webkit-text-fill-color: #5b3e24 !important;
  }

  .bs-eyebrow,
  .bs-signal-label {
    color: #9b671d !important;
    -webkit-text-fill-color: #9b671d !important;
  }

  .bs-button {
    background: linear-gradient(135deg, #8a5618 0%, #b87924 100%) !important;
    background-color: #9b671d !important;
    color: #fff8ec !important;
    -webkit-text-fill-color: #fff8ec !important;
  }

  .bs-footer {
    color: #765331 !important;
    -webkit-text-fill-color: #765331 !important;
  }
`;

const body = {
  backgroundColor: "#f7efe2",
  color: "#24170d",
  fontFamily: "Georgia, 'Times New Roman', serif",
  margin: 0,
  padding: "24px 10px",
  colorScheme: "light",
};

const shell = {
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#fff8ec",
  border: "1px solid #d3b98e",
  borderRadius: "18px",
  overflow: "hidden",
};

const topRail = {
  padding: "28px 24px 24px",
  backgroundColor: "#fff3dc",
  background: "linear-gradient(135deg, #fff3dc 0%, #f5dfb8 100%)",
  borderBottom: "1px solid #d3b98e",
};

const eyebrow = {
  margin: 0,
  color: "#9b671d",
  WebkitTextFillColor: "#9b671d",
  fontSize: "11px",
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const heroTextTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
  borderSpacing: 0,
  marginTop: "12px",
};

const heroTitleCell = {
  color: "#9b671d",
  WebkitTextFillColor: "#9b671d",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "34px",
  lineHeight: 1.15,
  fontWeight: 700,
  padding: "0 0 8px",
};

const heroTitleFont = {
  color: "#9b671d",
  WebkitTextFillColor: "#9b671d",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "34px",
  lineHeight: 1.15,
  fontWeight: 700,
};

const heroSubheadCell = {
  color: "#9b671d",
  WebkitTextFillColor: "#9b671d",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "15px",
  lineHeight: 1.6,
  padding: 0,
};

const heroSubheadFont = {
  color: "#9b671d",
  WebkitTextFillColor: "#9b671d",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "15px",
  lineHeight: 1.6,
};

const contentWrap = {
  padding: "28px 24px 28px",
  backgroundColor: "#fffaf1",
};

const paragraph = {
  color: "#352316",
  WebkitTextFillColor: "#352316",
  fontSize: "16px",
  lineHeight: 1.7,
  margin: "0 0 16px",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const strong = {
  color: "#1e140c",
  WebkitTextFillColor: "#1e140c",
};

const signalCard = {
  marginTop: "24px",
  backgroundColor: "#fff4df",
  border: "1px solid #c99b4a",
  borderRadius: "14px",
  padding: "20px",
};

const signalLabel = {
  margin: 0,
  color: "#9b671d",
  WebkitTextFillColor: "#9b671d",
  fontSize: "10px",
  letterSpacing: "0.2em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const signalValue = {
  margin: "10px 0 14px",
  color: "#1e140c",
  WebkitTextFillColor: "#1e140c",
  fontSize: "24px",
  lineHeight: 1.3,
  fontWeight: 700,
};

const metaLine = {
  margin: "0 0 8px",
  color: "#5b3e24",
  WebkitTextFillColor: "#5b3e24",
  fontSize: "14px",
  lineHeight: 1.55,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const button = {
  backgroundColor: "#9b671d",
  background: "linear-gradient(135deg, #8a5618 0%, #b87924 100%)",
  color: "#fff8ec",
  WebkitTextFillColor: "#fff8ec",
  padding: "14px 22px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const footerCopy = {
  margin: 0,
  color: "#765331",
  WebkitTextFillColor: "#765331",
  fontSize: "12px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

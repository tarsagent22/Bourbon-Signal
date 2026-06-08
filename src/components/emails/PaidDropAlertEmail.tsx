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
    <Html style={{ backgroundColor: "#090806" }}>
      <Head>
        <style>{darkModeEmailCss}</style>
      </Head>
      <Preview>{`${bottleName} just hit ${storeLabel}`}</Preview>
      <Body className="bs-body" style={body}>
        <Container className="bs-shell" style={shell}>
          <Section className="bs-top-rail" style={topRail}>
            <Text className="bs-eyebrow" style={eyebrow}><ColorLock color="#ffc857">BOURBON SIGNAL MEMBER ALERT</ColorLock></Text>
            <Text className="bs-headline" style={headline}><ColorLock color="#ffffff">{bottleName}</ColorLock></Text>
            <Text className="bs-subhead" style={subhead}><ColorLock color="#fff0cc">{`${bottleName} just showed up in one of your tracked areas.`}</ColorLock></Text>
          </Section>

          <Section className="bs-content" style={contentWrap}>
            <Text className="bs-paragraph" style={paragraph}><ColorLock color="#ffffff">{greeting}</ColorLock></Text>
            <Text className="bs-paragraph" style={paragraph}>
              <ColorLock color="#ffffff">{`${bottleName} just hit ${storeLabel}.`}</ColorLock>
            </Text>
            <Text className="bs-paragraph" style={paragraph}><ColorLock color="#ffffff">{`This matched your ${matchedArea} alert area.`}</ColorLock></Text>

            <Section className="bs-signal-card" style={signalCard}>
              <Text className="bs-signal-label" style={signalLabel}><ColorLock color="#ffc857">SIGNAL LOCATION</ColorLock></Text>
              <Text className="bs-signal-value" style={signalValue}><ColorLock color="#ffffff">{storeLabel}</ColorLock></Text>

              <Text className="bs-meta-line" style={metaLine}><ColorLock color="#fff0cc">Tracked area: {matchedArea}</ColorLock></Text>
              <Text className="bs-meta-line" style={metaLine}><ColorLock color="#fff0cc">State: {state}</ColorLock></Text>
              <Text className="bs-meta-line" style={metaLine}><ColorLock color="#fff0cc">Reported: {timestampLabel}</ColorLock></Text>
              {quantityLabel ? <Text className="bs-meta-line" style={metaLine}><ColorLock color="#fff0cc">Reported qty: {quantityLabel}</ColorLock></Text> : null}
            </Section>

            <Section style={{ textAlign: "center", marginTop: "30px", marginBottom: "28px" }}>
              <Button className="bs-button" href={dashboardUrl} style={button}>
                Open member dashboard
              </Button>
            </Section>

            <Text className="bs-footer" style={footerCopy}>
              <ColorLock color="#ffe4b8">If this looks wrong, reply and we will check it out.</ColorLock>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function ColorLock({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="bs-lock-screen" style={lockScreen}>
      <span className="bs-lock-difference" style={{ ...lockDifference, color, WebkitTextFillColor: color }}>
        {children}
      </span>
    </span>
  );
}

const darkModeEmailCss = `
  html,
  body,
  .bs-body {
    background: #090806 !important;
    background-image: linear-gradient(#090806, #090806) !important;
    background-color: #090806 !important;
    color: #f6efe5 !important;
  }

  .bs-shell {
    background: #14100c !important;
    background-image: linear-gradient(#14100c, #14100c) !important;
    background-color: #14100c !important;
    border-color: #4f3516 !important;
  }

  .bs-top-rail {
    background: linear-gradient(135deg, #2a1c0e 0%, #17110c 74%, #100c09 100%) !important;
    background-color: #1f160e !important;
    border-bottom-color: #4f3516 !important;
  }

  .bs-content {
    background: #100c09 !important;
    background-image: linear-gradient(#100c09, #100c09) !important;
    background-color: #100c09 !important;
  }

  .bs-signal-card {
    background: #18120d !important;
    background-image: linear-gradient(#18120d, #18120d) !important;
    background-color: #18120d !important;
    border-color: #5f411b !important;
  }

  .bs-headline,
  .bs-signal-value,
  .bs-strong {
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
    opacity: 1 !important;
    filter: none !important;
  }

  .bs-paragraph {
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
    opacity: 1 !important;
    filter: none !important;
  }

  .bs-subhead,
  .bs-meta-line {
    color: #fff0cc !important;
    -webkit-text-fill-color: #fff0cc !important;
    opacity: 1 !important;
    filter: none !important;
  }

  .bs-eyebrow,
  .bs-signal-label {
    color: #ffc857 !important;
    -webkit-text-fill-color: #ffc857 !important;
    opacity: 1 !important;
    filter: none !important;
  }

  .bs-button {
    background: linear-gradient(135deg, #c4943a 0%, #d4a44a 100%) !important;
    background-color: #d4a44a !important;
    color: #0d0b0e !important;
    -webkit-text-fill-color: #0d0b0e !important;
  }

  .bs-footer {
    color: #ffe4b8 !important;
    -webkit-text-fill-color: #ffe4b8 !important;
    opacity: 1 !important;
    filter: none !important;
  }

  .bs-lock-screen {
    background: #000000 !important;
    background-image: linear-gradient(#000000, #000000) !important;
    mix-blend-mode: screen !important;
  }

  .bs-lock-difference {
    background: #000000 !important;
    background-image: linear-gradient(#000000, #000000) !important;
    mix-blend-mode: difference !important;
    opacity: 1 !important;
    filter: none !important;
  }
`;

const body = {
  backgroundColor: "#090806",
  background: "linear-gradient(#090806, #090806)",
  backgroundImage: "linear-gradient(#090806, #090806)",
  color: "#f6efe5",
  fontFamily: "Georgia, 'Times New Roman', serif",
  margin: 0,
  padding: "24px 10px",
};

const shell = {
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#14100c",
  background: "linear-gradient(#14100c, #14100c)",
  backgroundImage: "linear-gradient(#14100c, #14100c)",
  border: "1px solid #4f3516",
  borderRadius: "18px",
  overflow: "hidden",
};

const lockScreen = {
  display: "inline",
  backgroundColor: "#000000",
  background: "linear-gradient(#000000, #000000)",
  backgroundImage: "linear-gradient(#000000, #000000)",
  mixBlendMode: "screen" as const,
};

const lockDifference = {
  display: "inline",
  backgroundColor: "#000000",
  background: "linear-gradient(#000000, #000000)",
  backgroundImage: "linear-gradient(#000000, #000000)",
  mixBlendMode: "difference" as const,
  opacity: 1,
};

const topRail = {
  padding: "28px 24px 24px",
  backgroundColor: "#1f160e",
  background: "linear-gradient(135deg, #2a1c0e 0%, #17110c 74%, #100c09 100%)",
  borderBottom: "1px solid #4f3516",
};

const eyebrow = {
  margin: 0,
  color: "#ffc857",
  WebkitTextFillColor: "#ffc857",
  opacity: 1,
  fontSize: "11px",
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const headline = {
  margin: "12px 0 8px",
  color: "#ffffff",
  WebkitTextFillColor: "#ffffff",
  opacity: 1,
  fontSize: "34px",
  lineHeight: 1.15,
  fontWeight: 700,
};

const subhead = {
  margin: 0,
  color: "#fff0cc",
  WebkitTextFillColor: "#fff0cc",
  opacity: 1,
  fontSize: "15px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const contentWrap = {
  padding: "28px 24px 28px",
  backgroundColor: "#100c09",
  background: "linear-gradient(#100c09, #100c09)",
  backgroundImage: "linear-gradient(#100c09, #100c09)",
};

const paragraph = {
  color: "#ffffff",
  WebkitTextFillColor: "#ffffff",
  opacity: 1,
  fontSize: "16px",
  lineHeight: 1.7,
  margin: "0 0 16px",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const strong = {
  color: "#ffffff",
  WebkitTextFillColor: "#ffffff",
  opacity: 1,
};

const signalCard = {
  marginTop: "24px",
  backgroundColor: "#18120d",
  background: "linear-gradient(#18120d, #18120d)",
  backgroundImage: "linear-gradient(#18120d, #18120d)",
  border: "1px solid #5f411b",
  borderRadius: "14px",
  padding: "20px",
};

const signalLabel = {
  margin: 0,
  color: "#ffc857",
  WebkitTextFillColor: "#ffc857",
  opacity: 1,
  fontSize: "10px",
  letterSpacing: "0.2em",
  textTransform: "uppercase" as const,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
};

const signalValue = {
  margin: "10px 0 14px",
  color: "#ffffff",
  WebkitTextFillColor: "#ffffff",
  opacity: 1,
  fontSize: "24px",
  lineHeight: 1.3,
  fontWeight: 700,
};

const metaLine = {
  margin: "0 0 8px",
  color: "#fff0cc",
  WebkitTextFillColor: "#fff0cc",
  opacity: 1,
  fontSize: "14px",
  lineHeight: 1.55,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const button = {
  backgroundColor: "#d4a44a",
  background: "linear-gradient(135deg, #c4943a 0%, #d4a44a 100%)",
  color: "#0d0b0e",
  WebkitTextFillColor: "#0d0b0e",
  padding: "14px 22px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const footerCopy = {
  margin: 0,
  color: "#ffe4b8",
  WebkitTextFillColor: "#ffe4b8",
  opacity: 1,
  fontSize: "12px",
  lineHeight: 1.6,
  fontFamily: "Arial, Helvetica, sans-serif",
};

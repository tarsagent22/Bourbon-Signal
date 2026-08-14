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
import type { MemberWeeklyIntelligence } from "@/lib/member-weekly-intelligence";

export interface MemberWeeklyIntelligenceEmailProps {
  report: MemberWeeklyIntelligence;
  unsubscribeUrl: string;
  baseUrl?: string;
}

export function MemberWeeklyIntelligenceEmail({
  report,
  unsubscribeUrl,
  baseUrl = "https://www.bourbonsignal.com",
}: MemberWeeklyIntelligenceEmailProps) {
  const action = report.primaryAction;
  const actionUrl = action ? new URL(action.href, baseUrl).toString() : baseUrl;

  return (
    <Html style={{ backgroundColor: "#f6eddd" }}>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{report.headline}</Preview>
      <Body style={body}>
        <Container style={shell}>
          <Section style={masthead}>
            <Text style={eyebrow}>BOURBON SIGNAL · MEMBER BRIEF</Text>
            <Text style={headline}>{report.headline}</Text>
            <Text style={weekLabel}>WEEK OF {report.weekKey}</Text>
          </Section>

          <Section style={content}>
            <Text style={introduction}>{report.introduction}</Text>

            {report.sections.map((section) => (
              <Section key={section.kind} style={sectionWrap}>
                <Text style={sectionTitle}>{section.title}</Text>
                {section.items.map((item) => (
                  <Section key={item.id} style={itemWrap}>
                    <Text style={itemMeta}>{item.meta}</Text>
                    <Text style={itemTitle}>{item.title}</Text>
                    <Text style={itemSummary}>{item.summary}</Text>
                  </Section>
                ))}
              </Section>
            ))}

            {action ? (
              <Section style={actionWrap}>
                <Button href={actionUrl} style={button}>{action.label}</Button>
              </Section>
            ) : null}

            <Text style={footer}>
              This preview is deterministic and based on your saved markets, tracked bottles, eligible alert signal, and coverage notes. Inventory can move quickly; verify before driving.
            </Text>
            <Text style={footer}>
              Weekly intelligence is separate from real-time alerts. <Link href={unsubscribeUrl} style={footerLink}>Unsubscribe from this weekly brief</Link>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f6eddd",
  color: "#281a10",
  fontFamily: "Georgia, 'Times New Roman', serif",
  margin: 0,
  padding: "24px 10px",
};

const shell: React.CSSProperties = {
  width: "100%",
  maxWidth: "620px",
  margin: "0 auto",
  backgroundColor: "#fffaf0",
  border: "1px solid #d5bd91",
  borderRadius: "18px",
  overflow: "hidden",
};

const masthead: React.CSSProperties = {
  padding: "30px 26px 26px",
  backgroundColor: "#24170f",
  borderBottom: "4px solid #bd8331",
};

const eyebrow: React.CSSProperties = {
  margin: "0 0 14px",
  color: "#e5bd72",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.2em",
};

const headline: React.CSSProperties = {
  margin: 0,
  color: "#fff4dd",
  fontSize: "36px",
  fontWeight: 700,
  lineHeight: 1.12,
};

const weekLabel: React.CSSProperties = {
  margin: "16px 0 0",
  color: "#cbb997",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.14em",
};

const content: React.CSSProperties = { padding: "28px 26px 30px" };
const introduction: React.CSSProperties = { margin: "0 0 24px", color: "#4a3422", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "16px", lineHeight: 1.65 };
const sectionWrap: React.CSSProperties = { margin: "0 0 28px" };
const sectionTitle: React.CSSProperties = { margin: "0 0 10px", paddingBottom: "9px", color: "#8b571a", borderBottom: "1px solid #d8c29c", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" };
const itemWrap: React.CSSProperties = { padding: "13px 0", borderBottom: "1px solid #eadcc4" };
const itemMeta: React.CSSProperties = { margin: "0 0 5px", color: "#986f3e", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" };
const itemTitle: React.CSSProperties = { margin: 0, color: "#281a10", fontSize: "20px", fontWeight: 700, lineHeight: 1.35 };
const itemSummary: React.CSSProperties = { margin: "6px 0 0", color: "#59402c", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "14px", lineHeight: 1.6 };
const actionWrap: React.CSSProperties = { margin: "30px 0", textAlign: "center" };
const button: React.CSSProperties = { padding: "14px 22px", borderRadius: "999px", backgroundColor: "#9b651e", color: "#fff8e9", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "14px", fontWeight: 700, textDecoration: "none" };
const footer: React.CSSProperties = { margin: "10px 0 0", color: "#765d43", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11px", lineHeight: 1.6 };
const footerLink: React.CSSProperties = { color: "#875516", textDecoration: "underline" };

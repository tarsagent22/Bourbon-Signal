import * as React from "react";
import { Body, Button, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

export function GiftDeliveryEmail(props: {
  recipientName: string;
  purchaserName: string;
  planLabel: string;
  message: string | null;
  redemptionUrl: string;
  annual: boolean;
  founderNumber: number | null;
}) {
  return (
    <Html style={{ backgroundColor: "#0f0c09" }}>
      <Head><meta name="color-scheme" content="dark" /></Head>
      <Preview>{props.purchaserName} sent you Bourbon Signal.</Preview>
      <Body style={{ margin: 0, padding: "24px 10px", backgroundColor: "#0f0c09", color: "#f5edd6", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: "620px", margin: "0 auto", padding: "32px", borderRadius: "18px", backgroundColor: "#15100c", border: "1px solid #493521" }}>
          <Text style={{ margin: 0, color: "#dca12e", fontSize: "12px", fontWeight: 800, letterSpacing: ".14em" }}>BOURBON SIGNAL</Text>
          <Text style={{ margin: "18px 0 12px", color: "#f7efdb", fontFamily: "Georgia, serif", fontSize: "34px", fontWeight: 700 }}>A better bourbon hunt, gifted.</Text>
          <Text style={{ color: "#ded3bd", fontSize: "15px", lineHeight: 1.7 }}>Hi {props.recipientName}, {props.purchaserName} gave you {props.planLabel}.</Text>
          {props.message ? <Section style={{ margin: "20px 0", padding: "18px", borderRadius: "12px", backgroundColor: "#1b1510" }}><Text style={{ margin: 0, color: "#ded3bd", fontSize: "15px", lineHeight: 1.65 }}>{props.message}</Text></Section> : null}
          <Text style={{ color: "#ded3bd", fontSize: "14px", lineHeight: 1.65 }}>
            {props.annual
              ? "This annual gift gives exactly one year of access from redemption and does not renew. No subscription or automatic renewal is created."
              : `This Founder gift includes lifetime access and a numbered Founder glass${props.founderNumber ? ` reserved as #${props.founderNumber}` : ""}.`}
          </Text>
          <Button href={props.redemptionUrl} style={{ display: "block", marginTop: "24px", padding: "15px 22px", borderRadius: "9px", backgroundColor: "#dca12e", color: "#171009", fontSize: "14px", fontWeight: 800, textAlign: "center", textDecoration: "none" }}>Redeem your gift</Button>
          <Text style={{ marginTop: "22px", color: "#a99679", fontSize: "12px", lineHeight: 1.6 }}>This transactional email was sent because a Bourbon Signal gift was purchased for this address. If you were not expecting it, you can ignore it.</Text>
        </Container>
      </Body>
    </Html>
  );
}

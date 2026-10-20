import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL_UPDATED, TERMS_SECTIONS } from "../../../../shared/legal-content";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy — Bourbon Signal",
  description: "Cancellation, renewal, refund, and billing policy for Bourbon Signal subscriptions.",
};

const billingHeadings = new Set([
  "Memberships and billing",
  "Refunds, gifts, promotions and Founder access",
  "Account closure and service changes",
]);

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      updated={LEGAL_UPDATED}
      intro="This policy explains renewals, cancellations, refunds and paid access for Bourbon Signal, operated by Todd Digital Ventures LLC. These provisions also appear in our Terms of service."
      sections={TERMS_SECTIONS.filter(([heading]) => billingHeadings.has(heading))
        .map(([heading, paragraphs]) => ({ heading, body: [...paragraphs] }))}
    />
  );
}

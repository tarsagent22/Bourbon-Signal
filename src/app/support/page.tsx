import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Support — Bourbon Signal",
  description: "Get help with Bourbon Signal membership, sign-in, Signal Feed access, privacy, or account deletion.",
  alternates: { canonical: "https://www.bourbonsignal.com/support" },
};

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="Member support"
      title="How can we help?"
      updated="August 21, 2026"
      intro="Contact Bourbon Signal support for help with sign-in, membership access, the Signal Feed, privacy questions, or an account-deletion request."
      sections={[
        {
          heading: "Get support",
          body: [
            "Email support@bourbonsignal.com from the address associated with your Bourbon Signal account. Include the device type and a short description of what happened, but never send your password, verification code, payment-card number, or authentication token.",
            "Support requests are reviewed by Bourbon Signal. Response times can vary, and time-sensitive bottle availability may change before a support reply arrives.",
          ],
        },
        {
          heading: "Request account deletion",
          body: [
            "In the mobile app, open Account and choose Request account deletion. The app opens a pre-addressed email so you can initiate the request from your account email address.",
            "Support verifies account ownership, removes the account and associated personal information from active product systems, and confirms completion. Limited billing, fraud-prevention, dispute, or legal records may be retained when required. Canceling a subscription and deleting an account are separate actions.",
          ],
        },
        {
          heading: "Privacy and safety",
          body: [
            "Bourbon Signal is intended for adults age 21 and older. Availability information can change quickly and should be confirmed with the retailer before travel or purchase.",
            "Our Privacy Policy explains the account, subscription, preference, usage, and support information used to operate the service.",
          ],
        },
      ]}
    />
  );
}

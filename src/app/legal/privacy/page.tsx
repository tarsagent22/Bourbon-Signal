import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Bourbon Signal",
  description: "How Bourbon Signal collects, uses, and protects account, subscription, preference, and usage information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 24, 2026"
      intro="This Privacy Policy explains how Bourbon Signal, operated by Todd Digital Ventures LLC, collects and uses information when you visit the site, create an account, subscribe, save preferences, or receive alerts."
      sections={[
        {
          heading: "1. Information we collect",
          body: [
            { label: "Account information:", text: "name, email address, authentication identifiers, and account metadata provided through our authentication provider." },
            { label: "Subscription and billing information:", text: "plan status, payment status, customer identifiers, invoices, and related billing metadata from payment processors such as Stripe. We do not store full card numbers on our servers." },
            { label: "Preferences:", text: "states, markets, boards, cities, counties, bottles, alert settings, notification channels, SMS opt-in status, mobile phone number, and similar settings you choose to save." },
            { label: "Usage information:", text: "pages viewed, features used, device/browser details, approximate location inferred from your IP address, log data, errors, and performance information." },
            { label: "Communications:", text: "messages, feedback, support requests, survey responses, and email interaction data such as unsubscribes or delivery status." },
          ],
        },
        {
          heading: "2. How we use information",
          body: [
            "We use information to operate Bourbon Signal, personalize your drop feed and alerts, manage subscriptions, provide customer support, improve data quality, prevent abuse, troubleshoot errors, measure product performance, and comply with legal obligations.",
            "We may use aggregated or de-identified information to understand coverage quality, source health, market demand, and product usage trends.",
          ],
        },
        {
          heading: "3. Alerts and communications",
          body: [
            "If you opt into alerts or updates, we may send email, SMS/text messages, or other notifications related to your saved preferences, account, subscription, or Bourbon Signal product updates. You can unsubscribe from marketing emails, reply STOP to opt out of SMS messages, or adjust alert preferences where available.",
            "Transactional messages, such as billing, security, account, or important service notices, may still be sent when necessary.",
          ],
        },
        {
          heading: "4. Service providers",
          body: [
            "We use third-party providers to run the service, including hosting, authentication, payment processing, email delivery, SMS delivery, analytics, error monitoring, and data storage providers. These providers process information on our behalf or as independent service providers under their own terms and privacy policies.",
            "Examples may include Vercel, Clerk, Stripe, Twilio, email providers, analytics providers, and other infrastructure vendors used to operate Bourbon Signal.",
          ],
        },
        {
          heading: "5. SMS privacy",
          body: [
            "When you opt into SMS alerts, we collect and use your mobile phone number, SMS consent status, alert preferences, and message delivery metadata to send and manage text message notifications.",
            "We may share SMS-related information with our messaging provider, currently Twilio, mobile carriers, and other service providers as necessary to deliver messages, process opt-out or HELP requests, prevent abuse, comply with messaging rules, and maintain records of consent.",
            "We do not sell or share your SMS opt-in information, mobile phone number, or SMS consent status with third parties for their own marketing purposes.",
            "You can opt out of SMS messages at any time by replying STOP. Reply HELP for help. We may retain limited SMS consent, opt-out, and delivery records as needed for compliance, dispute resolution, and service operations.",
          ],
        },
        {
          heading: "6. Cookies and similar technologies",
          body: [
            "Bourbon Signal and our service providers may use cookies, local storage, pixels, and similar technologies for authentication, security, preferences, analytics, performance, and product functionality.",
            "You can control cookies through your browser settings, but disabling certain technologies may prevent parts of the service from working correctly.",
          ],
        },
        {
          heading: "7. Sharing and disclosure",
          body: [
            "We do not sell your personal information in the ordinary sense of selling a customer list for money. We may share information with service providers, when you direct us to, to complete transactions, to comply with law, to protect rights and safety, or in connection with a business transfer such as a merger, acquisition, financing, or sale of assets.",
            "We may publish or share aggregated, de-identified, or non-personal data that does not reasonably identify you.",
          ],
        },
        {
          heading: "8. Data retention",
          body: [
            "We keep information for as long as reasonably necessary to operate the service, maintain records, comply with legal obligations, resolve disputes, enforce agreements, and improve Bourbon Signal. Retention periods may vary by data type and business need.",
          ],
        },
        {
          heading: "9. Your choices",
          body: [
            "You may update account details, preferences, and alert settings where the service provides controls. You may request account deletion or ask privacy questions by contacting support.",
            "If you cancel your subscription, we may retain limited records needed for accounting, fraud prevention, legal compliance, and legitimate business operations.",
          ],
        },
        {
          heading: "10. Security",
          body: [
            "We use reasonable technical and organizational measures to protect information. No online service can guarantee perfect security, and you should use a strong password and protect access to your email and account.",
          ],
        },
        {
          heading: "11. Children and age-restricted content",
          body: [
            "Bourbon Signal is intended for users who are at least 21 years old. We do not knowingly collect personal information from children or from users under the legal drinking age.",
          ],
        },
        {
          heading: "12. Changes to this policy",
          body: [
            "We may update this Privacy Policy as Bourbon Signal evolves. The updated date above indicates the latest revision. Material changes will be communicated where required by law or where practical.",
          ],
        },
      ]}
    />
  );
}

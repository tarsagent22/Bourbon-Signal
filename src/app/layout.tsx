import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { fraunces, plusJakarta, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";
import ToastContainer from "@/components/Toast";
import PreviewTierSwitcher from "@/components/PreviewTierSwitcher";
import { LiquidToggleFilter } from "@/components/LiquidToggle";

const siteTitle = "Bourbon Signal — Premium Bourbon Drop Alerts";
const siteDescription = "Premium source-backed bourbon drop alerts, live inventory signals, Daily Briefing, Bottle Check, and member tools for covered control and retailer markets.";

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: "%s · Bourbon Signal",
  },
  description: siteDescription,
  applicationName: "Bourbon Signal",
  authors: [{ name: "Bourbon Signal" }],
  creator: "Bourbon Signal",
  publisher: "Bourbon Signal",
  keywords: ["bourbon alerts", "allocated bourbon", "bourbon drops", "ABC store inventory", "bourbon hunting", "Bottle Check", "Daily Briefing"],
  metadataBase: new URL("https://bourbonsignal.com"),
  alternates: { canonical: "https://bourbonsignal.com" },
  category: "technology",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "https://bourbonsignal.com",
    siteName: "Bourbon Signal",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-bourbon-signal.png",
        width: 1200,
        height: 630,
        alt: "Bourbon Signal premium bourbon drop alerts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-bourbon-signal.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      proxyUrl={process.env.NEXT_PUBLIC_CLERK_PROXY_URL}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#D4920B",
          colorBackground: "#14100C",
          colorText: "#F7F0E0",
          colorTextSecondary: "#D8CDBB",
          colorInputBackground: "#F7F0E0",
          colorInputText: "#14100C",
          colorDanger: "#FF8B6A",
          fontFamily: "var(--font-dm-sans)",
          borderRadius: "14px",
        },
        elements: {
          modalBackdrop: {
            background: "rgba(5,4,3,0.72)",
            backdropFilter: "blur(10px)",
          },
          card: {
            background: "linear-gradient(180deg, rgba(24,19,14,0.98) 0%, rgba(14,11,8,0.99) 100%)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.72), 0 0 0 1px rgba(196,148,58,0.16)",
            border: "1px solid rgba(196,148,58,0.24)",
            color: "#F7F0E0",
          },
          headerTitle: {
            color: "#F7F0E0",
            fontFamily: "var(--font-playfair)",
            fontSize: "26px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          },
          headerSubtitle: {
            color: "#D8CDBB",
            fontSize: "14px",
            lineHeight: 1.55,
          },
          socialButtonsBlockButton: {
            background: "rgba(247,240,224,0.06)",
            border: "1px solid rgba(247,240,224,0.14)",
            color: "#F7F0E0",
            boxShadow: "none",
          },
          socialButtonsBlockButtonText: {
            color: "#F7F0E0",
            fontWeight: 700,
          },
          dividerLine: { background: "rgba(247,240,224,0.14)" },
          dividerText: { color: "#D8CDBB", fontWeight: 700 },
          formFieldLabel: {
            color: "#F7F0E0",
            fontWeight: 700,
          },
          formFieldInput: {
            background: "#F7F0E0",
            border: "1px solid rgba(196,148,58,0.34)",
            color: "#14100C",
            caretColor: "#14100C",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)",
            fontWeight: 650,
          },
          formFieldInputShowPasswordButton: { color: "#3A2D1E" },
          formButtonPrimary: {
            background: "linear-gradient(135deg, #D4920B 0%, #F2C14E 100%)",
            color: "#14100C",
            fontWeight: 800,
            boxShadow: "0 10px 28px rgba(212,146,11,0.28)",
          },
          footer: {
            background: "rgba(10,8,6,0.52)",
            borderTop: "1px solid rgba(196,148,58,0.14)",
          },
          footerActionText: { color: "#D8CDBB" },
          footerActionLink: { color: "#F2C14E", fontWeight: 800 },
          identityPreviewText: { color: "#F7F0E0" },
          formFieldErrorText: { color: "#FFB199", fontWeight: 700 },
          alertText: { color: "#F7F0E0" },
          otpCodeFieldInput: {
            background: "#F7F0E0",
            color: "#14100C",
            borderColor: "rgba(196,148,58,0.34)",
          },
        },
      }}
    >
      <html
        lang="en"
        className={`${fraunces.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
      >
        <body style={{ fontFamily: "var(--font-dm-sans)" }}>
          <LiquidToggleFilter />
          {children}
          <PreviewTierSwitcher />
          <ToastContainer />
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}

import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { fraunces, plusJakarta, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";
import ToastContainer from "@/components/Toast";
import PreviewTierSwitcher from "@/components/PreviewTierSwitcher";
import { LiquidToggleFilter } from "@/components/LiquidToggle";

export const metadata: Metadata = {
  title: "Bourbon Signal — Real-Time Bourbon Drops and Shipment Alerts",
  description: "Track allocated bourbon drops, store-level inventory hits, and board shipment leads across NC, VA, PA, and IN.",
  metadataBase: new URL("https://bourbonsignal.com"),
  openGraph: {
    title: "Bourbon Signal — Real-Time Bourbon Drops and Shipment Alerts",
    description: "Track allocated bourbon drops, store-level inventory hits, and board shipment leads across NC, VA, PA, and IN.",
    url: "https://bourbonsignal.com",
    siteName: "Bourbon Signal",
    type: "website",
    images: [
      {
        url: "https://bourbonsignal.com/hero-bg.jpg",
        width: 1200,
        height: 630,
        alt: "Bourbon Signal — Bourbon drops and shipment alerts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bourbon Signal — Real-Time Bourbon Drops and Shipment Alerts",
    description: "Track allocated bourbon drops, store-level inventory hits, and board shipment leads across NC, VA, PA, and IN.",
    images: ["https://bourbonsignal.com/hero-bg.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
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

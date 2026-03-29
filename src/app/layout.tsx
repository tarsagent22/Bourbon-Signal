import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { fraunces, plusJakarta, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: "Proof — Never Miss a Bourbon Drop",
  description: "Track allocated bourbon drops across NC and VA. Real-time alerts when rare bottles hit store shelves. Join the hunt.",
  metadataBase: new URL("https://proofhunt.co"),
  openGraph: {
    title: "Proof — Never Miss a Bourbon Drop",
    description: "Track allocated bourbon drops across NC and VA. Real-time alerts when rare bottles hit store shelves.",
    url: "https://proofhunt.co",
    siteName: "Proof",
    type: "website",
    images: [
      {
        url: "https://proofhunt.co/hero-bg.jpg",
        width: 1200,
        height: 630,
        alt: "Proof — Bourbon drop tracking",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Proof — Never Miss a Bourbon Drop",
    description: "Track allocated bourbon drops across NC and VA. Real-time alerts when rare bottles hit store shelves.",
    images: ["https://proofhunt.co/hero-bg.jpg"],
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
          colorBackground: "#1A1612",
          colorText: "#F5EDD6",
          colorInputBackground: "#2A2520",
          colorInputText: "#F5EDD6",
        },
      }}
    >
      <html
        lang="en"
        className={`${fraunces.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
      >
        <body style={{ fontFamily: "var(--font-dm-sans)" }}>
          {children}
          <ToastContainer />
        </body>
      </html>
    </ClerkProvider>
  );
}

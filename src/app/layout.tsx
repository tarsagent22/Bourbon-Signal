import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { fraunces, plusJakarta, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: "Bourbon Signal — Real-Time Bourbon Drop Signals",
  description: "Track allocated bourbon drops across NC, VA, PA, and IN. Real-time signals when rare bottles hit store shelves.",
  metadataBase: new URL("https://bourbonsignal.com"),
  openGraph: {
    title: "Bourbon Signal — Real-Time Bourbon Drop Signals",
    description: "Track allocated bourbon drops across NC, VA, PA, and IN. Real-time signals when rare bottles hit store shelves.",
    url: "https://bourbonsignal.com",
    siteName: "Bourbon Signal",
    type: "website",
    images: [
      {
        url: "https://bourbonsignal.com/hero-bg.jpg",
        width: 1200,
        height: 630,
        alt: "Bourbon Signal — Bourbon drop signals",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bourbon Signal — Real-Time Bourbon Drop Signals",
    description: "Track allocated bourbon drops across NC, VA, PA, and IN. Real-time signals when rare bottles hit store shelves.",
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
          colorBackground: "#1C1812",
          colorText: "#F7F0E0",
          colorTextSecondary: "#B8A99A",
          colorInputBackground: "#312B24",
          colorInputText: "#F7F0E0",
          borderRadius: "10px",
        },
        elements: {
          card: { boxShadow: "none", border: "1px solid rgba(245,237,214,0.1)" },
          formButtonPrimary: {
            background: "linear-gradient(135deg, #D4920B 0%, #EFC050 100%)",
            color: "#1A1510",
            fontWeight: 700,
          },
          footerActionLink: { color: "#D4920B" },
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

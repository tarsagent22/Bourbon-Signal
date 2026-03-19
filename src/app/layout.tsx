import type { Metadata } from "next";
import { playfair, dmSans, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proof — Never Miss a Bourbon Drop",
  description:
    "Real-time allocated bourbon alerts. Track warehouse arrivals, board shipments, and store inventory across control states. Know before the crowds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body style={{ fontFamily: "var(--font-dm-sans)" }}>{children}</body>
    </html>
  );
}

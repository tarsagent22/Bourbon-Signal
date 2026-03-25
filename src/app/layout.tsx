import type { Metadata } from "next";
import { fraunces, plusJakarta, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: "Proof — Never Miss a Bourbon Drop",
  description:
    "Real-time allocated bourbon alerts. Track warehouse arrivals, board shipments, and store inventory. Know before the crowds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body style={{ fontFamily: "var(--font-dm-sans)" }}>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}

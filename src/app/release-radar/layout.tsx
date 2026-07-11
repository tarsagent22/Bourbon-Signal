import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import "./release-radar.css";

export const metadata: Metadata = {
  title: "Bourbon Release Calendar, Lotteries & State Guides",
  description: "Track upcoming bourbon releases, official whiskey lotteries, distillery events, bottle context, and control-state release guides with source-backed Bourbon Signal intelligence.",
  alternates: { canonical: "/release-radar" },
  openGraph: {
    title: "Release Radar · Bourbon Signal",
    description: "A source-backed calendar of bourbon releases, official lotteries, bottle intelligence, and state hunting guides.",
    url: "/release-radar",
    type: "website",
  },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function ReleaseRadarLayout({ children }: { children: React.ReactNode }) {
  return <><Navigation />{children}<Footer /></>;
}

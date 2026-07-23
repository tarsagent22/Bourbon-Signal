import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { CoverageExplorer } from "@/components/coverage/CoverageExplorer";
import { readCurrentCoverageContract } from "@/lib/coverage-server";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Coverage",
  description: "Explore Bourbon Signal monitoring capability by state, city, and store without confusing coverage with current bottle availability.",
  alternates: { canonical: "/coverage" },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const [contract, params] = await Promise.all([readCurrentCoverageContract(), searchParams]);
  const requestedState = Array.isArray(params.state) ? params.state[0] : params.state;
  const initialStateCode = typeof requestedState === "string" ? requestedState.trim().toUpperCase() : "NC";

  return (
    <>
      <Navigation />
      <CoverageExplorer contract={contract} initialStateCode={initialStateCode} />
      <Footer />
    </>
  );
}

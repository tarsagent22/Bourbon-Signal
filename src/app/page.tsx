import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import FAQ from "@/components/sections/FAQ";
import PublicDropFeed from "@/components/sections/PublicDropFeed";
import { COVERAGE_STATES } from "../../shared/coverage-states";
import { readPublicMarketingFeed } from "@/lib/public-marketing-feed";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { drops, unavailable } = await readPublicMarketingFeed();
  return (
    <>
      <Navigation />
      <main>
        <PublicDropFeed drops={drops} unavailable={unavailable} states={COVERAGE_STATES} />
        <FAQ variant="product" />
      </main>
      <Footer />
    </>
  );
}

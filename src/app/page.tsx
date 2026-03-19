"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import HeroSection from "@/components/sections/HeroSection";
import SocialProofBar from "@/components/sections/SocialProofBar";
import HowItWorks from "@/components/sections/HowItWorks";
import LiveDropFeed from "@/components/sections/LiveDropFeed";
import IntelligenceAdvantage from "@/components/sections/IntelligenceAdvantage";
import PricingSection from "@/components/sections/PricingSection";
import FinalCTA from "@/components/sections/FinalCTA";

export default function Home() {
  return (
    <>
      <Navigation />
      <main>
        <HeroSection />
        <SocialProofBar />
        <HowItWorks />
        <LiveDropFeed />
        <IntelligenceAdvantage />
        <PricingSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

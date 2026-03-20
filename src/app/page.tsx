"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import HeroSection from "@/components/sections/HeroSection";
import SocialProofBar from "@/components/sections/SocialProofBar";
import HowItWorks from "@/components/sections/HowItWorks";
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
        <PricingSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

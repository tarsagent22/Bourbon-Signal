"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import DataFreshness from "@/components/DataFreshness";
import dropsData from "@/data/drops.json";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import HeroSection from "@/components/sections/HeroSection";
import DropFeed from "@/components/sections/DropFeed";
import PricingSection from "@/components/sections/PricingSection";
import HowWeHunt from "@/components/sections/HowWeHunt";
import FAQ from "@/components/sections/FAQ";

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > window.innerHeight);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full cursor-pointer"
          style={{
            width: "40px",
            height: "40px",
            backgroundColor: "var(--color-accent-amber)",
            border: "none",
            boxShadow: "0 4px 12px rgba(212, 146, 11, 0.3)",
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.25 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp size={20} style={{ color: "#0D0B0E" }} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default function Home() {
  return (
    <>
      <Navigation />
      <motion.main
        className="overflow-x-hidden"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <HeroSection />
        <DropFeed />
        <PricingSection />
        <HowWeHunt />
        <FAQ />
      </motion.main>
      <Footer />
      <ScrollToTopButton />
    </>
  );
}

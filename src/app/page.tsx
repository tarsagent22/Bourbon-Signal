"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

import HeroSection from "@/components/sections/HeroSection";
import DropFeed from "@/components/sections/DropFeed";
import BriefingSection from "@/components/sections/BriefingSection";
import HowWeHunt from "@/components/sections/HowWeHunt";
import FAQ from "@/components/sections/FAQ";
import EmailCapture from "@/components/sections/EmailCapture";

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
            background: "linear-gradient(145deg, rgba(212,146,11,0.96), rgba(242,193,78,0.92))",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.36), 0 0 22px rgba(212,146,11,0.18)",
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
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <HeroSection />
        <div
          style={{
            height: 12,
            background: "var(--color-bg-primary)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 56 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.14 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <DropFeed />
        </motion.div>
        <div style={{ height: 22, background: "var(--color-bg-primary)" }} />
        <BriefingSection />
        <div style={{ height: 22, background: "var(--color-bg-primary)" }} />
        <HowWeHunt />
        <div style={{ height: 24, background: "var(--color-bg-primary)" }} />
        <FAQ />
        <div style={{ height: 20, background: "var(--color-bg-primary)", borderTop: "none" }} />
        <EmailCapture />
      </motion.main>
      <Footer />
      <ScrollToTopButton />
    </>
  );
}

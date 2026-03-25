"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";

const HuntMap = dynamic(() => import("@/components/HuntMap"), { ssr: false });

export default function MapPage() {
  const { isSignedIn, signIn } = useAuth();

  if (!isSignedIn) {
    return (
      <>
        <Navigation />
        <div
          style={{
            minHeight: "100vh",
            background: "var(--color-bg-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 clamp(20px, 5vw, 40px)",
          }}
        >
          <div style={{ maxWidth: 440 }}>
            <h1
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(28px, 5vw, 40px)",
                fontWeight: 700,
                color: "var(--color-cream)",
                marginBottom: "12px",
              }}
            >
              Members Only
            </h1>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "16px",
                color: "var(--color-text-tertiary)",
                marginBottom: "32px",
                lineHeight: 1.6,
              }}
            >
              Sign in to access the Hunt Map
            </p>
            <button
              onClick={signIn}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                fontWeight: 600,
                color: "#0D0B0E",
                padding: "12px 32px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                border: "none",
                cursor: "pointer",
                transition: "opacity 300ms ease",
              }}
            >
              Sign In
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1100 }}>
        <Navigation />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ width: "100%", height: "100%" }}
      >
        <HuntMap />
      </motion.div>
    </div>
  );
}

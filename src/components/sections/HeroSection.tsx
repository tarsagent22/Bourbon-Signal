"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "../ScrollReveal";

export default function HeroSection() {
  const ref = useRef(null);

  return (
    <section
      ref={ref}
      className="relative flex items-end justify-center overflow-hidden"
      style={{
        height: "100vh",
        minHeight: "720px",
        maxHeight: "980px",
        backgroundColor: "#090806",
      }}
    >
      {/* Hero background image */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          filter: "blur(1.5px) brightness(0.48)",
          transform: "scale(1.045)",
        }}
      />

      {/* Minimal readability overlays */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8, 6, 4, 0.24) 0%, rgba(8, 6, 4, 0.10) 26%, rgba(8, 6, 4, 0.16) 72%, rgba(8, 6, 4, 0.42) 100%)",
        }}
      />

      <div
        className="absolute inset-x-0 top-0 z-[1] pointer-events-none"
        style={{
          height: "96px",
          background:
            "linear-gradient(to bottom, rgba(8, 6, 4, 0.26) 0%, transparent 100%)",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute z-[2] w-[600px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.04) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Content overlay — vertically centered */}
      <div
        className="absolute z-[3] px-12 sm:px-16 md:px-24 lg:px-32 max-w-[900px] mx-auto"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <ScrollReveal delay={0}>
          <h1
            className="mb-5"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(34px, 7vw, 66px)",
              lineHeight: 1.02,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: "var(--color-cream, #F5EDD6)",
              textShadow: "0 4px 24px rgba(0,0,0,0.7)",
              maxWidth: "900px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
Live bourbon intel.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={50}>
          <p
            className="mx-auto max-w-[680px]"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "17px",
              lineHeight: 1.65,
              color: "var(--color-text-secondary)",
              textShadow: "0 2px 12px rgba(0,0,0,0.8)",
              marginBottom: "18px",
            }}
          >
            <span style={{ display: "block", fontWeight: 700, color: "var(--color-cream)", marginBottom: "6px" }}>
              Catch the signal early.
            </span>
            Track real-time allocated bourbon activity across NC, VA, and PA.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div
            className="flex flex-col sm:flex-row items-center gap-4"
            style={{ marginBottom: "16px" }}
          >
            <a
              href="/pricing"
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                fontWeight: 600,
                color: "#0D0B0E",
                background:
                  "linear-gradient(135deg, var(--color-accent-amber) 0%, var(--color-accent-gold) 100%)",
                borderRadius: "8px",
                padding: "14px 28px",
                textDecoration: "none",
                transition: "opacity 200ms, transform 200ms",
                boxShadow: "0 4px 16px rgba(196, 135, 10, 0.3)",
              }}
            >
Become a Member
              <ArrowRight size={16} />
            </a>

            <a
              href="#drops"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                fontWeight: 500,
                color: "rgba(245, 237, 214, 0.6)",
                textDecoration: "none",
                cursor: "pointer",
                transition: "color 200ms",
                padding: "14px 16px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(245, 237, 214, 0.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(245, 237, 214, 0.6)";
              }}
            >
              View Live Feed ↓
            </a>
          </div>
        </ScrollReveal>
      </div>

      {/* Scroll indicator removed — ↓ is inline with "See Live Drops" */}
    </section>
  );
}

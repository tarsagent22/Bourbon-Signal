"use client";

import { useRef, useState, FormEvent } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown, ArrowRight } from "lucide-react";
import ScrollReveal from "../ScrollReveal";
import BottleCarousel3D from "../BottleCarousel3D";

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative flex items-end justify-center overflow-hidden"
      style={{ height: "max(60vh, 500px)", minHeight: "500px" }}
    >
      {/* 3D Carousel Background */}
      <BottleCarousel3D />

      {/* Bottom vignette gradient */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 30%, rgba(13, 11, 7, 0.4) 55%, #0D0B07 100%)",
        }}
      />

      {/* Top vignette for nav blending */}
      <div
        className="absolute inset-x-0 top-0 z-[1] pointer-events-none"
        style={{
          height: "120px",
          background:
            "linear-gradient(to bottom, rgba(13, 11, 7, 0.6) 0%, transparent 100%)",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute z-[2] w-[600px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.06) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Content overlay — positioned in lower third */}
      <div
        className="relative z-[3] px-8 sm:px-10 md:px-16 lg:px-24 max-w-[800px] mx-auto pb-16"
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <ScrollReveal delay={0}>
          <h1
            className="mb-5 max-md:!text-[38px]"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "72px",
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--color-cream, #F5EDD6)",
              textShadow: "0 4px 24px rgba(0,0,0,0.7)",
            }}
          >
            NEVER MISS A DROP.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={50}>
          <p
            className="mx-auto max-w-[480px]"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              textShadow: "0 2px 12px rgba(0,0,0,0.8)",
              marginBottom: "32px",
            }}
          >
            Real-time alerts when allocated bourbon hits your state&apos;s shelves.
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
              Get Early Access
              <ArrowRight size={16} />
            </a>

            <a
              href="#drops"
              className="flex items-center gap-1"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                transition: "color 200ms",
                padding: "14px 16px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              See Live Drops
              <ChevronDown size={16} />
            </a>
          </div>
        </ScrollReveal>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[3]"
        style={{ opacity: chevronOpacity }}
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown
            size={28}
            style={{ color: "var(--color-text-tertiary)" }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}

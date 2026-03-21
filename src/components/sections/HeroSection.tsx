"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Bell, MapPin } from "lucide-react";
import ScrollReveal from "../ScrollReveal";
import Button from "../Button";
import GlassCard from "../GlassCard";
import Badge from "../Badge";

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      ref={ref}
      className="relative flex items-center justify-center overflow-hidden"
      style={{ minHeight: "max(100vh, 600px)" }}
    >
      {/* Parallax background image */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{ y }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/hero-bg.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: "blur(1.5px)",
            transform: "scale(1.05)",
          }}
        />
      </motion.div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to top, var(--color-bg-primary) 0%, rgba(13, 11, 14, 0.85) 40%, rgba(13, 11, 14, 0.6) 100%)",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute z-[2] w-[600px] h-[400px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.15) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div className="relative z-[3] text-center px-6 sm:px-8 md:px-16 lg:px-24 max-w-[800px] mx-auto">
        <ScrollReveal delay={0}>
          <p
            className="uppercase mb-6"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              letterSpacing: "0.15em",
              color: "var(--color-accent-amber)",
              fontWeight: 500,
            }}
          >
            ALLOCATED BOURBON INTELLIGENCE
          </p>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <h1
            className="mb-6"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(36px, 6vw, 64px)",
              lineHeight: 1.1,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Never Miss a Drop.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <p
            className="mx-auto mb-10 max-w-[600px]"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
            }}
          >
            Know when allocated bourbon hits shelves — before the crowds.
            Real-time warehouse tracking, shipment alerts, and store-level
            intelligence.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="primary">Become a Founder — $69</Button>
            <Button variant="ghost" onClick={scrollToHowItWorks}>See How It Works</Button>
          </div>
        </ScrollReveal>

        {/* Product preview — sample alert card */}
        <ScrollReveal delay={500}>
          <div className="mt-12 max-w-[420px] mx-auto">
            <GlassCard hoverable={false} className="!p-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{
                    width: "40px",
                    height: "40px",
                    backgroundColor: "rgba(212, 146, 11, 0.12)",
                    border: "1px solid var(--color-card-border)",
                  }}
                >
                  <Bell size={18} style={{ color: "var(--color-accent-amber)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      Weller 12 Year — Allocated Drop
                    </span>
                    <Badge variant="allocated">New</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} style={{ color: "var(--color-text-tertiary)" }} />
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "12px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      Shipped to Board — Raleigh, NC
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    Just now
                  </span>
                </div>
              </div>
            </GlassCard>
          </div>
        </ScrollReveal>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[3]"
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

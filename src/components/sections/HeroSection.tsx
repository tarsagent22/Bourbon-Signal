"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown, MapPin, Truck } from "lucide-react";
import ScrollReveal from "../ScrollReveal";
import Button from "../Button";
import GlassCard from "../GlassCard";

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

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
      <div className="relative z-[3] text-center px-6 sm:px-8 md:px-16 lg:px-24 max-w-[800px] mx-auto pt-24">
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
            className="mb-6 max-md:!text-[40px]"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "64px",
              lineHeight: 1.1,
              fontWeight: 700,
              background: "linear-gradient(135deg, var(--color-text-primary) 0%, var(--color-accent-amber) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
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
          <div className="flex flex-col items-center gap-3">
            <Button variant="primary">Claim Your Spot — $69</Button>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              100 founding spots · Lifetime access · No monthly fees
            </p>
          </div>
        </ScrollReveal>

        {/* Product mockup — alert notification card */}
        <ScrollReveal delay={500}>
          <div className="mt-12 mb-8 flex justify-center">
            <GlassCard
              accent
              hoverable={false}
              className="max-w-[420px] w-full !p-0 overflow-hidden"
              style={{
                transform: "perspective(1000px) rotateX(5deg) rotateY(-2deg)",
                boxShadow: "0 20px 60px rgba(212, 146, 11, 0.15), 0 8px 24px rgba(0, 0, 0, 0.4)",
              }}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  borderBottom: "1px solid var(--color-card-border)",
                  backgroundColor: "rgba(212, 146, 11, 0.06)",
                }}
              >
                <span style={{ fontSize: "18px" }}>🥃</span>
                <span
                  className="uppercase"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    color: "var(--color-accent-amber)",
                  }}
                >
                  ALLOCATED DROP ALERT
                </span>
                <span
                  className="ml-auto inline-block w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: "var(--color-accent-amber)",
                    animation: "pulseDot 2s ease-in-out infinite",
                  }}
                />
              </div>
              {/* Card body */}
              <div className="px-5 py-4 text-left">
                <h4
                  className="mb-1"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Weller 12 Year
                </h4>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                    }}
                  >
                    6 cases
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    ·
                  </span>
                  <span
                    className="flex items-center gap-1"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <Truck size={13} style={{ color: "var(--color-text-tertiary)" }} />
                    Shipped to Wake County Board
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "12px",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    47 minutes ago
                  </span>
                  <span
                    className="flex items-center gap-1 cursor-pointer"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--color-accent-amber)",
                    }}
                  >
                    <MapPin size={13} />
                    View on Map →
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

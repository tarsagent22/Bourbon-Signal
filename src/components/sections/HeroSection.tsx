"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import ScrollReveal from "../ScrollReveal";
import Button from "../Button";

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
            backgroundImage:
              'url("https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=1920&q=80&auto=format&fit=crop")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
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
      <div className="relative z-[3] text-center px-6 max-w-[800px] mx-auto">
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
            BOURBON INTELLIGENCE FOR NORTH CAROLINA
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
            Know when allocated bourbon hits NC ABC shelves — before the crowds.
            Real-time warehouse tracking, shipment alerts, and store-level
            intelligence.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="primary">Start Hunting — $7.99/mo</Button>
            <Button variant="ghost">Try Free for 7 Days</Button>
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

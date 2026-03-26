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
      {/* Parallax background image — uses CSS will-change + transform3d for GPU compositing */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{
          y,
          willChange: "transform",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/hero-bg.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: "blur(1.5px)",
            transform: "scale(1.05) translateZ(0)",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        />
      </motion.div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to top, #0D0B07 0%, rgba(13, 11, 7, 0.92) 35%, rgba(13, 11, 7, 0.5) 100%)",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute z-[2] w-[600px] h-[400px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.08) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div className="relative z-[3] px-8 sm:px-10 md:px-16 lg:px-24 max-w-[800px] mx-auto pt-24" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <ScrollReveal delay={0}>
          <h1
            className="mb-14 max-md:!text-[38px]"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "72px",
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--color-text-primary)",
            }}
          >
            Never Miss a Drop.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <p
            className="mx-auto mb-16 max-w-[560px]"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}
          >
            Know the moment allocated whiskey moves — before the crowds.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-center gap-3">
            <a href="/pricing" style={{ textDecoration: "none" }}>
              <Button variant="primary">Become a Founding Member</Button>
            </a>
          </div>
        </ScrollReveal>

      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[3]"
        style={{ opacity: chevronOpacity }}
      >
        <motion.div
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown
            size={36}
            style={{ color: "var(--color-text-secondary)" }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}

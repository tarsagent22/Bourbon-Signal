"use client";

import { useRef, useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "../ScrollReveal";

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex items-end justify-center overflow-hidden"
      style={{ height: "100vh", minHeight: "600px" }}
    >
      {/* ── Video background ── */}
      {!reducedMotion && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: "scale(1.03)",
            opacity: videoReady ? 1 : 0,
            transition: "opacity 1.6s cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
          autoPlay
          muted
          loop
          playsInline
          poster="/hero-bg.jpg"
          onCanPlayThrough={() => setVideoReady(true)}
        >
          <source src="/hero-bg-video.mp4" type="video/mp4" />
        </video>
      )}

      {/* ── Static poster fallback (shows while video loads or if reduced-motion) ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          filter: "brightness(0.35) saturate(1.15)",
          transform: "scale(1.04)",
          opacity: videoReady && !reducedMotion ? 0 : 1,
          transition: "opacity 1.6s cubic-bezier(0.25, 0.1, 0.25, 1)",
        }}
      />

      {/* ── Cinematic color wash — warm amber cast over the video ── */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(160deg, rgba(15, 13, 9, 0.55) 0%, rgba(30, 20, 8, 0.3) 40%, rgba(15, 13, 9, 0.6) 100%)",
          mixBlendMode: "multiply",
        }}
      />

      {/* ── Heavy bottom gradient — seamless bleed into page ── */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 30%, rgba(15, 13, 9, 0.35) 50%, rgba(15, 13, 9, 0.7) 70%, var(--color-bg-primary) 100%)",
        }}
      />

      {/* ── Top edge fade for nav blending ── */}
      <div
        className="absolute inset-x-0 top-0 z-[1] pointer-events-none"
        style={{
          height: "140px",
          background:
            "linear-gradient(to bottom, rgba(15, 13, 9, 0.5) 0%, transparent 100%)",
        }}
      />

      {/* ── Side vignettes — cinematic framing ── */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 120% 100% at 50% 50%, transparent 50%, rgba(15, 13, 9, 0.5) 100%)",
        }}
      />

      {/* ── Amber ambient light bleed ── */}
      <div
        className="absolute z-[2] pointer-events-none"
        style={{
          width: "min(800px, 90vw)",
          height: "500px",
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.05) 0%, transparent 65%)",
          bottom: "10%",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* ── Content ── */}
      <div
        className="absolute z-[3] px-6 sm:px-10 md:px-16 lg:px-24 w-full"
        style={{
          bottom: "clamp(60px, 12vh, 140px)",
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "860px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <ScrollReveal delay={0}>
          <h1
            className="mb-5"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(38px, 8.5vw, 76px)",
              lineHeight: 0.95,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: "var(--color-cream, #F5EDD6)",
              textShadow:
                "0 2px 40px rgba(0,0,0,0.6), 0 8px 60px rgba(0,0,0,0.4)",
            }}
          >
            NEVER MISS A DROP.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={80}>
          <p
            className="mx-auto max-w-[500px]"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "clamp(16px, 2.2vw, 19px)",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              textShadow: "0 2px 20px rgba(0,0,0,0.9)",
              marginBottom: "36px",
            }}
          >
            Real-time alerts when allocated bourbon hits your state&apos;s
            shelves.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={180}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a
              href="/pricing"
              className="group flex items-center gap-2"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                fontWeight: 600,
                color: "#0D0B07",
                background:
                  "linear-gradient(135deg, var(--color-accent-amber) 0%, var(--color-accent-gold) 100%)",
                borderRadius: "6px",
                padding: "14px 30px",
                textDecoration: "none",
                transition:
                  "transform 200ms ease, box-shadow 200ms ease",
                boxShadow:
                  "0 4px 20px rgba(196, 135, 10, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 28px rgba(196, 135, 10, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 20px rgba(196, 135, 10, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)";
              }}
            >
              Get Early Access
              <ArrowRight
                size={16}
                style={{
                  transition: "transform 200ms ease",
                }}
                className="group-hover:translate-x-0.5"
              />
            </a>

            <a
              href="#drops"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                fontWeight: 500,
                color: "rgba(245, 237, 214, 0.55)",
                textDecoration: "none",
                cursor: "pointer",
                transition: "color 250ms ease",
                padding: "14px 16px",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(245, 237, 214, 0.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(245, 237, 214, 0.55)";
              }}
            >
              See Live Drops ↓
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

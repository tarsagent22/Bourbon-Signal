"use client";

import ScrollReveal from "../ScrollReveal";

export default function FinalCTA() {
  return (
    <section
      className="py-28 sm:py-32 px-6 sm:px-8 md:px-16 lg:px-24 relative overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      {/* Subtle warm glow in center */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-2xl text-center">
        <ScrollReveal>
          <h2
            className="mb-4 !text-[40px] max-md:!text-[32px]"
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            The hunt starts now.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <p
            className="mb-10"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              color: "var(--color-text-secondary)",
            }}
          >
            Start with a 7-day free trial.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-center gap-4">
            <a
              href="/pricing?source=homepage-final-try-free"
              className="inline-flex items-center justify-center rounded-lg font-medium transition-all duration-250"
              style={{
                background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                color: "#0D0B0E",
                padding: "14px 28px",
                fontSize: "15px",
                fontFamily: "var(--font-dm-sans)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Try free
            </a>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              Plans start at $3/month after the trial.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

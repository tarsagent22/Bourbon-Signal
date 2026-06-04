"use client";

import ScrollReveal from "../ScrollReveal";
import Button from "../Button";

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
            Tester access is open while we validate live signal quality.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-center gap-4">
            <Button variant="primary">Join the Beta</Button>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              No payment required during tester validation.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

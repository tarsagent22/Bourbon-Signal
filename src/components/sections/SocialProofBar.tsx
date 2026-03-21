"use client";

import ScrollReveal from "../ScrollReveal";
import GlassCard from "../GlassCard";

export default function SocialProofBar() {
  return (
    <section
      className="py-16 sm:py-20"
      style={{
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      <div className="mx-auto max-w-[600px] px-6 sm:px-8 md:px-16 lg:px-24">
        <ScrollReveal>
          <GlassCard hoverable={false} className="text-center !py-8 !px-6">
            <span
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "48px",
                lineHeight: 1,
                color: "rgba(212, 146, 11, 0.2)",
              }}
            >
              &ldquo;
            </span>
            <p
              className="mt-2 mb-4"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "17px",
                lineHeight: 1.7,
                fontStyle: "italic",
                color: "var(--color-text-primary)",
              }}
            >
              I scored a Blanton&apos;s before the Facebook groups even knew it dropped.
            </p>
            <div className="flex items-center justify-center gap-3">
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: "32px",
                  height: "32px",
                  backgroundColor: "var(--color-bg-tertiary)",
                  border: "1px solid var(--color-card-border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-accent-amber)",
                  }}
                >
                  MK
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                — Hunter in Raleigh
              </span>
            </div>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}

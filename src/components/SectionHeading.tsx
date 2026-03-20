"use client";

import ScrollReveal from "./ScrollReveal";

interface SectionHeadingProps {
  heading: string;
  subheading?: string;
  centered?: boolean;
}

export default function SectionHeading({
  heading,
  subheading,
  centered = true,
}: SectionHeadingProps) {
  return (
    <div className={`mb-14 ${centered ? "text-center" : ""}`}>
      <ScrollReveal>
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontWeight: 700,
            lineHeight: 1.15,
            color: "var(--color-text-primary)",
          }}
          className="!text-[48px] max-md:!text-[32px]"
        >
          {heading}
        </h2>
      </ScrollReveal>
      {subheading && (
        <ScrollReveal delay={100}>
          <p
            className="mt-4 mx-auto max-w-xl"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
            }}
          >
            {subheading}
          </p>
        </ScrollReveal>
      )}
    </div>
  );
}

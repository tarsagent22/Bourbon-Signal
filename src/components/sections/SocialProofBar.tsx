"use client";

import ScrollReveal from "../ScrollReveal";
import StatCard from "../StatCard";

export default function SocialProofBar() {
  return (
    <section
      className="py-16 sm:py-20"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderTop: "1px solid var(--color-card-border)",
        borderBottom: "1px solid var(--color-card-border)",
      }}
    >
      <div className="mx-auto max-w-5xl px-6 sm:px-8 md:px-16 lg:px-24">
        <ScrollReveal>
          <div className="grid grid-cols-3 gap-4 sm:gap-8">
            <StatCard value={847} label="stores monitored nationwide" />
            <StatCard value={2340} label="drops detected this month" />
            <StatCard value={100} label="founding spots available" />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

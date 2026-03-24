"use client";

import { useRef, useState, useEffect } from "react";
import { useInView } from "framer-motion";
import ScrollReveal from "../ScrollReveal";

interface StatItem {
  value: number | null;
  label: string;
  suffix: string;
  displayText?: string;
}

const stats: StatItem[] = [
  { value: 43, label: "Bottles tracked", suffix: "+" },
  { value: 100, label: "NC ABC stores monitored", suffix: "+" },
  { value: null, label: "From drop to your phone", suffix: "", displayText: "Minutes" },
];

function useCountUp(target: number | null, duration: number, inView: boolean) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!inView || hasAnimated.current || target === null) return;
    hasAnimated.current = true;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [inView, target, duration]);

  return count;
}

function ValueStatCard({ stat }: { stat: StatItem }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const count = useCountUp(stat.value, 2000, isInView);

  return (
    <div
      ref={ref}
      style={{
        flex: 1,
        minWidth: "160px",
        background: "rgba(255,255,255,0.02)",
        borderRadius: "12px",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "32px",
          fontWeight: 700,
          color: "var(--color-amber-rich)",
          marginBottom: "8px",
        }}
      >
        {stat.displayText ?? `${count}${stat.suffix}`}
      </div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "13px",
          color: "var(--color-text-tertiary)",
        }}
      >
        {stat.label}
      </div>
    </div>
  );
}

export default function ValueStats() {
  return (
    <section
      style={{
        width: "100%",
        paddingTop: "24px",
        paddingBottom: "64px",
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 48px)",
        }}
      >
        <ScrollReveal>
          <div
            className="flex flex-col sm:flex-row gap-4"
            style={{ justifyContent: "center" }}
          >
            {stats.map((stat) => (
              <ValueStatCard key={stat.label} stat={stat} />
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              fontStyle: "italic",
              color: "var(--color-text-secondary)",
              textAlign: "center",
              marginTop: "32px",
            }}
          >
            Built by bourbon hunters, for bourbon hunters.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

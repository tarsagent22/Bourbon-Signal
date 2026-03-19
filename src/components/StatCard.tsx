"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface StatCardProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
}

function useCountUp(target: number, duration: number = 2000, inView: boolean) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOut curve
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [inView, target, duration]);

  return count;
}

export default function StatCard({ value, label, prefix = "", suffix = "" }: StatCardProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const count = useCountUp(value, 2000, isInView);

  return (
    <div ref={ref} className="text-center">
      <div
        className="font-bold"
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "32px",
          color: "var(--color-accent-amber)",
        }}
      >
        {prefix}
        {count.toLocaleString()}
        {suffix}
      </div>
      <div
        className="mt-3"
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "14px",
          color: "var(--color-text-secondary)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

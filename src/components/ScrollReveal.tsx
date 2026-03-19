"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  delay?: number;
  direction?: "up" | "left" | "right";
  once?: boolean;
  className?: string;
}

export default function ScrollReveal({
  children,
  delay = 0,
  direction = "up",
  once = true,
  className,
}: ScrollRevealProps) {
  const directionMap = {
    up: { y: 30, x: 0 },
    left: { x: -30, y: 0 },
    right: { x: 30, y: 0 },
  };

  const offset = directionMap[direction];

  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        transition: {
          duration: 0.6,
          delay: delay / 1000,
          ease: [0.25, 0.1, 0.25, 1],
        },
      }}
      viewport={{ once, margin: "-50px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

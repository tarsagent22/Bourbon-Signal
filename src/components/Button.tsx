"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface ButtonProps {
  variant?: "primary" | "ghost";
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
}

export default function Button({
  variant = "primary",
  children,
  onClick,
  className = "",
  type = "button",
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-250 cursor-pointer";

  const variants = {
    primary: {
      background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
      color: "#0D0B0E",
      padding: "14px 28px",
      border: "2px solid transparent",
      fontSize: "15px",
      fontFamily: "var(--font-dm-sans)",
      fontWeight: 500,
    },
    ghost: {
      backgroundColor: "transparent",
      color: "var(--color-accent-amber)",
      padding: "14px 28px",
      border: "2px solid var(--color-accent-amber)",
      fontSize: "15px",
      fontFamily: "var(--font-dm-sans)",
      fontWeight: 500,
    },
  };

  return (
    <motion.button
      type={type}
      className={`${baseStyles} ${className}`}
      style={variants[variant]}
      whileHover={{
        scale: 1.02,
        backgroundColor:
          variant === "primary"
            ? "var(--color-accent-gold)"
            : "var(--color-accent-amber)",
        color: "#0D0B0E",
        transition: { duration: 0.25 },
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

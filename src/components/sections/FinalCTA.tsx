"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle } from "lucide-react";
import ScrollReveal from "../ScrollReveal";
import Button from "../Button";

export default function FinalCTA() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <section
      className="py-24 px-6 sm:px-8 md:px-16 lg:px-24 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(to bottom, var(--color-bg-secondary), var(--color-bg-primary))",
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
            The Next Drop Won&apos;t Wait.
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
            Be one of the first 100. Lock in lifetime access for $69.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <AnimatePresence mode="wait">
            {!submitted ? (
              <motion.form
                key="form"
                className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <input
                  type="email"
                  placeholder="Enter your email"
                  required
                  className="w-full sm:w-[400px] px-5 py-3.5 rounded-lg outline-none transition-all duration-300"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    border: "1px solid var(--color-card-border)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor =
                      "var(--color-accent-amber)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor =
                      "var(--color-card-border)")
                  }
                />
                <Button variant="primary" type="submit">
                  Claim Your Spot
                </Button>
              </motion.form>
            ) : (
              <motion.div
                key="success"
                className="flex items-center justify-center gap-3 py-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <CheckCircle
                  size={24}
                  style={{ color: "var(--color-success)" }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "18px",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  You&apos;re in. Check your email.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {!submitted && (
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              100 founding member spots at $69 lifetime. This offer will never return.
            </p>
          )}
        </ScrollReveal>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUpVariant } from "@/lib/animations";
import ScrollReveal from "@/components/ScrollReveal";

export default function EmailCapture() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleStateLink = (e: React.MouseEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        paddingTop: "80px",
        paddingBottom: "80px",
        width: "100%",
        borderTop: "none",
      }}
    >
      <div
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 40px)",
          textAlign: "center",
        }}
      >
        <ScrollReveal>
          {/* Headline */}
          <h2
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(24px, 5vw, 34px)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            Get a free weekly drop digest.
          </h2>

          {/* Subtext */}
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "15px",
              color: "var(--color-text-secondary)",
              lineHeight: 1.65,
              marginBottom: "36px",
              textAlign: "center",
            }}
          >
            One email per week with the biggest drops, rarest sightings, and market intel.
            No spam. Unsubscribe anytime.
          </p>

          {/* Form / Thank-you swap */}
          <AnimatePresence mode="wait">
            {!submitted ? (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                style={{
                  display: "flex",
                  gap: "10px",
                  maxWidth: "460px",
                  margin: "0 auto",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    flex: "1 1 220px",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--color-accent-amber)";
                    e.target.style.outline = "none";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "12px 24px",
                    borderRadius: "8px",
                    border: "none",
                    background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: "#1A1510",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                    boxShadow: "0 4px 20px rgba(196,148,58,0.25)",
                    transition: "box-shadow 0.2s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(196,148,58,0.45)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(196,148,58,0.25)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                  }}
                  onMouseDown={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                  }}
                >
                  Subscribe
                </button>
              </motion.form>
            ) : (
              <motion.div
                key="thanks"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  padding: "16px 24px",
                  borderRadius: "10px",
                  border: "1px solid rgba(196,148,58,0.25)",
                  background: "rgba(196,148,58,0.06)",
                  maxWidth: "380px",
                  margin: "0 auto",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--color-accent-gold)",
                    margin: 0,
                  }}
                >
                  🥃 Thanks! You&apos;re on the list.
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    margin: "6px 0 0",
                  }}
                >
                  First digest drops next weekend.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Secondary link removed */}
        </ScrollReveal>
      </div>
    </section>
  );
}

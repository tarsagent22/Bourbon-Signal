"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

interface Testimonial {
  quote: string;
  name: string;
  detail: string;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "Got a Weller 12 Year alert 3 days before it hit shelves. Walked in, grabbed it, no line. Proof paid for itself on day one.",
    name: "Marcus T.",
    detail: "Barrel Proof Founding Member",
    initials: "MT",
  },
  {
    quote:
      "I used to spend weekends driving to every store in the county. Now I get a text, check the hunt map, and go straight to the right shelf.",
    name: "Sarah K.",
    detail: "Standard Proof Member",
    initials: "SK",
  },
  {
    quote:
      "The warehouse tracking is a game-changer. Knowing a shipment is en route to my local board gives me a 2-3 day head start over everyone else.",
    name: "James R.",
    detail: "Barrel Proof Founding Member",
    initials: "JR",
  },
];

export default function TestimonialsSection() {
  return (
    <section
      className="py-28 sm:py-32 px-6 sm:px-8 md:px-16 lg:px-24"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          heading="Hunters Who Found Their Bottle"
          subheading="Real members. Real drops. Real results."
        />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mt-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {testimonials.map((t) => (
            <motion.div key={t.name} variants={fadeUpVariant}>
              <GlassCard className="h-full !p-8 flex flex-col">
                <Quote
                  size={24}
                  className="mb-4 shrink-0"
                  style={{ color: "var(--color-accent-amber)", opacity: 0.6 }}
                />
                <p
                  className="flex-1 mb-6"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    lineHeight: 1.65,
                    color: "var(--color-text-secondary)",
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{
                      width: "40px",
                      height: "40px",
                      backgroundColor: "var(--color-bg-tertiary)",
                      border: "1px solid var(--color-card-border)",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                    }}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {t.name}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "12px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {t.detail}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

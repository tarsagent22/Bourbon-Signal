"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUpVariant, staggerContainer } from "@/lib/animations";
import ScrollReveal from "@/components/ScrollReveal";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "How fast are the drop alerts?",
    answer:
      "Most alerts fire within minutes of data hitting the state system. Shipment alerts go out the same day the warehouse logs the transfer, when that level of source data is available.",
  },
  {
    question: "What states do you cover?",
    answer:
      "We currently track live bourbon drops, store inventory hits, and board shipment leads across North Carolina, Virginia, Pennsylvania, Ohio, Indiana, Tennessee, Illinois, and Alabama. Depth varies by state, and we only surface what we can support honestly.",
  },
  {
    question: "What is a unicorn / allocated / limited bottle?",
    answer:
      "Unicorn bottles are the rarest — think Pappy, BTAC, or Old Fitzgerald. Allocated bottles are limited distribution controlled by the state. Limited releases are short-run productions that sell out fast but aren't state-controlled.",
  },
];

function AccordionItem({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <motion.div
      variants={fadeUpVariant}
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left"
        style={{
          padding: "20px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          gap: "16px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "16px",
            fontWeight: 500,
            color: isOpen ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            transition: "color 200ms",
          }}
        >
          {item.question}
        </span>
        <motion.span
          className="shrink-0"
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            color: "var(--color-accent-amber)",
            fontSize: "22px",
            fontWeight: 300,
            lineHeight: 1,
            width: "22px",
            height: "22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                color: "var(--color-text-secondary)",
                lineHeight: 1.7,
                paddingBottom: "20px",
                paddingRight: "40px",
              }}
            >
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id="faq"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        paddingTop: "64px",
        paddingBottom: "64px",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "680px",
          margin: "0 auto",
          paddingLeft: "clamp(20px, 5vw, 48px)",
          paddingRight: "clamp(20px, 5vw, 48px)",
        }}
      >
        <ScrollReveal>
          <h2
            className="text-center"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "36px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: "32px",
            }}
          >
            Before You Hunt
          </h2>
        </ScrollReveal>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              item={faq}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

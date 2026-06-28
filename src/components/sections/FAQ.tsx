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
    question: "What can I see before paying?",
    answer:
      "Free accounts get a real preview: limited Drop Feed rows, demo access to member tools, and 3 Bottle Checks. Saving alerts, Member Sightings, collection data, and personalized recommendations requires a paid membership.",
  },
  {
    question: "How do alert areas work?",
    answer:
      "An alert area is a market you want watched — a state, ABC board, city, county, or supported store-level area depending on the data available in that state. Standard includes 5 specific areas. Barrel and Bottled in Bond remove the area limit.",
  },
  {
    question: "Are Drop Feed signals guaranteed inventory?",
    answer:
      "No. Bourbon Signal surfaces fresh public signals and source-backed leads, but inventory can move quickly. Store-level signals are the most actionable; board or area-level signals should be treated as leads to verify before driving.",
  },
  {
    question: "What makes paid alerts different from browsing the feed?",
    answer:
      "The feed is for browsing fresh signals. Alerts watch your chosen areas and bottles for you, then surface matches when something relevant appears. Paid members can save preferences instead of manually checking the site all day.",
  },
  {
    question: "What is Bottle Check?",
    answer:
      "Bottle Check helps you quickly evaluate a bottle — rarity, MSRP context, whether it is worth chasing, and how it fits your bourbon preferences. Free accounts get 3 checks; paid members get unlimited checks.",
  },
  {
    question: "How do My Collection and recommendations work?",
    answer:
      "My Collection is where you save bottles you own or have tasted. As you rate bottles, Bourbon Signal builds a simple Bourbon DNA profile and recommends bottles that better match your taste, proof range, and hunting priorities.",
  },
  {
    question: "What is different about Bottled in Bond?",
    answer:
      "Bottled in Bond is the limited founder pass: one-time lifetime access to current and future paid Bourbon Signal features, plus founder-only perks like a profile badge, founder number, and numbered glass while the 100 founder spots are available.",
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

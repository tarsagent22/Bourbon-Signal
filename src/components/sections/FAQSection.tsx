"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import SectionHeading from "../SectionHeading";
import ScrollReveal from "../ScrollReveal";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "How fast are the drop alerts?",
    answer:
      "Our engine scans state warehouse systems every 15 minutes. The moment a bottle enters the distribution pipeline, you get an alert via email and SMS — typically 2-3 days before it reaches store shelves.",
  },
  {
    question: "Which states and stores do you cover?",
    answer:
      "We currently track state-controlled markets across 18 states with warehouse-level data, plus community-confirmed drops in all 50 states. Coverage expands every month as we onboard new data sources.",
  },
  {
    question: "What's the difference between Standard and Barrel Proof?",
    answer:
      "Standard Proof ($10/mo) gives you full access to alerts, the hunt map, and all tracking features. Barrel Proof ($69 one-time) gives you everything in Standard — forever, with no monthly fees — plus founding member exclusives like the Inner Circle group, numbered Glencairn topper, and 2x drawing entries.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Standard Proof is month-to-month with no contracts — cancel anytime from your account settings. Barrel Proof is a one-time payment with lifetime access, so there's nothing to cancel. Both plans include a 7-day money-back guarantee.",
  },
  {
    question: "How accurate is the tracking data?",
    answer:
      "Our warehouse and shipment data comes directly from state distribution systems, giving us 94% accuracy on arrival predictions. Store-level data is a mix of automated inventory feeds and community confirmations.",
  },
  {
    question: "Do I need an account to see the drop feed?",
    answer:
      "The public drop feed is available to everyone on a delay. Proof members see alerts in real-time the moment they happen, plus get access to the full hunt map, historical patterns, and personalized watchlists.",
  },
];

function FAQAccordionItem({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        borderBottom: "1px solid var(--color-card-border)",
      }}
    >
      <button
        className="w-full flex items-center justify-between py-5 px-1 text-left cursor-pointer"
        onClick={onToggle}
        style={{ background: "none", border: "none" }}
      >
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "16px",
            fontWeight: 500,
            color: isOpen ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            transition: "color 300ms ease",
            paddingRight: "16px",
          }}
        >
          {item.question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="shrink-0"
        >
          <ChevronDown
            size={20}
            style={{ color: isOpen ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}
          />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <p
              className="pb-5 px-1"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                lineHeight: 1.65,
                color: "var(--color-text-tertiary)",
              }}
            >
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      className="py-28 sm:py-32 px-6 sm:px-8 md:px-16 lg:px-24"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      <div className="mx-auto max-w-2xl">
        <SectionHeading heading="Frequently Asked Questions" />

        <ScrollReveal>
          <div className="mt-4">
            {faqs.map((faq, i) => (
              <FAQAccordionItem
                key={faq.question}
                item={faq}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

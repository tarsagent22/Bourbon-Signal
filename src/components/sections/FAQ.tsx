"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUpVariant, staggerContainer } from "@/lib/animations";
import ScrollReveal from "@/components/ScrollReveal";
import { getFaqItems, type FaqItem, type FaqVariant } from "@/lib/faq-content";

function AccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  const id = useId();
  const triggerId = `faq-trigger-${id}`;
  const panelId = `faq-panel-${id}`;

  return (
    <motion.div variants={fadeUpVariant} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        id={triggerId}
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left"
        aria-expanded={isOpen}
        aria-controls={panelId}
        style={{ padding: "20px 0", background: "none", border: "none", cursor: "pointer", gap: "16px" }}
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
          aria-hidden="true"
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
        {isOpen ? (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={triggerId}
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
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQ({
  variant = "product",
  founderSpotsRemaining = null,
}: {
  variant?: FaqVariant;
  founderSpotsRemaining?: number | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqs = getFaqItems(variant, { founderSpotsRemaining });
  const heading = variant === "pricing" ? "Membership Questions" : "Before You Hunt";

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
          maxWidth: "760px",
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
            {heading}
          </h2>
        </ScrollReveal>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {faqs.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              item={faq}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

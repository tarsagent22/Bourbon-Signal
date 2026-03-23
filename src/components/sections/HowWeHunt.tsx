"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant, fadeRightVariant } from "@/lib/animations";
import ScrollReveal from "@/components/ScrollReveal";

interface Step {
  number: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "The Mash",
    description:
      "We monitor state liquor control boards, warehouse shipments, and distributor data daily.",
  },
  {
    number: "02",
    title: "The Distillation",
    description:
      "AI filters noise and identifies confirmed allocations, limited releases, and unicorn drops.",
  },
  {
    number: "03",
    title: "The Barrel",
    description:
      "Every drop is tagged by bottle, tier, store location, and county.",
  },
  {
    number: "04",
    title: "The Pour",
    description:
      "Instant alerts hit your phone the moment a bottle you're watching lands on a shelf.",
  },
];

function StillIllustration() {
  return (
    <svg
      viewBox="0 0 400 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%", maxHeight: "520px" }}
    >
      {/* Pot still body — large onion-shaped vessel */}
      <ellipse
        cx="160"
        cy="380"
        rx="100"
        ry="70"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.5"
      />
      {/* Pot still bottom curve */}
      <path
        d="M60 380 Q60 440 110 460 Q160 475 210 460 Q260 440 260 380"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.5"
        fill="none"
      />
      {/* Pot still neck — rising from the pot */}
      <path
        d="M130 312 Q130 280 140 250 Q150 220 155 200"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.5"
        fill="none"
      />
      <path
        d="M190 312 Q190 280 180 250 Q170 220 165 200"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.5"
        fill="none"
      />
      {/* Swan neck — curving over to the right */}
      <path
        d="M155 200 Q155 160 170 140 Q190 115 220 110 Q260 105 290 115"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.55"
        fill="none"
      />
      <path
        d="M165 200 Q165 165 178 147 Q195 125 225 120 Q260 115 290 123"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.55"
        fill="none"
      />
      {/* Lyne arm — horizontal pipe to condenser */}
      <line
        x1="290"
        y1="115"
        x2="320"
        y2="130"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <line
        x1="290"
        y1="123"
        x2="320"
        y2="138"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.45"
      />
      {/* Condenser coil — zigzag/spiral going down */}
      <path
        d="M320 130 Q340 140 325 160 Q310 180 330 195 Q350 210 335 230 Q320 250 340 265 Q360 280 345 300 Q330 320 350 335 Q365 345 350 365"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.4"
        fill="none"
      />
      {/* Condenser water jacket outline */}
      <rect
        x="305"
        y="140"
        width="60"
        height="230"
        rx="4"
        stroke="var(--color-amber-rich)"
        strokeWidth="1"
        opacity="0.2"
        fill="none"
      />
      {/* Collection vessel — small barrel at bottom right */}
      <ellipse
        cx="350"
        cy="400"
        rx="30"
        ry="15"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <line
        x1="320"
        y1="400"
        x2="320"
        y2="440"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <line
        x1="380"
        y1="400"
        x2="380"
        y2="440"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <ellipse
        cx="350"
        cy="440"
        rx="30"
        ry="15"
        stroke="var(--color-amber-rich)"
        strokeWidth="1.5"
        opacity="0.45"
      />
      {/* Drip from condenser to collection */}
      <path
        d="M350 370 L350 385"
        stroke="var(--color-amber-rich)"
        strokeWidth="1"
        opacity="0.3"
        strokeDasharray="3 4"
      />
      {/* Furnace glow under pot */}
      <path
        d="M100 470 Q130 485 160 470 Q190 485 220 470"
        stroke="var(--color-amber-rich)"
        strokeWidth="1"
        opacity="0.25"
      />
      {/* Heat lines */}
      <line
        x1="130"
        y1="480"
        x2="130"
        y2="495"
        stroke="var(--color-amber-rich)"
        strokeWidth="0.75"
        opacity="0.15"
      />
      <line
        x1="160"
        y1="482"
        x2="160"
        y2="500"
        stroke="var(--color-amber-rich)"
        strokeWidth="0.75"
        opacity="0.15"
      />
      <line
        x1="190"
        y1="480"
        x2="190"
        y2="495"
        stroke="var(--color-amber-rich)"
        strokeWidth="0.75"
        opacity="0.15"
      />
    </svg>
  );
}

export default function HowWeHunt() {
  return (
    <section
      id="how-we-hunt"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        paddingTop: "96px",
        paddingBottom: "96px",
        width: "100%",
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: "1100px",
          paddingLeft: "clamp(16px, 4vw, 48px)",
          paddingRight: "clamp(16px, 4vw, 48px)",
        }}
      >
        {/* Section header */}
        <ScrollReveal>
          <p
            className="text-center"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--color-accent-amber)",
              marginBottom: "16px",
            }}
          >
            THE PROCESS
          </p>
          <h2
            className="text-center"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "44px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: "16px",
            }}
          >
            How We Hunt
          </h2>
          <p
            className="text-center mx-auto"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "17px",
              color: "var(--color-text-secondary)",
              maxWidth: "520px",
              marginBottom: "64px",
            }}
          >
            From raw data to your phone in minutes. Same process, distilled for speed.
          </p>
        </ScrollReveal>

        {/* Two-column layout: steps left, illustration right */}
        <motion.div
          className="flex flex-col-reverse lg:flex-row items-center gap-12 lg:gap-20"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Left — Steps */}
          <motion.div
            className="flex-1 w-full"
            variants={fadeUpVariant}
          >
            <div className="flex flex-col" style={{ gap: "0" }}>
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={fadeUpVariant}
                  className="flex gap-5"
                  style={{
                    padding: "24px 0",
                    borderBottom:
                      i < steps.length - 1
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "none",
                  }}
                >
                  {/* Step number */}
                  <span
                    className="shrink-0"
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--color-accent-amber)",
                      width: "28px",
                      paddingTop: "2px",
                    }}
                  >
                    {step.number}
                  </span>

                  {/* Step content */}
                  <div>
                    <h3
                      style={{
                        fontFamily: "var(--font-playfair)",
                        fontSize: "20px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        marginBottom: "6px",
                      }}
                    >
                      {step.title}
                    </h3>
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.6,
                      }}
                    >
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right — Still illustration */}
          <motion.div
            className="flex-1 w-full flex items-center justify-center"
            variants={fadeRightVariant}
            style={{
              maxWidth: "400px",
              opacity: 0.85,
            }}
          >
            <StillIllustration />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

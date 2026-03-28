"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import ScrollReveal from "../ScrollReveal";

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    console.log({ name, email });
    setSubmitted(true);
  };

  return (
    <section
      ref={ref}
      className="relative flex items-center justify-center overflow-hidden"
      style={{ minHeight: "max(100vh, 600px)" }}
    >
      {/* Parallax background image — uses CSS will-change + transform3d for GPU compositing */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{
          y,
          willChange: "transform",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/hero-bg.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: "blur(1.5px)",
            transform: "scale(1.05) translateZ(0)",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        />
      </motion.div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to top, #0D0B07 0%, rgba(13, 11, 7, 0.92) 35%, rgba(13, 11, 7, 0.5) 100%)",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute z-[2] w-[600px] h-[400px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.08) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div className="relative z-[3] px-8 sm:px-10 md:px-16 lg:px-24 max-w-[800px] mx-auto pt-24" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <ScrollReveal delay={0}>
          <h1
            className="mb-14 max-md:!text-[38px]"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "72px",
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--color-text-primary)",
            }}
          >
            Never Miss a Drop.
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <p
            className="mx-auto mb-16 max-w-[560px]"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}
          >
            Know the moment allocated whiskey moves — before the crowds.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: "420px" }}>
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                style={{
                  padding: "20px 24px",
                  borderRadius: "12px",
                  background: "rgba(196,148,58,0.08)",
                  border: "1px solid rgba(196,148,58,0.3)",
                }}
              >
                <p style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  marginBottom: "4px",
                }}>
                  You&apos;re in! 🥃
                </p>
                <p style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                }}>
                  Watch your inbox.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    outline: "none",
                    transition: "border-color 200ms",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(196,148,58,0.4)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                />
                <input
                  type="email"
                  placeholder="Your email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    outline: "none",
                    transition: "border-color 200ms",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(196,148,58,0.4)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                />
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: "8px",
                    border: "none",
                    background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: "#1A1510",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 4px 20px rgba(196,148,58,0.3)",
                    transition: "box-shadow 300ms, transform 300ms",
                    boxSizing: "border-box",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 6px 30px rgba(196,148,58,0.5)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(196,148,58,0.3)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  Get Free Drop Alerts
                </button>
              </form>
            )}

            <p style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-secondary)",
              marginTop: "12px",
              lineHeight: 1.5,
            }}>
              Founding members get personalized alerts + lifetime access.{" "}
              <a
                href="/pricing"
                style={{
                  color: "var(--color-accent-amber)",
                  textDecoration: "none",
                  fontWeight: 500,
                  borderBottom: "1px solid rgba(196,148,58,0.3)",
                  transition: "border-color 200ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(196,148,58,0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(196,148,58,0.3)")}
              >
                100 spots — $69
              </a>.
            </p>

            <p style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
              letterSpacing: "0.08em",
              marginTop: "8px",
            }}>
              Currently tracking NC &amp; VA · PA and Utah coming soon
            </p>
          </div>
        </ScrollReveal>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[3]"
        style={{ opacity: chevronOpacity }}
      >
        <motion.div
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown
            size={36}
            style={{ color: "var(--color-text-secondary)" }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}

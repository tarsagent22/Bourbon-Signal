"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Menu, X } from "lucide-react";

const navLinks = [
  { label: "Dashboard", href: "#" },
  { label: "Hunt Map", href: "#" },
  { label: "Bottles", href: "#" },
  { label: "Pricing", href: "#pricing" },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-16 lg:px-24"
        style={{
          height: scrolled ? "64px" : "72px",
          background: scrolled ? "var(--color-glass)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled
            ? "1px solid rgba(212, 146, 11, 0.08)"
            : "1px solid transparent",
          transition: "all 300ms ease",
        }}
      >
        {/* Logo */}
        <a href="/" className="flex items-baseline gap-0 ml-2 sm:ml-0">
          <span
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 700,
              fontSize: "22px",
              color: "var(--color-text-primary)",
              letterSpacing: "0.02em",
            }}
          >
            PROOF
          </span>
          <span
            style={{
              color: "var(--color-accent-amber)",
              fontSize: "8px",
              marginLeft: "2px",
              animation: "pulseDot 3s ease-in-out infinite",
            }}
          >
            ●
          </span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="relative group"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                transition: "color 300ms ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--color-text-primary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--color-text-secondary)")
              }
            >
              {link.label}
              <span
                className="absolute bottom-[-4px] left-0 h-[2px] w-0 group-hover:w-full transition-all duration-300"
                style={{ backgroundColor: "var(--color-accent-amber)" }}
              />
            </a>
          ))}
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-4">
          {/* Bell */}
          <div className="relative cursor-pointer">
            <Bell
              size={20}
              style={{ color: "var(--color-text-secondary)" }}
            />
            <span
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-white text-[10px] font-bold"
              style={{
                width: "16px",
                height: "16px",
                backgroundColor: "var(--color-alert)",
              }}
            >
              3
            </span>
          </div>

          {/* User avatar */}
          <div
            className="flex items-center justify-center rounded-full text-xs font-bold"
            style={{
              width: "32px",
              height: "32px",
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-card-border)",
              fontFamily: "var(--font-dm-sans)",
            }}
          >
            BH
          </div>

          {/* Tier badge */}
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider"
            style={{
              backgroundColor: "rgba(212, 146, 11, 0.15)",
              color: "var(--color-accent-amber)",
              fontFamily: "var(--font-dm-sans)",
            }}
          >
            FOUNDING
          </span>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden cursor-pointer"
          onClick={() => setMobileOpen(true)}
          style={{ color: "var(--color-text-primary)" }}
        >
          <Menu size={24} />
        </button>
      </motion.nav>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8"
            style={{
              background: "var(--color-glass)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.3 }}
          >
            <button
              className="absolute top-6 right-6 cursor-pointer"
              onClick={() => setMobileOpen(false)}
              style={{ color: "var(--color-text-primary)" }}
            >
              <X size={28} />
            </button>
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  textDecoration: "none",
                }}
              >
                {link.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

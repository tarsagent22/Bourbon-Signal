"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import WatchlistDropdown from "@/components/WatchlistDropdown";
import { useAuth } from "@/lib/auth";
import {
  useStatePreferences,
  AVAILABLE_STATES,
} from "@/lib/statePreferences";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Hunt Map", href: "/map" },
  { label: "Bottles", href: "/bottles" },
  { label: "Pricing", href: "/pricing" },
];

function StateIndicator() {
  const { selectedStates, hasSelectedStates, toggleState } =
    useStatePreferences();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-state-indicator]")) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  if (!mounted || !hasSelectedStates) return null;

  const label =
    selectedStates.length > 0 ? selectedStates.join(" · ") : "All States";

  return (
    <div
      data-state-indicator
      style={{ position: "relative" }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: selectedStates.length > 0
            ? "var(--color-accent-amber)"
            : "var(--color-text-tertiary)",
          background: "rgba(196, 148, 58, 0.06)",
          border: "1px solid rgba(196, 148, 58, 0.15)",
          borderRadius: "100px",
          padding: "4px 12px",
          cursor: "pointer",
          transition: "all 200ms ease",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              minWidth: "180px",
              background: "rgba(20, 17, 22, 0.98)",
              border: "1px solid rgba(196, 148, 58, 0.15)",
              borderRadius: "10px",
              padding: "8px",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              zIndex: 100,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-text-tertiary)",
                margin: "4px 8px 8px",
              }}
            >
              Your States
            </p>
            {AVAILABLE_STATES.map((state) => {
              const isActive = selectedStates.includes(state.code);
              const isComingSoon = "comingSoon" in state && state.comingSoon;

              return (
                <button
                  key={state.code}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isComingSoon) toggleState(state.code);
                  }}
                  disabled={!!isComingSoon}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: isActive
                      ? "rgba(196, 148, 58, 0.1)"
                      : "transparent",
                    cursor: isComingSoon ? "not-allowed" : "pointer",
                    transition: "background 150ms ease",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: isComingSoon
                      ? "var(--color-text-tertiary)"
                      : isActive
                        ? "var(--color-accent-amber)"
                        : "var(--color-text-secondary)",
                    opacity: isComingSoon ? 0.5 : 1,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {state.name}
                    {isComingSoon && (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--color-text-tertiary)",
                          background: "rgba(255,255,255,0.05)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        Soon
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "var(--color-accent-amber)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const isMapPage = pathname === "/map";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isSignedIn, memberNumber, signIn, signOut } = useAuth();

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const formattedMember = `#${String(memberNumber).padStart(3, "0")}`;

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          height: scrolled || isMapPage ? "64px" : "72px",
          background: scrolled || isMapPage ? "var(--color-glass)" : "transparent",
          backdropFilter: scrolled || isMapPage ? "blur(16px)" : "none",
          WebkitBackdropFilter: scrolled || isMapPage ? "blur(16px)" : "none",
          borderBottom: scrolled || isMapPage
            ? "1px solid rgba(212, 146, 11, 0.08)"
            : "1px solid transparent",
          transition: "all 300ms ease",
        }}
      >
        <div className="flex items-center justify-between px-8 sm:px-12 md:px-16 lg:px-24 h-full">
        {/* Logo */}
        <a href="/" className="flex items-baseline gap-0" style={{ marginLeft: "clamp(30px, 4vw, 60px)" }}>
          <span
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 700,
              fontSize: "26px",
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
          <StateIndicator />
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-5" style={{ marginRight: "10px" }}>
          {mounted && isSignedIn ? (
            <>
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--color-accent-amber)",
                  padding: "6px 14px",
                  borderRadius: "100px",
                  border: "1px solid rgba(196, 148, 58, 0.3)",
                  background: "rgba(196, 148, 58, 0.08)",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                Founding Member {formattedMember}
              </span>
              <WatchlistDropdown />
              <button
                onClick={signOut}
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "none",
                  transition: "color 300ms ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-secondary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-tertiary)")
                }
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  signIn();
                }}
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
                Sign In
              </a>
              <a
                href="/pricing"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0D0B0E",
                  textDecoration: "none",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                  transition: "opacity 300ms ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.opacity = "0.9")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.opacity = "1")
                }
              >
                Get Access
              </a>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden cursor-pointer"
          onClick={() => setMobileOpen(true)}
          style={{ color: "var(--color-text-primary)", marginRight: "5px" }}
        >
          <Menu size={24} />
        </button>
        </div>
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

            {/* Mobile state indicator */}
            <StateIndicator />

            {/* Mobile auth actions */}
            {mounted && isSignedIn ? (
              <>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-accent-amber)",
                    padding: "6px 14px",
                    borderRadius: "100px",
                    border: "1px solid rgba(196, 148, 58, 0.3)",
                    background: "rgba(196, 148, 58, 0.08)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Founding Member {formattedMember}
                </span>
                <button
                  onClick={() => {
                    signOut();
                    setMobileOpen(false);
                  }}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "18px",
                    fontWeight: 500,
                    color: "var(--color-text-tertiary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    signIn();
                    setMobileOpen(false);
                  }}
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "var(--color-accent-amber)",
                    textDecoration: "none",
                  }}
                >
                  Sign In
                </a>
                <a
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#0D0B0E",
                    textDecoration: "none",
                    padding: "12px 28px",
                    borderRadius: "6px",
                    background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                  }}
                >
                  Get Access
                </a>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

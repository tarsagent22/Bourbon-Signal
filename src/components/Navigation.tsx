"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import WatchlistDropdown from "@/components/WatchlistDropdown";
import MemberAlertsBell from "@/components/MemberAlertsBell";
import { useAuth } from "@/lib/auth";

const navLinks = [
  { label: "Drops", href: "/#drops" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Finder", href: "/finder" },
  { label: "Bottle Check", href: "/bottle-check" },
  { label: "Feedback", href: "/feedback" },
];

export default function Navigation() {
  const pathname = usePathname();
  const isMapPage = pathname === "/map" || pathname === "/finder" || pathname === "/bottle-check" || pathname === "/feedback";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, user, memberTier, signIn, signUp, signOut } = useAuth();

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [profileOpen]);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const userDisplayName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "Member";

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          height: scrolled || isMapPage ? "64px" : "72px",
          background: scrolled || isMapPage ? "var(--color-glass)" : "transparent",
          backdropFilter: scrolled || isMapPage ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled || isMapPage ? "blur(12px)" : "none",
          borderBottom: scrolled || isMapPage
            ? "1px solid rgba(212, 146, 11, 0.08)"
            : "1px solid transparent",
          transition: "all 300ms ease",
        }}
      >
        <div className="relative flex items-center justify-between px-4 sm:px-8 md:px-16 lg:px-24 h-full">
        {/* Logo */}
        <a href="/" className="flex items-baseline gap-0" style={{ marginLeft: "clamp(6px, 2.5vw, 60px)", flexShrink: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 700,
              fontSize: "clamp(20px, 5.2vw, 26px)",
              color: "var(--color-text-primary)",
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
          >
            BOURBON SIGNAL
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
        <div
          className="hidden md:flex items-center"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            gap: "clamp(14px, 1.8vw, 26px)",
          }}
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="relative group"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "clamp(12px, 0.9vw, 14px)",
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
        <div
          className="hidden md:flex items-center gap-4"
          style={{
            position: "absolute",
            right: "clamp(42px, 5vw, 96px)",
          }}
        >
          {mounted && isSignedIn ? (
            <>
              <MemberAlertsBell />

              {/* Profile avatar + dropdown */}
              <div ref={profileRef} style={{ position: "relative" }}>
                {/* Avatar button */}
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background: profileOpen ? "rgba(196,148,58,0.18)" : "transparent",
                    border: `1.5px solid ${profileOpen ? "var(--color-accent-amber)" : "rgba(196,148,58,0.5)"}`,
                    color: "var(--color-accent-amber)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 200ms ease",
                    flexShrink: 0,
                    padding: 0,
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!profileOpen) {
                      e.currentTarget.style.background = "rgba(196,148,58,0.1)";
                      e.currentTarget.style.borderColor = "var(--color-accent-amber)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!profileOpen) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "rgba(196,148,58,0.5)";
                    }
                  }}
                  aria-label="Profile menu"
                >
                  {userDisplayName.charAt(0).toUpperCase()}
                </button>

                {/* Dropdown panel */}
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      style={{
                        position: "absolute",
                        top: "calc(100% + 10px)",
                        right: 0,
                        width: "220px",
                        background: "rgba(20, 16, 12, 0.97)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        border: "1px solid rgba(196,148,58,0.15)",
                        borderTop: "2px solid var(--color-accent-amber)",
                        borderRadius: "10px",
                        boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                        overflow: "hidden",
                        zIndex: 200,
                      }}
                    >
                      {/* User info */}
                      <div style={{ padding: "16px 16px 12px" }}>
                        <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 600, color: "var(--color-cream)", marginBottom: "2px" }}>
                          {userDisplayName}
                        </p>
                        <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "11px", color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {user?.emailAddresses?.[0]?.emailAddress || ""}
                        </p>
                        {memberTier && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "8px",
                            fontFamily: "var(--font-dm-sans)",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "#0D0B0E",
                            background: "linear-gradient(135deg, var(--color-accent-amber), var(--color-accent-gold))",
                            padding: "2px 8px",
                            borderRadius: "4px",
                          }}>
                            {memberTier === "bottled-in-bond" ? "Bottled in Bond" : "Standard Proof"}
                          </span>
                        )}
                      </div>

                      {/* Divider */}
                      <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "0 12px" }} />

                      {/* Sign out */}
                      <button
                        onClick={() => { setProfileOpen(false); signOut(); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          padding: "11px 16px",
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "13px",
                          fontWeight: 400,
                          color: "var(--color-text-tertiary)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "color 150ms ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
                      >
                        Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  signUp();
                }}
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
                Create Account
              </a>
            </>
          )}
        </div>

        {/* Mobile right controls */}
        <div
          className="flex md:hidden items-center gap-[10px]"
          style={{ marginRight: "4px", flexShrink: 0 }}
        >
          {mounted && isSignedIn ? <MemberAlertsBell /> : null}
          <button
            className="cursor-pointer"
            onClick={() => setMobileOpen(true)}
            style={{
              width: "42px",
              height: "42px",
              color: "var(--color-text-primary)",
              background: "transparent",
              border: "none",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Open navigation menu"
          >
            <Menu size={28} strokeWidth={2.25} />
          </button>
        </div>
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
            }} // Overlay (full-screen modals, dropdowns)
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

            {/* Mobile auth — clean bottom section */}
            {mounted && isSignedIn ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", marginTop: "8px", paddingTop: "24px", borderTop: "1px solid rgba(196,148,58,0.15)", width: "200px" }}>
                <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                  {userDisplayName}
                </p>
                <button
                  onClick={() => { signOut(); setMobileOpen(false); }}
                  style={{
                    marginTop: "4px",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Sign out
                </button>
              </div>
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
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    signUp();
                    setMobileOpen(false);
                  }}
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
                  Create Account
                </a>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


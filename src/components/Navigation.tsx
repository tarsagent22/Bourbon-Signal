"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import WatchlistDropdown from "@/components/WatchlistDropdown";
import { useAuth } from "@/lib/auth";

const navLinks = [
  { label: "Drops", href: "/#drops" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Hunt Map", href: "/map" },
  { label: "Pricing", href: "/pricing" },
];

export default function Navigation() {
  const pathname = usePathname();
  const isMapPage = pathname === "/map";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, user, memberTier, signIn, signOut } = useAuth();

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
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-4" style={{ marginRight: "10px" }}>
          {mounted && isSignedIn ? (
            <>
              {/* Upgrade nudge — only for free tier, stays in nav */}
              {memberTier === null && (
                <a
                  href="/pricing"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-accent-amber)",
                    textDecoration: "none",
                    border: "1px solid rgba(196,148,58,0.35)",
                    borderRadius: "4px",
                    padding: "5px 12px",
                    whiteSpace: "nowrap",
                    transition: "all 200ms ease",
                    letterSpacing: "0.02em",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(196,148,58,0.08)";
                    e.currentTarget.style.borderColor = "rgba(196,148,58,0.7)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "rgba(196,148,58,0.35)";
                  }}
                >
                  Upgrade ↑
                </a>
              )}

              {/* Profile avatar + dropdown */}
              <div ref={profileRef} style={{ position: "relative" }}>
                {/* Avatar button */}
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  style={{
                    width: "36px",
                    height: "36px",
                    // Wax seal: slightly imperfect circle via clip-path polygon with 12 points
                    clipPath: "polygon(50% 0%, 61% 4%, 72% 2%, 80% 9%, 88% 14%, 95% 23%, 98% 34%, 98% 46%, 95% 57%, 88% 67%, 80% 74%, 70% 80%, 58% 84%, 46% 84%, 34% 80%, 24% 74%, 15% 66%, 7% 56%, 3% 44%, 3% 32%, 7% 21%, 15% 13%, 25% 7%, 37% 3%)",
                    background: profileOpen
                      ? "radial-gradient(circle at 38% 35%, rgba(228,185,90,0.95) 0%, rgba(196,148,58,0.92) 40%, rgba(160,112,30,0.9) 100%)"
                      : "radial-gradient(circle at 38% 35%, rgba(212,164,74,0.85) 0%, rgba(180,128,40,0.8) 45%, rgba(140,95,18,0.78) 100%)",
                    boxShadow: profileOpen
                      ? "inset 0 1px 2px rgba(255,220,100,0.3), inset 0 -1px 3px rgba(80,40,0,0.5), 0 2px 8px rgba(196,148,58,0.35)"
                      : "inset 0 1px 2px rgba(255,220,100,0.2), inset 0 -1px 3px rgba(80,40,0,0.4), 0 1px 4px rgba(0,0,0,0.4)",
                    color: "rgba(20,12,0,0.85)",
                    fontFamily: "var(--font-playfair)",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 200ms ease",
                    flexShrink: 0,
                    textShadow: "0 1px 0 rgba(255,210,80,0.4), 0 -1px 1px rgba(80,40,0,0.5)",
                    letterSpacing: "0.02em",
                    border: "none",
                    outline: "none",
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!profileOpen) {
                      e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(255,220,100,0.3), inset 0 -1px 3px rgba(80,40,0,0.5), 0 2px 10px rgba(196,148,58,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!profileOpen) {
                      e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(255,220,100,0.2), inset 0 -1px 3px rgba(80,40,0,0.4), 0 1px 4px rgba(0,0,0,0.4)";
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
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
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

                      {/* Menu items */}
                      {[
                        { label: "My Hunt Areas", href: "/dashboard", icon: "🎯" },
                      ].map((item) => (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={() => setProfileOpen(false)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "11px 16px",
                            fontFamily: "var(--font-dm-sans)",
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "var(--color-text-secondary)",
                            textDecoration: "none",
                            transition: "all 150ms ease",
                            borderLeft: "2px solid transparent",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--color-cream)";
                            e.currentTarget.style.background = "rgba(196,148,58,0.06)";
                            e.currentTarget.style.borderLeftColor = "var(--color-accent-amber)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--color-text-secondary)";
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.borderLeftColor = "transparent";
                          }}
                        >
                          <span style={{ fontSize: "14px", width: "18px", textAlign: "center" }}>{item.icon}</span>
                          {item.label}
                        </a>
                      ))}

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

            {/* Mobile auth — clean bottom section */}
            {mounted && isSignedIn ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", marginTop: "8px", paddingTop: "24px", borderTop: "1px solid rgba(196,148,58,0.15)", width: "200px" }}>
                <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                  {userDisplayName}
                </p>
                {[
                  { label: "My Hunt Areas", href: "/dashboard" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "16px",
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                      textDecoration: "none",
                    }}
                  >
                    {item.label}
                  </a>
                ))}
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

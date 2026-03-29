"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import WatchlistDropdown from "@/components/WatchlistDropdown";
import { useAuth } from "@/lib/auth";

const navLinks = [
  { label: "Drops", href: "/#drops" },
  { label: "Bottles", href: "/bottles" },
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
  const { isSignedIn, user, memberTier, signIn, signOut } = useAuth();

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
        <div className="hidden md:flex items-center gap-5" style={{ marginRight: "10px" }}>
          {mounted && isSignedIn ? (
            <>
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                {userDisplayName}
              </span>
              {/* Upgrade nudge for free (unsubscribed) members */}
              {memberTier === null && (
                <a
                  href="/pricing"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-accent-amber)",
                    textDecoration: "none",
                    border: "1px solid rgba(196,148,58,0.4)",
                    borderRadius: "4px",
                    padding: "4px 10px",
                    whiteSpace: "nowrap",
                    transition: "all 200ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(196,148,58,0.1)";
                    e.currentTarget.style.borderColor = "rgba(196,148,58,0.8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "rgba(196,148,58,0.4)";
                  }}
                >
                  Upgrade ↑
                </a>
              )}
              <WatchlistDropdown />
              <button
                onClick={() => signOut()}
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

            {/* Mobile auth actions */}
            {mounted && isSignedIn ? (
              <>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {userDisplayName}
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

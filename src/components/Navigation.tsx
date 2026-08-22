"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CircleUserRound, Menu, Plus, Radar, Radio, Wine, X } from "lucide-react";
import WatchlistDropdown from "@/components/WatchlistDropdown";
import MemberAlertsBell from "@/components/MemberAlertsBell";
import { useAuth } from "@/lib/auth";
import { controlRoomNavVisibleForUser } from "@/lib/control-room-nav-access";
import {
  MEMBER_NAVIGATION_LINKS,
  PUBLIC_NAVIGATION_LINKS,
  memberNavigationActiveKey,
  type MemberNavigationKey,
} from "@/lib/member-navigation";

const MEMBER_NAVIGATION_ICONS = {
  signals: Radio,
  radar: Radar,
  post: Plus,
  cellar: Wine,
  hq: CircleUserRound,
} satisfies Record<MemberNavigationKey, typeof Radio>;

export default function Navigation() {
  const pathname = usePathname();
  const isGlassPage = pathname === "/bottle-check" || pathname === "/coverage" || pathname === "/sightings" || pathname === "/pricing";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentSearch, setCurrentSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { isLoaded, isSignedIn, user, signIn, signOut, memberTier, entitlements, memberNumber } = useAuth();


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
    setCurrentSearch(window.location.search);
    const handleScroll = () => setScrolled(window.scrollY > 50);
    const handleNavigation = () => setCurrentSearch(window.location.search);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("member-navigation-change", handleNavigation);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("popstate", handleNavigation);
      window.removeEventListener("member-navigation-change", handleNavigation);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !isSignedIn) {
      document.body.classList.remove("has-member-mobile-navigation");
      return;
    }
    document.body.classList.add("has-member-mobile-navigation");
    return () => document.body.classList.remove("has-member-mobile-navigation");
  }, [isSignedIn, mounted]);

  const userDisplayName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "Member";
  const isFounderMember = memberTier === "bottled-in-bond";
  const canSeeControlRoomNav = mounted && isSignedIn && controlRoomNavVisibleForUser(user);
  const founderProfileNumber = memberNumber ? `#${String(memberNumber).padStart(3, "0")}` : "#xxx";
  const availablePublicNavLinks = PUBLIC_NAVIGATION_LINKS.filter((link) => {
    if (link.href === "/dashboard") return entitlements.canAccessDashboard;
    return true;
  });
  const visibleNavLinks = !isLoaded
    ? []
    : isSignedIn
      ? MEMBER_NAVIGATION_LINKS
      : memberTier === "bottled-in-bond"
        ? availablePublicNavLinks
        : [...availablePublicNavLinks, { label: "Pricing", href: "/pricing" }];
  const mobileOverlayLinks = !isLoaded
    ? []
    : isSignedIn
      ? [
          { label: "Bottle Check", href: "/bottle-check" },
          { label: "Coverage", href: "/coverage" },
          ...(memberTier === "bottled-in-bond" ? [] : [{ label: "Upgrade", href: "/pricing" }]),
        ]
      : visibleNavLinks;
  const activeMemberNavigationKey = mounted ? memberNavigationActiveKey(pathname, currentSearch) : null;

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          height: scrolled || isGlassPage ? "64px" : "72px",
          background: scrolled || isGlassPage ? "var(--color-glass)" : "transparent",
          backdropFilter: scrolled || isGlassPage ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled || isGlassPage ? "blur(12px)" : "none",
          borderBottom: scrolled || isGlassPage
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
          {visibleNavLinks.map((link) => {
            const memberKey = "key" in link ? link.key : null;
            if (!memberKey) {
              return (
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
                  onMouseEnter={(event) => (event.currentTarget.style.color = "var(--color-text-primary)")}
                  onMouseLeave={(event) => (event.currentTarget.style.color = "var(--color-text-secondary)")}
                >
                  {link.label}
                  <span className="absolute bottom-[-4px] left-0 h-[2px] w-0 group-hover:w-full transition-all duration-300" style={{ backgroundColor: "var(--color-accent-amber)" }} />
                </a>
              );
            }
            const active = memberKey === activeMemberNavigationKey;
            const emphasized = "emphasis" in link && link.emphasis;
            return (
              <a
                key={link.label}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative group member-navigation-link ${emphasized ? "member-navigation-post" : ""}`}
                data-active={active}
              >
                {link.label}
                {!emphasized ? <span className="member-navigation-underline" aria-hidden /> : null}
              </a>
            );
          })}
          {canSeeControlRoomNav ? (
            <a
              href="/admin/control-room"
              className="relative group"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "clamp(12px, 0.9vw, 14px)",
                fontWeight: 600,
                color: "var(--color-accent-amber)",
                textDecoration: "none",
                transition: "color 300ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-accent-amber)")}
            >
              Control Room
              <span
                className="absolute bottom-[-4px] left-0 h-[2px] w-0 group-hover:w-full transition-all duration-300"
                style={{ backgroundColor: "var(--color-accent-amber)" }}
              />
            </a>
          ) : null}
        </div>

        {/* Right side */}
        <div
          className="hidden md:flex items-center gap-4"
          style={{
            position: "absolute",
            right: "clamp(42px, 5vw, 96px)",
          }}
        >
          {mounted && isLoaded ? (isSignedIn ? (
            <>
              <MemberAlertsBell />

              {/* Profile avatar + dropdown */}
              <div ref={profileRef} style={{ position: "relative" }}>
                {/* Avatar button */}
                <button
                  className="member-profile-trigger"
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
                  {isFounderMember ? (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        right: "-4px",
                        bottom: "-4px",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        background: "linear-gradient(135deg, #E8C97A, #A66A18)",
                        border: "1px solid rgba(13,11,7,0.9)",
                        boxShadow: "0 0 14px rgba(232,201,122,0.34)",
                        color: "#0D0B07",
                        fontSize: "9px",
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      B
                    </span>
                  ) : null}
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
                      </div>

                      {isFounderMember ? (
                        <div style={{ margin: "0 12px 12px", borderRadius: "14px", border: "1px solid rgba(232,201,122,0.24)", background: "linear-gradient(135deg, rgba(196,148,58,0.16), rgba(245,237,214,0.045))", padding: "12px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                            <span style={{ fontFamily: "var(--font-playfair)", fontSize: "18px", color: "var(--color-cream)", lineHeight: 1 }}>Founder {founderProfileNumber}</span>
                            <span style={{ width: "24px", height: "24px", borderRadius: "999px", display: "grid", placeItems: "center", background: "linear-gradient(135deg, #E8C97A, #A66A18)", color: "#0D0B07", fontFamily: "var(--font-jetbrains)", fontSize: "12px", fontWeight: 950, boxShadow: "0 0 18px rgba(232,201,122,0.22)" }}>B</span>
                          </div>
                        </div>
                      ) : null}

                      {/* Divider */}
                      <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "0 12px" }} />

                      <a
                        href="/settings"
                        onClick={() => setProfileOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          padding: "11px 16px",
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--color-text-secondary)",
                          textDecoration: "none",
                          transition: "color 150ms ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-cream)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
                      >
                        Manage Account
                      </a>

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
                href="/pricing?source=site-nav-desktop-try-free"
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
                Try free
              </a>
            </>
          )
          ) : null}
        </div>

        {/* Mobile right controls */}
        <div
          className="flex md:hidden items-center gap-[10px]"
          style={{ marginRight: "4px", flexShrink: 0 }}
        >
          {mounted && isLoaded && isSignedIn ? <MemberAlertsBell /> : null}
          {mounted && isLoaded ? <button
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
          </button> : null}
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
            {mobileOverlayLinks.map((link) => (
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
                {isFounderMember ? (
                  <div style={{ borderRadius: 999, border: "1px solid rgba(232,201,122,0.28)", background: "rgba(232,201,122,0.10)", color: "#E8C97A", padding: "6px 10px", fontFamily: "var(--font-jetbrains)", fontSize: "10px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                    Founder {founderProfileNumber}
                  </div>
                ) : null}
                <a
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--color-accent-amber)",
                    textDecoration: "none",
                    marginBottom: "4px",
                  }}
                >
                  Manage Account
                </a>

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
                  href="/pricing?source=site-nav-mobile-try-free"
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
                  Try free
                </a>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {mounted && isSignedIn ? (
        <nav className="member-mobile-navigation" aria-label="Member navigation">
          {MEMBER_NAVIGATION_LINKS.map((link) => {
            const Icon = MEMBER_NAVIGATION_ICONS[link.key];
            const active = activeMemberNavigationKey === link.key;
            return (
              <a
                key={link.key}
                href={link.href}
                className={link.emphasis ? "member-mobile-link member-navigation-post" : "member-mobile-link"}
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <span className="member-mobile-icon" aria-hidden><Icon size={link.emphasis ? 21 : 19} strokeWidth={link.emphasis ? 2.7 : 2} /></span>
                <span>{link.label}</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      <style jsx global>{`
        .member-navigation-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          min-height: 38px;
          font-family: var(--font-dm-sans);
          font-size: clamp(12px, 0.9vw, 14px);
          font-weight: 600;
          color: var(--color-text-secondary);
          text-decoration: none;
          transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
        }
        .member-navigation-link:hover,
        .member-navigation-link[data-active="true"] { color: var(--color-cream); }
        .member-navigation-link:focus-visible {
          color: var(--color-cream);
          outline: 2px solid var(--color-accent-amber);
          outline-offset: 4px;
          border-radius: 4px;
        }
        .member-navigation-underline {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 2px;
          height: 1px;
          background: var(--color-accent-amber);
          opacity: 0;
          transform: scaleX(0.55);
          transition: opacity 180ms ease, transform 180ms ease;
        }
        .member-navigation-link:hover .member-navigation-underline,
        .member-navigation-link:focus-visible .member-navigation-underline,
        .member-navigation-link[data-active="true"] .member-navigation-underline { opacity: 1; transform: scaleX(1); }
        .member-navigation-link.member-navigation-post {
          min-height: 34px;
          border: 1px solid rgba(232,201,122,0.38);
          border-radius: 999px;
          background: rgba(196,148,58,0.12);
          padding: 7px 14px;
          color: var(--color-accent-amber);
          font-weight: 850;
        }
        .member-navigation-link.member-navigation-post:hover,
        .member-navigation-link.member-navigation-post:focus-visible,
        .member-navigation-link.member-navigation-post[data-active="true"] {
          border-color: rgba(232,201,122,0.65);
          background: rgba(196,148,58,0.2);
          color: var(--color-cream);
        }
        .member-profile-trigger:focus-visible {
          outline: 2px solid var(--color-accent-amber);
          outline-offset: 4px;
        }
        .member-mobile-navigation { display: none; }
        @media (max-width: 767px) {
          body.has-member-mobile-navigation {
            --member-mobile-navigation-inset: calc(72px + env(safe-area-inset-bottom));
            padding-bottom: var(--member-mobile-navigation-inset);
          }
          .member-mobile-navigation {
            position: fixed;
            z-index: 55;
            left: 0;
            right: 0;
            bottom: 0;
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            min-height: calc(64px + env(safe-area-inset-bottom));
            border-top: 1px solid rgba(245,237,214,0.09);
            background: rgba(10,8,6,0.96);
            box-shadow: 0 -14px 34px rgba(0,0,0,0.34);
            padding: 4px 6px env(safe-area-inset-bottom);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
          }
          .member-mobile-link {
            min-width: 0;
            min-height: 56px;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 3px;
            border-radius: 12px;
            color: rgba(245,237,214,0.64);
            font-family: var(--font-dm-sans);
            font-size: 10px;
            font-weight: 750;
            line-height: 1;
            text-decoration: none;
            -webkit-tap-highlight-color: transparent;
          }
          .member-mobile-link[data-active="true"] { color: var(--color-cream); }
          .member-mobile-link:focus-visible { outline: 2px solid var(--color-accent-amber); outline-offset: -2px; }
          .member-mobile-icon { min-height: 24px; display: grid; place-items: center; }
          .member-mobile-link.member-navigation-post { color: var(--color-accent-amber); }
          .member-mobile-link.member-navigation-post .member-mobile-icon {
            width: 38px;
            height: 38px;
            margin-top: -12px;
            border: 1px solid rgba(245,237,214,0.28);
            border-radius: 999px;
            background: linear-gradient(135deg, #C4943A, #E8C97A);
            box-shadow: 0 8px 22px rgba(0,0,0,0.35);
            color: #100c08;
          }
        }
      `}</style>
    </>
  );
}


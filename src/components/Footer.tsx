"use client";

const footerLinks = [
  { label: "FAQ", href: "/#faq" },
  { label: "Release Radar", href: "/release-radar" },
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Disclaimer", href: "/legal/disclaimer" },
  { label: "Retailer Login", href: "/retailers/login" },
  { label: "Support", href: "mailto:support@bourbonsignal.com?subject=Bourbon%20Signal%20Support" },
];

const socialLinks = [
  { label: "Facebook group", href: "https://www.facebook.com/share/g/1BTYhwxSwC/?mibextid=wwXIfr", icon: FacebookIcon },
  { label: "Instagram", href: "https://www.instagram.com/bourbonsignal", icon: InstagramIcon },
];

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="currentColor">
      <path d="M13.7 22v-8.55h2.88l.43-3.34H13.7V7.98c0-.97.27-1.63 1.66-1.63h1.77V3.37c-.31-.04-1.36-.13-2.58-.13-2.55 0-4.3 1.56-4.3 4.42v2.45H7.37v3.34h2.88V22h3.45Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SocialLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav
      aria-label="Social media"
      className={`${mobile ? "flex md:hidden" : "hidden md:flex"} items-center justify-center gap-3`}
    >
      {socialLinks.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
            className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-300"
            style={{
              borderColor: "rgba(245, 237, 214, 0.2)",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = "var(--color-text-primary)";
              event.currentTarget.style.borderColor = "rgba(196, 148, 58, 0.7)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = "var(--color-text-secondary)";
              event.currentTarget.style.borderColor = "rgba(245, 237, 214, 0.2)";
            }}
          >
            <Icon />
          </a>
        );
      })}
    </nav>
  );
}

export default function Footer() {
  return (
    <footer
      id="site-footer"
      style={{
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      {/* Secondary surface → footer transition */}
      <div style={{ height: 32, background: "linear-gradient(to bottom, var(--color-bg-secondary) 0%, var(--color-bg-primary) 100%)" }} />
      <div className="py-6" style={{ paddingLeft: "clamp(30px, 4vw, 60px)", paddingRight: "clamp(30px, 4vw, 60px)" }}>
        {/* Top row: logo left (matching nav), links + copyright centered */}
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Mobile social row — centered in the breathing room above the footer mark. */}
          <SocialLinks mobile />

          {/* Logo — same margin as nav logo */}
          <div className="flex items-baseline gap-0 md:mr-auto" style={{ paddingLeft: "0" }}>
            <span
              style={{
                fontFamily: "var(--font-playfair)",
                fontWeight: 700,
                fontSize: "20px",
                color: "var(--color-text-primary)",
              }}
            >
              BOURBON SIGNAL
            </span>
            <span
              style={{
                color: "var(--color-accent-amber)",
                fontSize: "8px",
                marginLeft: "2px",
              }}
            >
              ●
            </span>
          </div>

          {/* Center: links */}
          <nav className="flex w-full items-center justify-center gap-4 md:w-auto md:gap-6" style={{ margin: "0 auto", flexWrap: "wrap" }}>
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors duration-300"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-secondary)")
                }
              >
                {link.label}
              </a>
            ))}
          </nav>

          <SocialLinks />

          {/* Right: copyright (mirrors logo width for balance) */}
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
              paddingRight: "0",
            }}
          >
            © 2026 Todd Digital Ventures LLC
          </p>
        </div>

      </div>
    </footer>
  );
}

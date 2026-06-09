"use client";

const footerLinks = [
  { label: "How It Works", href: "/#how-we-hunt" },
  { label: "FAQ", href: "/#faq" },
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Refunds", href: "/legal/refunds" },
  { label: "Disclaimer", href: "/legal/disclaimer" },
  { label: "Support", href: "mailto:support@bourbonsignal.com?subject=Bourbon%20Signal%20Support" },
];

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      {/* EmailCapture (secondary) → Footer (primary) transition */}
      <div style={{ height: 32, background: "linear-gradient(to bottom, var(--color-bg-secondary) 0%, var(--color-bg-primary) 100%)" }} />
      <div className="py-6" style={{ paddingLeft: "clamp(30px, 4vw, 60px)", paddingRight: "clamp(30px, 4vw, 60px)" }}>
        {/* Top row: logo left (matching nav), links + copyright centered */}
        <div className="flex flex-col md:flex-row items-center gap-4">
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
          <nav className="flex items-center justify-center gap-4 md:gap-6" style={{ margin: "0 auto", flexWrap: "wrap" }}>
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

          {/* Right: copyright (mirrors logo width for balance) */}
          <p
            className="md:ml-auto"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
              paddingRight: "0",
            }}
          >
            © 2026 Bourbon Signal
          </p>
        </div>

        {/* Bottom tagline + disclaimer centered */}
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            fontStyle: "italic",
            color: "var(--color-text-secondary)",
            textAlign: "center",
            marginTop: "16px",
          }}
        >
          Built by bourbon hunters, for bourbon hunters.
        </p>

      </div>
    </footer>
  );
}

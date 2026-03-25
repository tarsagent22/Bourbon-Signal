"use client";

const footerLinks = [
  { label: "How It Works", href: "/#how-we-hunt" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
  { label: "Support", href: "#" },
];

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      {/* CTA row */}
      <div
        style={{
          borderTop: "1px solid var(--color-card-border)",
          padding: "48px clamp(20px, 5vw, 48px)",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "28px",
            fontWeight: 700,
            color: "var(--color-cream)",
            marginBottom: "10px",
          }}
        >
          Ready to hunt?
        </h3>
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "14px",
            color: "var(--color-text-secondary)",
            marginBottom: "24px",
          }}
        >
          Join the founding members getting first access to every drop.
        </p>
        <a
          href="/pricing"
          style={{
            display: "inline-block",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "15px",
            fontWeight: 600,
            color: "#1A1510",
            background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
            border: "none",
            borderRadius: "10px",
            padding: "13px 32px",
            textDecoration: "none",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(196,148,58,0.3)",
            transition: "box-shadow 300ms, transform 300ms",
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
          View Pricing
        </a>
      </div>

      <div className="py-6" style={{ paddingLeft: "clamp(30px, 4vw, 60px)", paddingRight: "clamp(30px, 4vw, 60px)" }}>
        {/* Top row: logo left (matching nav), links + copyright centered */}
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Logo — same margin as nav logo */}
          <div className="flex items-baseline gap-0 md:mr-auto" style={{ paddingLeft: "32px" }}>
            <span
              style={{
                fontFamily: "var(--font-playfair)",
                fontWeight: 700,
                fontSize: "20px",
                color: "var(--color-text-primary)",
              }}
            >
              PROOF
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
          <nav className="flex items-center gap-6" style={{ margin: "0 auto" }}>
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
              paddingRight: "32px",
            }}
          >
            © 2026 Proof
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
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            marginTop: "8px",
          }}
        >
          Data sourced from state liquor control board public records
        </p>
      </div>
    </footer>
  );
}

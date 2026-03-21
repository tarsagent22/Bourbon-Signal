"use client";

const footerLinks = [
  { label: "Features", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#" },
  { label: "Contact", href: "#" },
];

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderTop: "1px solid var(--color-card-border)",
      }}
    >
      <div className="mx-auto max-w-6xl px-8 md:px-16 lg:px-24 py-6">
        {/* Desktop: single row. Mobile: stacked center */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-baseline gap-0">
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

          {/* Links */}
          <nav className="flex items-center gap-6">
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

          {/* Copyright */}
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
            }}
          >
            © 2026 Proof
          </p>
        </div>

        {/* Data disclaimer */}
        <p
          className="text-center mt-4"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
          }}
        >
          Data sourced from state liquor control board public records
        </p>
      </div>
    </footer>
  );
}

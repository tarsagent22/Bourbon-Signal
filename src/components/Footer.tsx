"use client";

import { Instagram, Twitter } from "lucide-react";

const productLinks = [
  { label: "Dashboard", href: "#" },
  { label: "Hunt Map", href: "#" },
  { label: "Bottles", href: "#" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "Contact", href: "#" },
  { label: "Support", href: "#" },
];

// Simple Reddit icon since Lucide doesn't have one
function RedditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderTop: "1px solid var(--color-card-border)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 sm:px-8 md:px-16 lg:px-24 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12">
          {/* Col 1: Logo + description + social */}
          <div>
            <div className="flex items-baseline gap-0 mb-4">
              <span
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontWeight: 700,
                  fontSize: "22px",
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
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                lineHeight: 1.6,
                color: "var(--color-text-secondary)",
              }}
            >
              Real-time bourbon intelligence for serious hunters.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <a
                href="#"
                className="transition-colors duration-300"
                style={{ color: "var(--color-text-tertiary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--color-accent-amber)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-tertiary)")
                }
              >
                <Instagram size={20} />
              </a>
              <a
                href="#"
                className="transition-colors duration-300"
                style={{ color: "var(--color-text-tertiary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--color-accent-amber)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-tertiary)")
                }
              >
                <Twitter size={20} />
              </a>
              <a
                href="#"
                className="transition-colors duration-300"
                style={{ color: "var(--color-text-tertiary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--color-accent-amber)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--color-text-tertiary)")
                }
              >
                <RedditIcon />
              </a>
            </div>
          </div>

          {/* Col 2: Product links */}
          <div>
            <h4
              className="mb-4 uppercase tracking-wider"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 500,
                letterSpacing: "0.08em",
                color: "var(--color-text-tertiary)",
              }}
            >
              Product
            </h4>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="transition-colors duration-300"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      color: "var(--color-text-secondary)",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color =
                        "var(--color-text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color =
                        "var(--color-text-secondary)")
                    }
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Legal links */}
          <div>
            <h4
              className="mb-4 uppercase tracking-wider"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 500,
                letterSpacing: "0.08em",
                color: "var(--color-text-tertiary)",
              }}
            >
              Legal
            </h4>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="transition-colors duration-300"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      color: "var(--color-text-secondary)",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color =
                        "var(--color-text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color =
                        "var(--color-text-secondary)")
                    }
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="border-t px-6 sm:px-8 md:px-16 lg:px-24 py-5"
        style={{ borderColor: "var(--color-card-border)" }}
      >
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-3">
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
            }}
          >
            © 2026 Proof. Built by bourbon hunters, for bourbon hunters.
          </p>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
            }}
          >
            Data sourced from state liquor control board public records
          </p>
        </div>
      </div>
    </footer>
  );
}

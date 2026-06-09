import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

type LegalSection = {
  heading: string;
  body: Array<string | { label: string; text: string }>;
};

interface LegalPageProps {
  title: string;
  eyebrow?: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export default function LegalPage({ title, eyebrow = "Legal", updated, intro, sections }: LegalPageProps) {
  return (
    <>
      <Navigation />
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, var(--color-bg-primary) 0%, var(--color-bg-warm) 100%)",
          color: "var(--color-text-primary)",
          padding: "116px 20px 72px",
        }}
      >
        <article style={{ maxWidth: 860, margin: "0 auto" }}>
          <p
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--color-accent-amber)",
              marginBottom: 14,
            }}
          >
            {eyebrow}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(40px, 8vw, 72px)",
              lineHeight: 0.95,
              letterSpacing: "-0.045em",
              marginBottom: 18,
            }}
          >
            {title}
          </h1>
          <p style={{ color: "var(--color-text-tertiary)", fontSize: 14, marginBottom: 24 }}>
            Last updated: {updated}
          </p>
          <p
            style={{
              fontSize: "clamp(17px, 2.4vw, 21px)",
              lineHeight: 1.65,
              color: "var(--color-text-secondary)",
              maxWidth: 760,
              marginBottom: 42,
            }}
          >
            {intro}
          </p>

          <div style={{ display: "grid", gap: 28 }}>
            {sections.map((section) => (
              <section
                key={section.heading}
                style={{
                  border: "1px solid rgba(212,146,11,0.14)",
                  background: "rgba(255,255,255,0.035)",
                  borderRadius: 18,
                  padding: "clamp(22px, 4vw, 34px)",
                  boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(24px, 4vw, 34px)",
                    lineHeight: 1.08,
                    marginBottom: 16,
                  }}
                >
                  {section.heading}
                </h2>
                <div style={{ display: "grid", gap: 14 }}>
                  {section.body.map((item, index) => {
                    if (typeof item === "string") {
                      return (
                        <p key={index} style={{ color: "var(--color-text-secondary)", lineHeight: 1.72, fontSize: 15 }}>
                          {item}
                        </p>
                      );
                    }
                    return (
                      <p key={index} style={{ color: "var(--color-text-secondary)", lineHeight: 1.72, fontSize: 15 }}>
                        <strong style={{ color: "var(--color-text-primary)" }}>{item.label}</strong> {item.text}
                      </p>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div
            style={{
              marginTop: 34,
              padding: "18px 20px",
              borderRadius: 14,
              background: "rgba(212,146,11,0.08)",
              border: "1px solid rgba(212,146,11,0.18)",
              color: "var(--color-text-secondary)",
              fontSize: 14,
              lineHeight: 1.65,
            }}
          >
            Questions about these terms? Contact Bourbon Signal support at{" "}
            <a href="mailto:support@bourbonsignal.com" style={{ color: "var(--color-accent-gold)" }}>
              support@bourbonsignal.com
            </a>
            .
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}

"use client";

export default function CoverageError({ reset }: { reset: () => void }) {
  return (
    <main style={{ minHeight: "100vh", background: "var(--color-bg-primary)", padding: "132px 20px 80px", color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)" }}>
      <section style={{ width: "min(680px, 100%)", margin: "0 auto", border: "1px solid rgba(196,148,58,0.22)", padding: "28px" }}>
        <p style={{ margin: 0, color: "var(--color-accent-amber)", fontFamily: "var(--font-jetbrains)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coverage desk unavailable</p>
        <h1 style={{ margin: "14px 0 0", color: "var(--color-text-primary)", fontFamily: "var(--font-playfair)", fontSize: "42px" }}>The source map could not be read.</h1>
        <p>Try again in a moment. We will not replace missing source truth with guessed coverage.</p>
        <button type="button" onClick={reset} style={{ border: 0, background: "var(--color-accent-amber)", padding: "11px 15px", color: "var(--color-bg-primary)", fontWeight: 800, cursor: "pointer" }}>Try again</button>
      </section>
    </main>
  );
}

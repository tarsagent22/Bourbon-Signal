export default function CoverageLoading() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--color-bg-primary)", padding: "132px 20px 80px", color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", border: "1px solid rgba(196,148,58,0.16)", padding: "28px" }}>
        <p style={{ margin: 0, color: "var(--color-accent-amber)", fontFamily: "var(--font-jetbrains)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coverage</p>
        <h1 style={{ margin: "14px 0 0", color: "var(--color-text-primary)", fontFamily: "var(--font-playfair)", fontSize: "clamp(38px, 7vw, 68px)" }}>Loading available information…</h1>
      </div>
    </main>
  );
}

"use client";

export default function SectionDivider() {
  return (
    <div className="w-full h-px relative">
      <div
        className="absolute inset-0"
        style={{ background: "var(--color-card-border)" }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-32 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(212, 146, 11, 0.3), transparent)",
        }}
      />
    </div>
  );
}

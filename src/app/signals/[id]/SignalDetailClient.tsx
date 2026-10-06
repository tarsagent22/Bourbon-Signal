"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import HuntOutcomePrompt from "@/components/signals/HuntOutcomePrompt";
import CommunitySafetyControls from "@/components/signals/CommunitySafetyControls";
import { createSignalApiClient } from "@/lib/signals/signal-api-client";
import type { SignalDetailResponse } from "@/lib/signals/signal-api-contract";

export default function SignalDetailClient({ signalId }: { signalId: string }) {
  const api = useMemo(() => createSignalApiClient({ baseUrl: globalThis.location?.origin || "http://localhost" }), []);
  const [detail, setDetail] = useState<SignalDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [hidden,setHidden]=useState(false);

  useEffect(() => {
    let active = true;
    api.getSignal(signalId).then((response) => {
      if (active) setDetail(response);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "This Signal is temporarily unavailable.");
    });
    return () => { active = false; };
  }, [api, signalId]);

  const signal = detail?.signal;
  const store = signal?.location.store;
  const location = store
    ? [store.name, store.address, store.city, store.state, store.zip].filter(Boolean).join(" · ")
    : signal?.location.label || signal?.location.state || "Location not specified";

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
      <Navigation />
      <main style={{ width: "min(760px, calc(100% - 32px))", margin: "0 auto", padding: "120px 0 72px" }}>
        <Link href="/#drops" style={{ color: "var(--color-accent-amber)", fontFamily: "var(--font-dm-sans)", fontSize: 13, textDecoration: "none" }}>← Back to Signals</Link>
        {!signal && !error ? <p style={{ color: "var(--color-text-secondary)", marginTop: 28 }}>Loading Signal…</p> : null}
        {error ? <p role="alert" style={{ color: "#D77A61", marginTop: 28 }}>{error}</p> : null}
        {hidden ? <p role="status">This Community post is hidden. <Link href="/community-safety">Manage blocked members</Link></p> : null}
        {signal && !hidden ? (
          <article style={{ marginTop: 24, border: "1px solid rgba(245,237,214,0.10)", borderRadius: 22, background: "linear-gradient(180deg, rgba(31,24,17,0.94), rgba(14,11,8,0.98))", boxShadow: "0 20px 60px rgba(0,0,0,0.32)", padding: "clamp(20px, 4vw, 34px)" }}>
            <p style={{ margin: 0, color: "var(--color-accent-amber)", fontFamily: "var(--font-jetbrains)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>{signal.source.label}</p>
            <h1 style={{ margin: "8px 0 18px", color: "var(--color-cream)", fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 6vw, 48px)" }}>{signal.bottle.name}</h1>
            <dl style={{ display: "grid", gap: 14, margin: 0 }}>
              <Detail label="Location" value={location} />
              <Detail label="Timing" value={new Date(signal.timing.displayAt).toLocaleString()} />
              {signal.availability?.label ? <Detail label="Availability" value={signal.availability.label} /> : null}
              {typeof signal.availability?.price === "number" ? <Detail label="Price" value={`$${signal.availability.price.toFixed(2)}`} /> : null}
              {signal.evidence.summary ? <Detail label="Evidence" value={signal.evidence.summary} /> : null}
              {signal.availability?.caveat ? <Detail label="Before you go" value={signal.availability.caveat} /> : null}
            </dl>
            <HuntOutcomePrompt signalId={signal.id} signal={{ kind: signal.kind, displayAt: signal.timing.displayAt, expiresAt: signal.timing.expiresAt }} />
            {signal.evidence.photoUrl ? <img src={signal.evidence.photoUrl} alt="Member sighting photo approved for public display" style={{width:'100%',maxHeight:400,objectFit:'contain'}} /> : null}
            {signal.source.type === 'member' ? <CommunitySafetyControls signalId={signal.id} onHidden={()=>setHidden(true)} /> : null}
          </article>
        ) : null}
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "grid", gap: 3 }}><dt style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-jetbrains)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</dt><dd style={{ margin: 0, color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)", lineHeight: 1.55 }}>{value}</dd></div>;
}

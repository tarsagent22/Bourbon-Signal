"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

const EXCLUDED_PATHS = ["/welcome", "/sign-in", "/sign-up", "/checkout", "/gift", "/retailers", "/admin"];

export default function LegacyMemberSetupPrompt() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const excluded = EXCLUDED_PATHS.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    setVisible(false);
    if (!isLoaded || !isSignedIn || !user?.id || excluded) return;
    const controller = new AbortController();
    void fetch("/api/user/legacy-setup", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ needsSetup?: boolean }> : null)
      .then((payload) => { if (!controller.signal.aborted) setVisible(payload?.needsSetup === true); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [excluded, isLoaded, isSignedIn, user?.id]);

  async function dismiss() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/user/legacy-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (response.ok) setVisible(false);
    } finally {
      setPending(false);
    }
  }

  if (!visible) return null;
  return (
    <aside aria-label="Finish your Bourbon Signal setup" style={wrap}>
      <button type="button" aria-label="Not now" onClick={dismiss} disabled={pending} style={close}><X size={17} /></button>
      <div style={icon}><MapPin size={21} aria-hidden="true" /></div>
      <div style={copy}>
        <strong style={title}>Where do you hunt?</strong>
        <span style={description}>Choose your home state to see current coverage and tell us which stores or areas matter.</span>
      </div>
      <div style={actions}>
        <Link href="/welcome?legacy=1&source=legacy-setup-prompt" style={primary}>Finish setup</Link>
        <button type="button" onClick={dismiss} disabled={pending} style={secondary}>{pending ? "Saving…" : "Not now"}</button>
      </div>
    </aside>
  );
}

const wrap: React.CSSProperties = { position: "fixed", zIndex: 80, right: 18, bottom: "calc(18px + var(--member-mobile-navigation-inset, 0px))", width: "min(430px, calc(100vw - 36px))", display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 12, padding: "18px 18px 16px", border: "1px solid rgba(212,146,11,.42)", borderRadius: 16, background: "linear-gradient(145deg, rgba(28,22,15,.98), rgba(15,12,9,.99))", boxShadow: "0 22px 65px rgba(0,0,0,.55)", color: "#f7f0e0" };
const close: React.CSSProperties = { position: "absolute", top: 9, right: 9, display: "grid", placeItems: "center", width: 29, height: 29, padding: 0, border: 0, borderRadius: 8, background: "transparent", color: "#aa9d88", cursor: "pointer" };
const icon: React.CSSProperties = { display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: "rgba(212,146,11,.14)", color: "#e1a93c" };
const copy: React.CSSProperties = { display: "grid", gap: 5, paddingRight: 24 };
const title: React.CSSProperties = { fontFamily: "var(--font-fraunces), Georgia, serif", fontSize: 20, lineHeight: 1.2 };
const description: React.CSSProperties = { color: "#cfc4b2", fontSize: 13, lineHeight: 1.5 };
const actions: React.CSSProperties = { gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, marginTop: 2 };
const primary: React.CSSProperties = { display: "inline-flex", justifyContent: "center", padding: "10px 15px", borderRadius: 9, background: "#d4920b", color: "#171009", fontSize: 13, fontWeight: 800, textDecoration: "none" };
const secondary: React.CSSProperties = { padding: "9px 5px", border: 0, background: "transparent", color: "#b9ad9a", fontSize: 12, fontWeight: 700, cursor: "pointer" };
